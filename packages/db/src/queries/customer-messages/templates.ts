import {
  type CustomerMessageEventKey,
  customerMessageEvents,
  resolveEffectiveMessageTemplate,
  validateCustomerMessageTemplate,
} from "@ewatrade/customer-messages"
import type {
  CustomerMessageTemplate,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import { accountPrivacyPrivateWritesAllowed } from "../account-privacy-private-write"
import {
  CustomerMessageError,
  type CustomerMessageScope,
  customerMessageScope,
  customerMessageTransactionOptions,
} from "./scope"

export function messageTemplateView(row: CustomerMessageTemplate) {
  return {
    id: row.id,
    eventKey: row.eventKey as CustomerMessageEventKey,
    body: row.body,
    enabled: row.enabled,
    revision: row.revision,
    scopeKey: row.scopeKey,
    source: row.source,
    updatedAt: row.updatedAt,
  }
}

export async function readMessageTemplates(
  tx: Prisma.TransactionClient,
  input: CustomerMessageScope,
) {
  const rows = await tx.customerMessageTemplate.findMany({
    where: {
      tenantId: input.tenantId,
      scopeKey: { in: ["business", `store:${input.storeId}`] },
    },
    orderBy: [{ eventKey: "asc" }, { scopeKey: "asc" }],
  })
  return rows.map(messageTemplateView)
}

export function messageTemplateStatuses(
  templates: ReturnType<typeof messageTemplateView>[],
  storeId: string,
) {
  return customerMessageEvents.map(({ key }) => {
    const effective = resolveEffectiveMessageTemplate(templates, storeId, key)
    const template =
      templates.find(
        (row) =>
          row.eventKey === key && row.scopeKey === effective.template?.scopeKey,
      ) ?? null
    return {
      eventKey: key,
      state: effective.state,
      scope: effective.scope,
      revision: template?.revision ?? 0,
      templateId: template?.id ?? null,
    }
  })
}

export async function listCustomerMessageTemplates(
  db: PrismaClient,
  input: CustomerMessageScope,
  admin = true,
) {
  return db.$transaction(async (tx) => {
    const scope = await customerMessageScope(tx, input, admin)
    const templates = await readMessageTemplates(tx, input)
    return {
      storeId: input.storeId,
      storeName: scope.store.name,
      businessName: scope.store.tenant.name,
      canManageTemplates: scope.canManageTemplates,
      templates: admin ? templates : [],
      statuses: messageTemplateStatuses(templates, input.storeId),
    }
  }, customerMessageTransactionOptions)
}

export type MessageTemplateWrite = CustomerMessageScope & {
  eventKey: CustomerMessageEventKey
  scope: "business" | "store"
  expectedRevision: number
  expectedTemplateId?: string
}

/** Bind revision to row identity as well: reset/recreate must not accept an old edit. */
function assertExpected(
  row: CustomerMessageTemplate | null,
  input: MessageTemplateWrite,
) {
  if (
    row
      ? row.revision !== input.expectedRevision ||
        row.id !== input.expectedTemplateId
      : input.expectedRevision !== 0 || input.expectedTemplateId !== undefined
  )
    throw new CustomerMessageError(
      "CONFLICT",
      "This message changed. Reload it before saving.",
    )
}

type MessageTemplateChange =
  | {
      body: string
      enabled: boolean
      source: "MANUAL" | "AI_ASSISTED" | "STARTER"
    }
  | { enabled: boolean }
  | null

export async function writeCustomerMessageTemplateInTransaction(
  tx: Prisma.TransactionClient,
  input: MessageTemplateWrite,
  change: MessageTemplateChange,
) {
  await customerMessageScope(tx, input, true)
  if (!(await accountPrivacyPrivateWritesAllowed(tx, input.actorUserId)))
    throw new CustomerMessageError(
      "FORBIDDEN",
      "Message settings cannot change while account deletion is processing.",
    )
  const scopeKey =
    input.scope === "business" ? "business" : `store:${input.storeId}`
  const key = {
    tenantId: input.tenantId,
    scopeKey,
    eventKey: input.eventKey,
  }
  const previous = await tx.customerMessageTemplate.findUnique({
    where: { tenantId_scopeKey_eventKey: key },
  })
  assertExpected(previous, input)
  if (change === null) {
    if (previous) {
      const result = await tx.customerMessageTemplate.deleteMany({
        where: {
          ...key,
          id: previous.id,
          revision: input.expectedRevision,
        },
      })
      if (result.count !== 1)
        throw new CustomerMessageError(
          "CONFLICT",
          "This message changed. Reload it.",
        )
    }
    return { removed: true as const }
  }
  let body: string
  let source: string
  if ("body" in change) {
    body = change.body.trim()
    source = change.source
  } else {
    const defaults = await tx.customerMessageTemplate.findUnique({
      where: {
        tenantId_scopeKey_eventKey: { ...key, scopeKey: "business" },
      },
    })
    body =
      previous?.body || (input.scope === "store" ? defaults?.body : null) || ""
    source = previous?.source ?? "MANUAL"
  }
  if (change.enabled || body) {
    try {
      validateCustomerMessageTemplate(input.eventKey, body)
    } catch (error) {
      throw new CustomerMessageError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : "Enter valid message wording.",
      )
    }
  }
  if (previous) {
    const updated = await tx.customerMessageTemplate.updateMany({
      where: { ...key, id: previous.id, revision: input.expectedRevision },
      data: {
        body,
        enabled: change.enabled,
        source,
        revision: { increment: 1 },
        updatedByUserId: input.actorUserId,
      },
    })
    if (updated.count !== 1)
      throw new CustomerMessageError(
        "CONFLICT",
        "This message changed. Reload it.",
      )
  } else {
    await tx.customerMessageTemplate.create({
      data: {
        ...key,
        storeId: input.scope === "store" ? input.storeId : null,
        body,
        enabled: change.enabled,
        source,
        updatedByUserId: input.actorUserId,
      },
    })
  }
  const row = await tx.customerMessageTemplate.findUniqueOrThrow({
    where: { tenantId_scopeKey_eventKey: key },
  })
  return { removed: false as const, template: messageTemplateView(row) }
}

async function writeTemplate(
  db: PrismaClient,
  input: MessageTemplateWrite,
  change: MessageTemplateChange,
) {
  try {
    return await db.$transaction(
      (tx) => writeCustomerMessageTemplateInTransaction(tx, input, change),
      customerMessageTransactionOptions,
    )
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2002", "P2034"].includes(String(error.code))
    )
      throw new CustomerMessageError(
        "CONFLICT",
        "Another editor changed this message. Reload it.",
      )
    throw error
  }
}

export function saveCustomerMessageTemplate(
  db: PrismaClient,
  input: MessageTemplateWrite & {
    body: string
    enabled: boolean
    source: "MANUAL" | "AI_ASSISTED" | "STARTER"
  },
) {
  return writeTemplate(db, input, input)
}
export function resetCustomerMessageTemplate(
  db: PrismaClient,
  input: MessageTemplateWrite,
) {
  return writeTemplate(db, input, null)
}
export function setCustomerMessageTemplateEnabled(
  db: PrismaClient,
  input: MessageTemplateWrite & { enabled: boolean },
) {
  return writeTemplate(db, input, { enabled: input.enabled })
}
