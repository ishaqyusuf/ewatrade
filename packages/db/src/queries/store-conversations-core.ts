import { createHash } from "node:crypto"

import type {
  StoreConversationMessageProjection,
  StoreConversationRequestSummaryProjection,
} from "@ewatrade/service-commerce"

import { Prisma } from "../../generated/prisma/client"
import {
  CommerceInquiryStatus,
  PrescriptionRequestStatus,
  ServiceRequestStatus,
  StoreConversationGuestAccessStatus,
  StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
  StoreConversationGuestIdentityStatus,
  StoreConversationMessageAuthorKind,
  type StoreConversationMessageChannel,
  type StoreConversationMessageKind,
  type StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import {
  CustomerChannelsError,
  resolveCustomerEntryPointContextInTransaction,
} from "./customer-channels"
import type { DbClient } from "./types"

export const GUEST_CREDENTIAL_LIFETIME_MS = 180 * 24 * 60 * 60 * 1_000

export type StoreConversationErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "GUEST_CREDENTIAL_EXPIRED"
  | "NOT_FOUND"
  | "NOT_READY"

export class StoreConversationError extends Error {
  constructor(
    readonly code: StoreConversationErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationError"
  }
}

export function digestStoreConversationValue(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

export function storeConversationPayloadHash(value: unknown) {
  return digestStoreConversationValue(stableJson(value))
}

export function projectStoreConversationMessage(message: {
  authorKind: StoreConversationMessageAuthorKind
  body: string
  channel: StoreConversationMessageChannel
  id: string
  kind: StoreConversationMessageKind
  occurredAt: Date
  requestLinks?: Array<{
    kind: StoreConversationRequestKind
    sourceId: string
  }>
  sequence: number
}): StoreConversationMessageProjection {
  const author =
    message.authorKind === StoreConversationMessageAuthorKind.CUSTOMER
      ? { kind: "customer" as const, label: "You" }
      : message.authorKind ===
          StoreConversationMessageAuthorKind.STORE_ATTENDANT
        ? { kind: "store_attendant" as const, label: "Store" }
        : { kind: "system" as const, label: "EwaTrade" }
  const channels = {
    MOBILE: "mobile",
    SYSTEM: "system",
    WEB: "web",
    WHATSAPP: "whatsapp",
  } as const
  const kinds = {
    CUSTOMER_TEXT: "customer_text",
    STORE_TEXT: "store_text",
    SYSTEM_EVENT: "system_event",
  } as const
  const requestKinds = {
    COMMERCE_INQUIRY: "commerce_inquiry",
    PRESCRIPTION_REQUEST: "prescription_request",
    SERVICE_REQUEST: "service_request",
  } as const
  const request = message.requestLinks?.[0]

  return {
    author,
    channel: channels[message.channel],
    id: message.id,
    kind: kinds[message.kind],
    occurredAt: message.occurredAt,
    ...(request
      ? {
          request: {
            id: request.sourceId,
            kind: requestKinds[request.kind],
          },
        }
      : {}),
    sequence: message.sequence,
    text: message.body,
  }
}

const requestStatus = {
  commerce: {
    [CommerceInquiryStatus.RECEIVED]: "received",
    [CommerceInquiryStatus.NEEDS_CLARIFICATION]: "needs_information",
    [CommerceInquiryStatus.READY_TO_QUOTE]: "ready_to_quote",
    [CommerceInquiryStatus.QUOTED]: "quoted",
    [CommerceInquiryStatus.CONVERTED]: "converted",
    [CommerceInquiryStatus.DECLINED]: "declined",
    [CommerceInquiryStatus.WITHDRAWN]: "withdrawn",
    [CommerceInquiryStatus.EXPIRED]: "expired",
  },
  prescription: {
    [PrescriptionRequestStatus.RECEIVED]: "received",
    [PrescriptionRequestStatus.MEDIA_REVIEW]: "media_review",
    [PrescriptionRequestStatus.NEEDS_CLEARER_MEDIA]: "media_review",
    [PrescriptionRequestStatus.TRANSCRIBING]: "media_review",
    [PrescriptionRequestStatus.ATTENDANT_VERIFICATION]: "professional_review",
    [PrescriptionRequestStatus.PHARMACIST_REVIEW]: "professional_review",
    [PrescriptionRequestStatus.NEEDS_CLARIFICATION]: "needs_information",
    [PrescriptionRequestStatus.READY_TO_QUOTE]: "ready_to_quote",
    [PrescriptionRequestStatus.QUOTED]: "quoted",
    [PrescriptionRequestStatus.CONVERTED]: "converted",
    [PrescriptionRequestStatus.DECLINED]: "declined",
    [PrescriptionRequestStatus.WITHDRAWN]: "withdrawn",
    [PrescriptionRequestStatus.EXPIRED]: "expired",
  },
  service: {
    [ServiceRequestStatus.SUBMITTED]: "received",
    [ServiceRequestStatus.NEEDS_INFORMATION]: "needs_information",
    [ServiceRequestStatus.QUOTED]: "quoted",
    [ServiceRequestStatus.DECLINED]: "declined",
    [ServiceRequestStatus.WITHDRAWN]: "withdrawn",
    [ServiceRequestStatus.CONVERTED]: "converted",
  },
} as const

const terminalRequestStatuses = new Set([
  "converted",
  "declined",
  "withdrawn",
  "expired",
])

export async function loadStoreConversationRequestSummaries(
  db: DbClient,
  input: { conversationId: string; storeId: string; tenantId: string },
): Promise<StoreConversationRequestSummaryProjection[]> {
  const links = await db.storeConversationRequestLink.findMany({
    distinct: ["kind", "sourceId"],
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, kind: true, sourceId: true },
    take: 200,
    where: {
      conversationId: input.conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const commerceIds = links
    .filter((link) => link.kind === "COMMERCE_INQUIRY")
    .map((link) => link.sourceId)
  const serviceIds = links
    .filter((link) => link.kind === "SERVICE_REQUEST")
    .map((link) => link.sourceId)
  const prescriptionIds = links
    .filter((link) => link.kind === "PRESCRIPTION_REQUEST")
    .map((link) => link.sourceId)
  const [commerce, service, prescription] = await Promise.all([
    db.commerceInquiry.findMany({
      select: { createdAt: true, id: true, revision: true, status: true },
      where: {
        id: { in: commerceIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    db.serviceRequest.findMany({
      select: { createdAt: true, id: true, revision: true, status: true },
      where: {
        id: { in: serviceIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    db.prescriptionRequest.findMany({
      select: {
        createdAt: true,
        currentMediaRevision: true,
        id: true,
        status: true,
      },
      where: {
        id: { in: prescriptionIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])
  const rows = new Map<string, StoreConversationRequestSummaryProjection>()
  for (const source of commerce) {
    const status = requestStatus.commerce[source.status]
    rows.set(`COMMERCE_INQUIRY:${source.id}`, {
      createdAt: source.createdAt,
      id: source.id,
      kind: "commerce_inquiry",
      label: "Product request",
      lifecycle: terminalRequestStatuses.has(status) ? "terminal" : "active",
      revision: source.revision,
      status,
    })
  }
  for (const source of service) {
    const status = requestStatus.service[source.status]
    rows.set(`SERVICE_REQUEST:${source.id}`, {
      createdAt: source.createdAt,
      id: source.id,
      kind: "service_request",
      label: "Service request",
      lifecycle: terminalRequestStatuses.has(status) ? "terminal" : "active",
      revision: source.revision,
      status,
    })
  }
  for (const source of prescription) {
    const status = requestStatus.prescription[source.status]
    rows.set(`PRESCRIPTION_REQUEST:${source.id}`, {
      createdAt: source.createdAt,
      id: source.id,
      kind: "prescription_request",
      label: "Prescription request",
      lifecycle: terminalRequestStatuses.has(status) ? "terminal" : "active",
      revision: source.currentMediaRevision,
      status,
    })
  }
  return links.flatMap((link) => {
    const row = rows.get(`${link.kind}:${link.sourceId}`)
    return row ? [row] : []
  })
}

export async function resolveStoreConversationGuestCredential(
  db: DbClient,
  input: {
    credentialToken: string
    installationToken?: string
    now: Date
    purpose?: StoreConversationGuestCredentialPurpose
  },
) {
  const purpose =
    input.purpose ?? StoreConversationGuestCredentialPurpose.WEB_DEVICE
  if (
    purpose === StoreConversationGuestCredentialPurpose.MOBILE_DEVICE &&
    !input.installationToken
  ) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "This app installation could not be verified.",
    )
  }
  const credential = await db.storeConversationGuestCredential.findFirst({
    include: { guestIdentity: { select: { id: true, status: true } } },
    where: {
      expiresAt: { gt: input.now },
      ...(input.installationToken
        ? {
            deviceBindingDigest: digestStoreConversationValue(
              input.installationToken,
            ),
          }
        : {}),
      purpose,
      status: StoreConversationGuestCredentialStatus.ACTIVE,
      tokenDigest: digestStoreConversationValue(input.credentialToken),
    },
  })
  if (
    !credential ||
    credential.guestIdentity.status !==
      StoreConversationGuestIdentityStatus.ACTIVE
  ) {
    throw new StoreConversationError(
      "GUEST_CREDENTIAL_EXPIRED",
      "This guest session is unavailable. Start again from the Store link.",
    )
  }
  return credential
}

export async function touchStoreConversationGuestCredential(
  db: DbClient,
  input: { credentialId: string; guestIdentityId: string; now: Date },
) {
  const expiresAt = new Date(input.now.getTime() + GUEST_CREDENTIAL_LIFETIME_MS)
  await Promise.all([
    db.storeConversationGuestCredential.update({
      data: { expiresAt, lastUsedAt: input.now },
      where: { id: input.credentialId },
    }),
    db.storeConversationGuestIdentity.update({
      data: { lastSeenAt: input.now },
      where: { id: input.guestIdentityId },
    }),
  ])
  return expiresAt
}

export async function lockStoreConversation(
  db: DbClient,
  input: { conversationId: string; storeId: string; tenantId: string },
) {
  const locked = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "StoreConversation"
      WHERE "id" = ${input.conversationId}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `,
  )
  if (locked.length !== 1) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
}

export async function loadStoreConversationForGuest(
  db: DbClient,
  input: {
    conversationId: string
    credentialToken: string
    now: Date
    installationToken?: string
    purpose?: StoreConversationGuestCredentialPurpose
    storeId?: string
    tenantId?: string
  },
) {
  const credential = await resolveStoreConversationGuestCredential(db, input)
  const conversation = await db.storeConversation.findFirst({
    include: { store: { select: { name: true } } },
    where: {
      id: input.conversationId,
      OR: [
        { guestIdentityId: credential.guestIdentityId },
        {
          guestAccesses: {
            some: {
              guestIdentityId: credential.guestIdentityId,
              status: StoreConversationGuestAccessStatus.ACTIVE,
            },
          },
        },
      ],
      ...(input.storeId ? { storeId: input.storeId } : {}),
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
  })
  if (!conversation) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
  await touchStoreConversationGuestCredential(db, {
    credentialId: credential.id,
    guestIdentityId: credential.guestIdentityId,
    now: input.now,
  })
  return { conversation, credential }
}

export async function assertStoreConversationAttendant(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const membership = await db.membership.findFirst({
    select: {
      id: true,
      role: true,
      user: { select: { displayName: true, name: true } },
    },
    where: {
      acceptedAt: { not: null },
      status: "ACTIVE",
      tenantId: input.tenantId,
      userId: input.actorUserId,
      serviceCommerceStoreTeamAssignments: {
        some: {
          capability: "ATTENDANT",
          status: "ACTIVE",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    },
  })
  if (!membership) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Store conversation access is unavailable.",
    )
  }
  return membership
}

export async function resolveStoreConversationEntry(
  db: DbClient,
  input: { publicToken: string },
) {
  try {
    return await resolveCustomerEntryPointContextInTransaction(db, input)
  } catch (error) {
    if (error instanceof CustomerChannelsError) {
      throw new StoreConversationError(
        error.code === "NOT_FOUND" ? "NOT_FOUND" : "NOT_READY",
        error.code === "NOT_FOUND"
          ? "This Store link is unavailable. Scan the current Store QR and try again."
          : "This Store is not accepting web conversations right now.",
      )
    }
    throw error
  }
}
