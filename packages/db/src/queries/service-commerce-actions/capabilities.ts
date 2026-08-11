import type {
  ServiceCommerceChannelOrigin,
  ServiceCommerceCustomerActionExecutionResult,
  ServiceCommerceCustomerActionPreview,
  ServiceCommerceCustomerActionProjection,
  ServiceCommerceSourceRef,
} from "@ewatrade/service-commerce"
import {
  serviceCommerceCustomerActionExecutionResultSchema,
  serviceCommerceCustomerActionPreviewSchema,
  serviceCommerceCustomerActionProjectionSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  ServiceCommerceCustomerActionCapabilityStatus,
  ServiceCommerceCustomerActionExecutionOutcome,
  ServiceCommerceCustomerActionTargetType,
  ServiceCommerceCustomerNotificationStatus,
} from "../../../generated/prisma/enums"
import { selectCommerceQuoteOptionInTransaction } from "../commerce-quotes"
import {
  projectCurrentServiceCommerceCustomerActions,
  revalidateCustomerActionCapabilityInTransaction,
} from "./projection"
import {
  CUSTOMER_ACTION_TRANSACTION_OPTIONS,
  type CustomerActionTransaction,
  ServiceCommerceCustomerActionError,
  customerActionChannelValues,
  customerActionChannels,
  customerActionPayloadHash,
  customerActionSourceKinds,
  customerActionSourceValues,
  customerActionTokenDigest,
  customerActionTypes,
  customerActionValues,
  resolveCustomerActionWhatsAppConnectionInTransaction,
} from "./shared"

const MAX_ACTION_CAPABILITY_LIFETIME_MS = 7 * 86_400_000

export type IssueServiceCommerceCustomerActionToken = (input: {
  clientCapabilityId: string
  storeId: string
  tenantId: string
}) => string

export type ProtectServiceCommerceCustomerRecipient = (input: {
  channel: "whatsapp"
  recipient: string
}) => string

export type ServiceCommerceCustomerActionCapabilityRecord = Awaited<
  ReturnType<
    CustomerActionTransaction["serviceCommerceCustomerActionCapability"]["findFirst"]
  >
>

function assertExpiry(now: Date, expiresAt: Date) {
  if (
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > MAX_ACTION_CAPABILITY_LIFETIME_MS
  ) {
    throw new ServiceCommerceCustomerActionError(
      "ACTION_BLOCKED",
      "Customer action expiry is invalid.",
    )
  }
}

function executionKind(
  action: keyof typeof customerActionTypes,
): ServiceCommerceCustomerActionExecutionResult["kind"] {
  if (action === "book" || action === "reschedule" || action === "cancel") {
    return "booking"
  }
  if (action === "pay_now") return "checkout"
  if (action === "pick_up") return "pickup"
  if (action === "delivery") return "delivery"
  if (action === "talk_to_staff") return "support"
  if (action === "request_quote") return "request_recorded"
  if (action === "choose_quote_option") return "quote_option_selected"
  return "quote"
}

async function issueCapabilitiesInTransaction(
  tx: CustomerActionTransaction,
  input: {
    actorUserId: string
    channel: ServiceCommerceChannelOrigin
    clientBatchId: string
    expiresAt: Date
    issueCapabilityToken: IssueServiceCommerceCustomerActionToken
    protectRecipient?: ProtectServiceCommerceCustomerRecipient
    source: ServiceCommerceSourceRef
    storeId: string
    templateKey?: string
    tenantId: string
  },
) {
  const projected = await projectCurrentServiceCommerceCustomerActions(
    tx,
    input,
  )
  if (projected.actions.length === 0) {
    throw new ServiceCommerceCustomerActionError(
      "ACTION_BLOCKED",
      "No current customer action is available for this request.",
    )
  }
  let notificationIntentId: string | null = null

  if (input.channel === "whatsapp") {
    if (
      !projected.contact.optedIn ||
      !projected.contact.phone ||
      !input.protectRecipient ||
      !input.templateKey?.trim()
    ) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_PROVIDER_UNAVAILABLE",
        "WhatsApp customer actions require consent, a recipient, and an approved template.",
      )
    }
    await resolveCustomerActionWhatsAppConnectionInTransaction(tx, {
      storeId: input.storeId,
      templateKey: input.templateKey.trim(),
      tenantId: input.tenantId,
    })
    const clientIntentId = `${input.clientBatchId}:notification`
    const protectedRecipient = input.protectRecipient({
      channel: "whatsapp",
      recipient: projected.contact.phone,
    })
    const payloadHash = customerActionPayloadHash({
      channel: input.channel,
      clientIntentId,
      source: input.source,
      templateKey: input.templateKey.trim(),
    })
    const replay = await tx.serviceCommerceCustomerNotificationIntent.findFirst(
      {
        where: { clientIntentId, tenantId: input.tenantId },
      },
    )
    if (replay) {
      if (
        replay.payloadHash !== payloadHash ||
        replay.storeId !== input.storeId ||
        replay.protectedRecipient !== protectedRecipient
      ) {
        throw new ServiceCommerceCustomerActionError(
          "ACTION_IDEMPOTENCY_MISMATCH",
          "Notification identity was reused with different customer action input.",
        )
      }
      notificationIntentId = replay.id
    } else {
      const intent = await tx.serviceCommerceCustomerNotificationIntent.create({
        data: {
          channel: customerActionChannels[input.channel],
          clientIntentId,
          createdByUserId: input.actorUserId,
          messageKind: "customer_actions_available",
          payloadHash,
          protectedRecipient,
          status: ServiceCommerceCustomerNotificationStatus.PENDING,
          storeId: input.storeId,
          templateKey: input.templateKey.trim(),
          templateRequired: true,
          tenantId: input.tenantId,
        },
      })
      notificationIntentId = intent.id
    }
  }

  const results: ServiceCommerceCustomerActionProjection[] = []
  for (const candidate of projected.actions) {
    const clientCapabilityId = `${input.clientBatchId}:${candidate.action}:${candidate.targetKey ?? candidate.targetOptionId ?? candidate.targetId}`
    const capabilityToken = input.issueCapabilityToken({
      clientCapabilityId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    const payloadHash = customerActionPayloadHash({
      action: candidate,
      channel: input.channel,
      expiresAt: input.expiresAt,
      source: input.source,
      sourceVersion: projected.sourceVersion,
    })
    const replay = await tx.serviceCommerceCustomerActionCapability.findFirst({
      where: { clientCapabilityId, tenantId: input.tenantId },
    })
    if (replay) {
      if (
        replay.payloadHash !== payloadHash ||
        replay.tokenDigest !== customerActionTokenDigest(capabilityToken) ||
        replay.storeId !== input.storeId
      ) {
        throw new ServiceCommerceCustomerActionError(
          "ACTION_IDEMPOTENCY_MISMATCH",
          "Customer action identity was reused with different input.",
        )
      }
    } else {
      await tx.serviceCommerceCustomerActionCapability.create({
        data: {
          action: customerActionTypes[candidate.action],
          amountMinor: candidate.amountMinor,
          channel: customerActionChannels[input.channel],
          clientCapabilityId,
          confirmationRequired: candidate.confirmation === "required",
          consequence: candidate.consequence,
          createdByUserId: input.actorUserId,
          currencyCode: candidate.currencyCode,
          expiresAt: input.expiresAt,
          label: candidate.label,
          notificationIntentId,
          payloadHash,
          sourceId: input.source.id,
          sourceKind: customerActionSourceKinds[input.source.kind],
          sourceVersion: projected.sourceVersion,
          storeId: input.storeId,
          targetId: candidate.targetId,
          targetOptionId: candidate.targetOptionId,
          targetType: candidate.targetType,
          targetVersion: candidate.targetVersion,
          tenantId: input.tenantId,
          tokenDigest: customerActionTokenDigest(capabilityToken),
        },
      })
    }
    results.push(
      serviceCommerceCustomerActionProjectionSchema.parse({
        action: candidate.action,
        amountMinor: candidate.amountMinor,
        capabilityToken,
        confirmation: candidate.confirmation,
        consequence: candidate.consequence,
        currencyCode: candidate.currencyCode,
        expiresAt: input.expiresAt,
        label: candidate.label,
      }),
    )
  }
  return {
    actions: results,
    notificationIntentId,
  }
}

export async function issueServiceCommerceCustomerActions(
  db: PrismaClient,
  input: {
    actorUserId: string
    channel: ServiceCommerceChannelOrigin
    clientBatchId: string
    expiresAt: Date
    issueCapabilityToken: IssueServiceCommerceCustomerActionToken
    now?: Date
    protectRecipient?: ProtectServiceCommerceCustomerRecipient
    source: ServiceCommerceSourceRef
    storeId: string
    templateKey?: string
    tenantId: string
  },
) {
  assertExpiry(input.now ?? new Date(), input.expiresAt)
  const issue = (tx: CustomerActionTransaction) =>
    issueCapabilitiesInTransaction(tx, input)
  try {
    return await db.$transaction(issue, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.$transaction(issue, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
    }
    throw error
  }
}

export async function getPublicServiceCommerceCustomerAction(
  db: PrismaClient,
  input: { capabilityToken: string; now?: Date },
): Promise<ServiceCommerceCustomerActionPreview> {
  const now = input.now ?? new Date()
  try {
    return await db.$transaction(async (tx) => {
      const capability =
        await tx.serviceCommerceCustomerActionCapability.findFirst({
          where: {
            tokenDigest: customerActionTokenDigest(input.capabilityToken),
          },
        })
      const supportToken = capability
        ? ((
            await tx.customerEntryPoint.findFirst({
              select: { publicToken: true },
              where: {
                status: "PUBLISHED",
                storeId: capability.storeId,
                tenantId: capability.tenantId,
              },
            })
          )?.publicToken ?? null)
        : null
      let current = false
      if (capability) {
        try {
          current = Boolean(
            await revalidateCustomerActionCapabilityInTransaction(
              tx,
              capability,
            ),
          )
        } catch {
          current = false
        }
      }
      if (
        !capability ||
        capability.expiresAt <= now ||
        capability.status ===
          ServiceCommerceCustomerActionCapabilityStatus.REVOKED ||
        !current
      ) {
        return serviceCommerceCustomerActionPreviewSchema.parse({
          available: false,
          recovery: "talk_to_staff",
          supportToken,
        })
      }
      return serviceCommerceCustomerActionPreviewSchema.parse({
        action: customerActionValues[capability.action],
        amountMinor: capability.amountMinor,
        available: true,
        confirmation: capability.confirmationRequired ? "required" : "none",
        consequence: capability.consequence,
        currencyCode: capability.currencyCode,
        expiresAt: capability.expiresAt,
        label: capability.label,
      })
    }, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
  } catch {
    return serviceCommerceCustomerActionPreviewSchema.parse({
      available: false,
      recovery: "talk_to_staff",
      supportToken: null,
    })
  }
}

export async function executeServiceCommerceCustomerAction(
  db: PrismaClient,
  input: {
    capabilityToken: string
    clientOperationId: string
    confirmed: boolean
    now?: Date
  },
): Promise<ServiceCommerceCustomerActionExecutionResult> {
  const now = input.now ?? new Date()
  const payloadHash = customerActionPayloadHash({
    confirmed: input.confirmed,
    operation: input.clientOperationId,
  })
  const execute = async (tx: CustomerActionTransaction) => {
    const capability =
      await tx.serviceCommerceCustomerActionCapability.findFirst({
        where: {
          tokenDigest: customerActionTokenDigest(input.capabilityToken),
        },
      })
    if (!capability) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_NOT_FOUND",
        "Customer action is unavailable.",
      )
    }
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "ServiceCommerceCustomerActionCapability"
      WHERE "id" = ${capability.id}
      FOR UPDATE
    `)
    const replay = await tx.serviceCommerceCustomerActionExecution.findFirst({
      where: {
        capabilityId: capability.id,
        clientOperationId: input.clientOperationId,
      },
    })
    if (replay) {
      if (replay.payloadHash !== payloadHash) {
        throw new ServiceCommerceCustomerActionError(
          "ACTION_IDEMPOTENCY_MISMATCH",
          "Customer action command identity was reused with different input.",
        )
      }
      return serviceCommerceCustomerActionExecutionResultSchema.parse({
        kind: replay.resultKind,
        replayed: true,
        sourceKind: customerActionSourceValues[capability.sourceKind],
      })
    }
    if (
      capability.status ===
        ServiceCommerceCustomerActionCapabilityStatus.REVOKED ||
      capability.expiresAt <= now
    ) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_EXPIRED",
        "Customer action expired. Request a fresh link from the business.",
      )
    }
    if (
      capability.status ===
      ServiceCommerceCustomerActionCapabilityStatus.CONSUMED
    ) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_CONFLICT",
        "Customer action was already used. Request a fresh link from the business.",
      )
    }
    const current = await revalidateCustomerActionCapabilityInTransaction(
      tx,
      capability,
    )
    if (!current) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_CONFLICT",
        "Customer action is stale. Request a fresh link from the business.",
      )
    }
    if (capability.confirmationRequired && !input.confirmed) {
      throw new ServiceCommerceCustomerActionError(
        "ACTION_BLOCKED",
        "This customer action requires explicit confirmation.",
      )
    }

    const action = customerActionValues[capability.action]
    if (action === "choose_quote_option") {
      if (
        capability.targetType !==
          ServiceCommerceCustomerActionTargetType.QUOTE_OPTION ||
        !capability.targetOptionId
      ) {
        throw new ServiceCommerceCustomerActionError(
          "ACTION_CONFLICT",
          "Quote option action is invalid.",
        )
      }
      await selectCommerceQuoteOptionInTransaction(tx, {
        acceptanceToken: input.capabilityToken,
        clientSelectionId: input.clientOperationId,
        optionId: capability.targetOptionId,
      })
    }

    const kind = executionKind(action)
    await tx.serviceCommerceCustomerActionExecution.create({
      data: {
        capabilityId: capability.id,
        clientOperationId: input.clientOperationId,
        outcome: ServiceCommerceCustomerActionExecutionOutcome.COMPLETED,
        payloadHash,
        resultKind: kind,
        storeId: capability.storeId,
        tenantId: capability.tenantId,
      },
    })
    await tx.serviceCommerceCustomerActionCapability.updateMany({
      data: {
        consumedAt: capability.consumedAt ?? now,
        status: ServiceCommerceCustomerActionCapabilityStatus.CONSUMED,
      },
      where: {
        id: capability.id,
        status: {
          in: [
            ServiceCommerceCustomerActionCapabilityStatus.ACTIVE,
            ServiceCommerceCustomerActionCapabilityStatus.CONSUMED,
          ],
        },
        storeId: capability.storeId,
        tenantId: capability.tenantId,
      },
    })
    return serviceCommerceCustomerActionExecutionResultSchema.parse({
      kind,
      replayed: false,
      sourceKind: customerActionSourceValues[capability.sourceKind],
    })
  }

  try {
    return await db.$transaction(execute, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return db.$transaction(execute, CUSTOMER_ACTION_TRANSACTION_OPTIONS)
    }
    throw error
  }
}
