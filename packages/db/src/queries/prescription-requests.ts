import { createHash, randomBytes } from "node:crypto"

import { decryptPrescriptionData } from "@ewatrade/prescriptions"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  CommerceQuoteAvailabilityOutcome,
  CommerceQuoteLineOutcome,
  CommerceQuoteSourceType,
  PrescriptionChannelStatus,
  PrescriptionFulfilmentPreference,
  PrescriptionLineAvailability,
  PrescriptionLineVerificationStatus,
  PrescriptionMediaAccessAction,
  PrescriptionMediaStatus,
  PrescriptionPharmacistDecision,
  PrescriptionRequestAuditEventType,
  PrescriptionRequestSource,
  PrescriptionRequestStatus,
  PrescriptionStoreRoleStatus,
  PrescriptionStoreRoleType,
  PrescriptionTranscriptionStatus,
  SellableOfferingKind,
} from "../../generated/prisma/enums"
import { getCatalogOfferingAvailability } from "./catalog-inventory"
import {
  CommerceQuoteError,
  getCommerceQuoteAcceptanceContext,
  getPublicCommerceQuote,
  issueCommerceQuote,
  recordCommerceQuoteAcceptance,
} from "./commerce-quotes"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import {
  assertPrescriptionOperationalOrBreakGlassAccess,
  recordPrescriptionSensitiveAccess,
} from "./prescription-compliance"
import {
  assertActivePrescriptionStore,
  assertAnyPrescriptionStoreRole,
  assertPrescriptionStoreRole,
} from "./prescription-settings"

export type PrescriptionRequestStatusValue =
  | "attendant_verification"
  | "converted"
  | "declined"
  | "expired"
  | "media_review"
  | "needs_clarification"
  | "needs_clearer_media"
  | "pharmacist_review"
  | "quoted"
  | "ready_to_quote"
  | "received"
  | "transcribing"
  | "withdrawn"

const ALLOWED_TRANSITIONS: Record<
  PrescriptionRequestStatusValue,
  readonly PrescriptionRequestStatusValue[]
> = {
  attendant_verification: [
    "needs_clearer_media",
    "pharmacist_review",
    "transcribing",
  ],
  converted: [],
  declined: [],
  expired: [],
  media_review: [
    "declined",
    "needs_clearer_media",
    "transcribing",
    "withdrawn",
  ],
  needs_clarification: [
    "attendant_verification",
    "expired",
    "pharmacist_review",
    "withdrawn",
  ],
  needs_clearer_media: ["expired", "media_review", "withdrawn"],
  pharmacist_review: [
    "attendant_verification",
    "declined",
    "needs_clarification",
    "ready_to_quote",
  ],
  quoted: ["converted", "declined", "expired", "ready_to_quote", "withdrawn"],
  ready_to_quote: ["declined", "pharmacist_review", "quoted"],
  received: ["media_review", "withdrawn"],
  transcribing: ["attendant_verification", "needs_clearer_media"],
  withdrawn: [],
}

export function assertPrescriptionRequestTransition(
  from: PrescriptionRequestStatusValue,
  to: PrescriptionRequestStatusValue,
) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(
      `Invalid Prescription Request transition: ${from} -> ${to}.`,
    )
  }
}

export function requiresVerifiedTranscript(
  lines: Array<{ status: "pending" | "unreadable" | "verified" }>,
) {
  return (
    lines.length > 0 &&
    lines.every(
      (line) => line.status === "verified" || line.status === "unreadable",
    )
  )
}

export type PrescriptionMediaManifestInput = {
  clientMediaId: string
  mediaType: string
  objectKey: string
  originalFileName: string
  pageNumber: number
  sha256: string
  sizeBytes: number
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function token() {
  return randomBytes(32).toString("base64url")
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

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function createPrescriptionIntakeFingerprint(input: {
  clientRequestId: string
  contact?: string | null
  media: Array<
    Pick<
      PrescriptionMediaManifestInput,
      "clientMediaId" | "pageNumber" | "sha256"
    >
  >
  source: "staff_phone" | "staff_walk_in" | "web" | "whatsapp"
  storeId: string
}) {
  return digest(
    stableJson({
      clientRequestId: input.clientRequestId.trim(),
      contactDigest: input.contact ? digest(input.contact.trim()) : null,
      media: [...input.media].sort((a, b) => a.pageNumber - b.pageNumber),
      source: input.source,
      storeId: input.storeId,
    }),
  )
}

export function normalizePrescriptionMediaManifest(
  media: PrescriptionMediaManifestInput[],
) {
  if (media.length < 1 || media.length > 12) {
    throw new Error(
      "Prescription intake requires between 1 and 12 media pages.",
    )
  }
  const normalized = [...media].sort((a, b) => a.pageNumber - b.pageNumber)
  const clientIds = new Set<string>()
  const objectKeys = new Set<string>()
  for (const [index, page] of normalized.entries()) {
    if (page.pageNumber !== index + 1) {
      throw new Error("Media pages must be contiguous and begin at page 1.")
    }
    if (clientIds.has(page.clientMediaId) || objectKeys.has(page.objectKey)) {
      throw new Error(
        "Media pages must have unique client and object identities.",
      )
    }
    clientIds.add(page.clientMediaId)
    objectKeys.add(page.objectKey)
  }
  return normalized
}

export type PrescriptionRequestErrorCode =
  | "IDEMPOTENCY_MISMATCH"
  | "MEDIA_CONFLICT"
  | "MEDIA_NOT_READY"
  | "PUBLIC_ACCESS_INVALID"
  | "REQUEST_CONFLICT"
  | "REQUEST_NOT_FOUND"
  | "TRANSCRIPT_NOT_READY"

export class PrescriptionRequestError extends Error {
  readonly code: PrescriptionRequestErrorCode

  constructor(code: PrescriptionRequestErrorCode, message: string) {
    super(message)
    this.name = "PrescriptionRequestError"
    this.code = code
  }
}

const sourceMap = {
  staff_phone: PrescriptionRequestSource.STAFF_PHONE,
  staff_walk_in: PrescriptionRequestSource.STAFF_WALK_IN,
  web: PrescriptionRequestSource.WEB,
  whatsapp: PrescriptionRequestSource.WHATSAPP,
} as const

const fulfilmentMap = {
  delivery: PrescriptionFulfilmentPreference.DELIVERY,
  pickup: PrescriptionFulfilmentPreference.PICKUP,
  unspecified: PrescriptionFulfilmentPreference.UNSPECIFIED,
} as const

const statusInputMap = {
  attendant_verification: PrescriptionRequestStatus.ATTENDANT_VERIFICATION,
  converted: PrescriptionRequestStatus.CONVERTED,
  declined: PrescriptionRequestStatus.DECLINED,
  expired: PrescriptionRequestStatus.EXPIRED,
  media_review: PrescriptionRequestStatus.MEDIA_REVIEW,
  needs_clarification: PrescriptionRequestStatus.NEEDS_CLARIFICATION,
  needs_clearer_media: PrescriptionRequestStatus.NEEDS_CLEARER_MEDIA,
  pharmacist_review: PrescriptionRequestStatus.PHARMACIST_REVIEW,
  quoted: PrescriptionRequestStatus.QUOTED,
  ready_to_quote: PrescriptionRequestStatus.READY_TO_QUOTE,
  received: PrescriptionRequestStatus.RECEIVED,
  transcribing: PrescriptionRequestStatus.TRANSCRIBING,
  withdrawn: PrescriptionRequestStatus.WITHDRAWN,
} as const

function statusValue(status: PrescriptionRequestStatus) {
  return status.toLowerCase() as PrescriptionRequestStatusValue
}

function sourceValue(source: PrescriptionRequestSource) {
  return source.toLowerCase() as keyof typeof sourceMap
}

function makeReference() {
  return `RX-${randomBytes(5).toString("hex").toUpperCase()}`
}

export async function ensurePrescriptionChannel(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  await assertActivePrescriptionStore(db, input)
  const existing = await db.prescriptionChannel.findFirst({
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  if (existing) return existing
  const publicToken = token()
  return db.prescriptionChannel.create({
    data: {
      createdByUserId: input.actorUserId,
      publicToken,
      publicTokenDigest: digest(publicToken),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function getPrescriptionChannel(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionChannel.findFirst({
    select: {
      id: true,
      publicToken: true,
      staffEnabled: true,
      status: true,
      webEnabled: true,
      whatsappEnabled: true,
      store: {
        select: {
          whatsappStoreBindings: {
            orderBy: { activatedAt: "desc" },
            select: {
              status: true,
              connection: {
                select: { displayNumber: true, status: true },
              },
            },
            take: 1,
            where: { status: "ACTIVE", connection: { status: "ACTIVE" } },
          },
        },
      },
    },
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
}

export async function getPublicPrescriptionChannel(
  db: PrismaClient,
  input: { publicToken: string },
) {
  const channel = await db.prescriptionChannel.findFirst({
    select: {
      id: true,
      publicToken: true,
      staffEnabled: true,
      storeId: true,
      tenantId: true,
      webEnabled: true,
      whatsappEnabled: true,
      store: {
        select: {
          name: true,
          whatsappStoreBindings: {
            orderBy: { activatedAt: "desc" },
            select: {
              status: true,
              connection: {
                select: { displayNumber: true, status: true },
              },
            },
            take: 1,
            where: { status: "ACTIVE", connection: { status: "ACTIVE" } },
          },
        },
      },
      tenant: { select: { name: true } },
    },
    where: {
      publicToken: input.publicToken,
      status: PrescriptionChannelStatus.ACTIVE,
      store: {
        prescriptionSettings: { status: "ACTIVE" },
      },
      webEnabled: true,
    },
  })
  if (!channel) {
    throw new PrescriptionRequestError(
      "PUBLIC_ACCESS_INVALID",
      "This prescription intake link is unavailable.",
    )
  }
  return {
    channelId: channel.id,
    store: { id: channel.storeId, name: channel.store.name },
    tenantName: channel.tenant.name,
    supportedChannels: {
      staff: channel.staffEnabled,
      web: channel.webEnabled,
      whatsapp: channel.whatsappEnabled,
    },
    whatsappDisplayNumber:
      channel.store.whatsappStoreBindings[0]?.connection.displayNumber ?? null,
  }
}

export type CreatePrescriptionRequestInput = {
  channelId?: string | null
  clientRequestId: string
  consentAcceptedAt: Date
  consentVersion: string
  customerEmail?: string | null
  customerName?: string | null
  customerPhone?: string | null
  fulfilmentPreference: "delivery" | "pickup" | "unspecified"
  manualIntakeText?: string | null
  media: PrescriptionMediaManifestInput[]
  source: keyof typeof sourceMap
  sourceContext?: Record<string, unknown> | null
  staffAssistedByUserId?: string | null
  storeId: string
  tenantId: string
}

async function createPrescriptionRequest(
  db: PrismaClient,
  input: CreatePrescriptionRequestInput,
) {
  const manualIntakeText = input.manualIntakeText?.trim() || null
  const media = input.media.length
    ? normalizePrescriptionMediaManifest(input.media)
    : []
  if (media.length === 0 && !manualIntakeText) {
    throw new PrescriptionRequestError(
      "MEDIA_CONFLICT",
      "Prescription intake requires private media or manual transcription.",
    )
  }
  const clientRequestId = input.clientRequestId.trim()
  const payloadHash = createPrescriptionIntakeFingerprint({
    clientRequestId,
    contact: input.customerPhone ?? input.customerEmail,
    media,
    source: input.source,
    storeId: input.storeId,
  })
  const statusToken = token()
  const statusTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.prescriptionRequest.findUnique({
      where: {
        tenantId_clientRequestId: {
          clientRequestId,
          tenantId: input.tenantId,
        },
      },
    })
    if (existing) {
      if (
        existing.payloadHash !== payloadHash ||
        existing.storeId !== input.storeId
      ) {
        throw new PrescriptionRequestError(
          "IDEMPOTENCY_MISMATCH",
          "This intake identity was already used with different details.",
        )
      }
      return { created: false as const, request: existing }
    }

    const request = await tx.prescriptionRequest.create({
      data: {
        channelId: input.channelId,
        clientRequestId,
        consentAcceptedAt: input.consentAcceptedAt,
        consentVersion: input.consentVersion.trim(),
        customerEmail: input.customerEmail?.trim() || null,
        customerName: input.customerName?.trim() || null,
        customerPhone: input.customerPhone?.trim() || null,
        fulfilmentPreference: fulfilmentMap[input.fulfilmentPreference],
        payloadHash,
        reference: makeReference(),
        source: sourceMap[input.source],
        sourceContext:
          input.sourceContext || manualIntakeText
            ? json({
                ...(input.sourceContext ?? {}),
                ...(manualIntakeText ? { manualIntakeText } : {}),
              })
            : undefined,
        staffAssistedByUserId: input.staffAssistedByUserId,
        statusTokenDigest: digest(statusToken),
        statusTokenExpiresAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
        media: {
          create: media.map((page) => ({
            clientMediaId: page.clientMediaId,
            mediaType: page.mediaType,
            objectKey: page.objectKey,
            originalFileName: page.originalFileName,
            pageNumber: page.pageNumber,
            revision: 1,
            sha256: page.sha256,
            sizeBytes: page.sizeBytes,
            storeId: input.storeId,
            tenantId: input.tenantId,
            accessEvents: {
              create: {
                action: PrescriptionMediaAccessAction.UPLOADED,
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
            },
          })),
        },
        auditEvents: {
          create: {
            actorUserId: input.staffAssistedByUserId,
            payload: json({ source: input.source }),
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: PrescriptionRequestAuditEventType.RECEIVED,
          },
        },
      },
    })
    await tx.prescriptionUsageEvent.create({
      data: {
        deduplicationKey: `request-received:${request.id}`,
        dimensions: json({ source: input.source }),
        eventType: "REQUEST_RECEIVED",
        occurredAt: request.createdAt,
        sourceId: request.id,
        sourceType: "request",
        storeId: request.storeId,
        tenantId: request.tenantId,
      },
    })
    return { created: true as const, request }
  })

  return {
    created: result.created,
    reference: result.request.reference,
    requestId: result.request.id,
    statusToken: result.created ? statusToken : null,
    statusTokenExpiresAt: result.request.statusTokenExpiresAt,
  }
}

export async function submitPublicPrescriptionRequest(
  db: PrismaClient,
  input: Omit<
    CreatePrescriptionRequestInput,
    "channelId" | "source" | "storeId" | "tenantId"
  > & {
    publicToken: string
  },
) {
  const channel = await db.prescriptionChannel.findFirst({
    where: {
      publicToken: input.publicToken,
      status: PrescriptionChannelStatus.ACTIVE,
      webEnabled: true,
    },
  })
  if (!channel) {
    throw new PrescriptionRequestError(
      "PUBLIC_ACCESS_INVALID",
      "This prescription intake link is unavailable.",
    )
  }
  await assertActivePrescriptionStore(db, channel)
  return createPrescriptionRequest(db, {
    ...input,
    channelId: channel.id,
    source: "web",
    storeId: channel.storeId,
    tenantId: channel.tenantId,
  })
}

export async function submitStaffPrescriptionRequest(
  db: PrismaClient,
  input: Omit<
    CreatePrescriptionRequestInput,
    "channelId" | "staffAssistedByUserId"
  > & {
    actorUserId: string
    source: "staff_phone" | "staff_walk_in"
  },
) {
  await assertPrescriptionStoreRole(db, {
    role: "attendant",
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  const channel = await ensurePrescriptionChannel(db, {
    actorUserId: input.actorUserId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return createPrescriptionRequest(db, {
    ...input,
    channelId: channel.id,
    staffAssistedByUserId: input.actorUserId,
  })
}

export async function submitWhatsAppPrescriptionRequest(
  db: PrismaClient,
  input: Omit<
    CreatePrescriptionRequestInput,
    "channelId" | "source" | "staffAssistedByUserId"
  > & {
    providerEventId: string
  },
) {
  const channel = await db.prescriptionChannel.findFirst({
    where: {
      status: PrescriptionChannelStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      whatsappEnabled: true,
    },
  })
  if (!channel) {
    throw new PrescriptionRequestError(
      "PUBLIC_ACCESS_INVALID",
      "WhatsApp prescription intake is unavailable.",
    )
  }
  await assertActivePrescriptionStore(db, input)
  return createPrescriptionRequest(db, {
    ...input,
    channelId: channel.id,
    source: "whatsapp",
    sourceContext: {
      ...(input.sourceContext ?? {}),
      providerEventId: input.providerEventId,
    },
  })
}

export async function continueWhatsAppPrescriptionRequest(
  db: PrismaClient,
  input: {
    manualIntakeText?: string
    media: PrescriptionMediaManifestInput[]
    providerEventId: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  const media = normalizePrescriptionMediaManifest(input.media)
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      where: {
        id: input.requestId,
        source: PrescriptionRequestSource.WHATSAPP,
        status: {
          notIn: [
            PrescriptionRequestStatus.CONVERTED,
            PrescriptionRequestStatus.DECLINED,
            PrescriptionRequestStatus.WITHDRAWN,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!request) return null
    if (media.length) {
      const replay = await tx.prescriptionMedia.findFirst({
        where: {
          clientMediaId: { in: media.map((page) => page.clientMediaId) },
          requestId: request.id,
          tenantId: input.tenantId,
        },
      })
      if (replay) {
        return {
          created: false,
          reference: request.reference,
          requestId: request.id,
        }
      }
    }
    const context =
      request.sourceContext &&
      typeof request.sourceContext === "object" &&
      !Array.isArray(request.sourceContext)
        ? (request.sourceContext as Record<string, Prisma.JsonValue>)
        : {}
    if (media.length) {
      const revision = request.currentMediaRevision + 1
      await tx.prescriptionMedia.createMany({
        data: media.map((page) => ({
          clientMediaId: page.clientMediaId,
          mediaType: page.mediaType,
          objectKey: page.objectKey,
          originalFileName: page.originalFileName,
          pageNumber: page.pageNumber,
          requestId: request.id,
          revision,
          sha256: page.sha256,
          sizeBytes: page.sizeBytes,
          storeId: request.storeId,
          tenantId: request.tenantId,
        })),
      })
      await tx.prescriptionTranscription.updateMany({
        data: {
          status: PrescriptionTranscriptionStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
        where: { requestId: request.id },
      })
      await tx.prescriptionRequest.update({
        data: {
          currentMediaRevision: revision,
          currentTranscriptRevision: null,
          sourceContext: json({
            ...context,
            latestProviderEventId: input.providerEventId,
          }),
          status: PrescriptionRequestStatus.MEDIA_REVIEW,
        },
        where: { id: request.id },
      })
      await tx.prescriptionRequestAuditEvent.create({
        data: {
          fromStatus: request.status,
          payload: json({ revision }),
          requestId: request.id,
          storeId: request.storeId,
          tenantId: request.tenantId,
          toStatus: PrescriptionRequestStatus.MEDIA_REVIEW,
          type: PrescriptionRequestAuditEventType.MEDIA_REVISION_CREATED,
        },
      })
    } else if (input.manualIntakeText?.trim()) {
      await tx.prescriptionRequest.update({
        data: {
          sourceContext: json({
            ...context,
            latestProviderEventId: input.providerEventId,
            latestWhatsAppText: input.manualIntakeText.trim(),
          }),
        },
        where: { id: request.id },
      })
    }
    return {
      created: false,
      reference: request.reference,
      requestId: request.id,
    }
  })
}

export async function getPublicPrescriptionRequestStatus(
  db: PrismaClient,
  input: { statusToken: string },
) {
  const request = await db.prescriptionRequest.findFirst({
    select: {
      createdAt: true,
      expiresAt: true,
      fulfilmentPreference: true,
      id: true,
      reference: true,
      status: true,
      store: { select: { name: true } },
      updatedAt: true,
    },
    where: {
      statusTokenDigest: digest(input.statusToken),
      statusTokenExpiresAt: { gt: new Date() },
    },
  })
  if (!request) {
    throw new PrescriptionRequestError(
      "PUBLIC_ACCESS_INVALID",
      "This prescription status link is unavailable.",
    )
  }
  const quote = await db.commerceQuote.findFirst({
    select: {
      currentVersion: {
        select: {
          acceptedOrder: {
            select: {
              prescriptionPickupFulfillment: {
                select: {
                  pickupCodeCiphertext: true,
                  pickupCodeExpiresAt: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
    where: {
      sourceId: request.id,
      sourceType: CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
    },
  })
  const pickup =
    quote?.currentVersion?.acceptedOrder?.prescriptionPickupFulfillment
  const pickupCode =
    pickup?.status === "READY" &&
    pickup.pickupCodeCiphertext &&
    pickup.pickupCodeExpiresAt &&
    pickup.pickupCodeExpiresAt > new Date()
      ? String(decryptPrescriptionData(pickup.pickupCodeCiphertext).code ?? "")
      : null
  return {
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    fulfilmentPreference: request.fulfilmentPreference.toLowerCase(),
    reference: request.reference,
    pickup:
      pickup?.status === "READY"
        ? { code: pickupCode, expiresAt: pickup.pickupCodeExpiresAt }
        : null,
    status: statusValue(request.status),
    storeName: request.store.name,
    updatedAt: request.updatedAt,
  }
}

export type PrescriptionQueueInput = {
  assignees?: string[] | null
  cursor?: string | null
  from?: string | null
  pageSize?: number
  q?: string | null
  sort?:
    | [
        "created_at" | "reference" | "source" | "status" | "updated_at",
        "asc" | "desc",
      ]
    | null
  sources?: Array<keyof typeof sourceMap> | null
  statuses?: PrescriptionRequestStatusValue[] | null
  storeId: string
  tenantId: string
  to?: string | null
}

export function prescriptionQueueWhere(
  input: PrescriptionQueueInput,
): Prisma.PrescriptionRequestWhereInput {
  return {
    ...(input.assignees?.length
      ? {
          OR: [
            { staffAssistedByUserId: { in: input.assignees } },
            {
              pharmacistReviews: {
                some: { pharmacistUserId: { in: input.assignees } },
              },
            },
          ],
        }
      : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from
              ? { gte: new Date(`${input.from}T00:00:00.000Z`) }
              : {}),
            ...(input.to ? { lt: new Date(`${input.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
    storeId: input.storeId,
    tenantId: input.tenantId,
    ...(input.q?.trim()
      ? { reference: { contains: input.q.trim(), mode: "insensitive" } }
      : {}),
    ...(input.sources?.length
      ? { source: { in: input.sources.map((source) => sourceMap[source]) } }
      : {}),
    ...(input.statuses?.length
      ? {
          status: {
            in: input.statuses.map((status) => statusInputMap[status]),
          },
        }
      : {}),
  }
}

export async function listPrescriptionRequests(
  db: PrismaClient,
  input: PrescriptionQueueInput,
) {
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100)
  const [sortField, sortDirection] = input.sort ?? ["created_at", "desc"]
  const orderByField = {
    created_at: "createdAt",
    reference: "reference",
    source: "source",
    status: "status",
    updated_at: "updatedAt",
  }[sortField]
  const rows = await db.prescriptionRequest.findMany({
    cursor: input.cursor ? { id: input.cursor } : undefined,
    orderBy: [
      { [orderByField]: sortDirection },
      { id: sortDirection },
    ] as Prisma.PrescriptionRequestOrderByWithRelationInput[],
    select: {
      createdAt: true,
      fulfilmentPreference: true,
      id: true,
      reference: true,
      source: true,
      status: true,
      updatedAt: true,
    },
    skip: input.cursor ? 1 : 0,
    take: pageSize + 1,
    where: prescriptionQueueWhere(input),
  })
  const hasNextPage = rows.length > pageSize
  const data = rows.slice(0, pageSize).map((request) => ({
    createdAt: request.createdAt,
    fulfilmentPreference: request.fulfilmentPreference.toLowerCase(),
    id: request.id,
    reference: request.reference,
    source: sourceValue(request.source),
    status: statusValue(request.status),
    updatedAt: request.updatedAt,
  }))
  return {
    data,
    meta: {
      cursor: hasNextPage ? (data.at(-1)?.id ?? null) : null,
      hasNextPage,
      hasPreviousPage: Boolean(input.cursor),
    },
  }
}

const prescriptionDetailInclude = {
  auditEvents: { orderBy: { effectiveAt: "asc" as const } },
  media: {
    orderBy: [{ revision: "asc" as const }, { pageNumber: "asc" as const }],
  },
  pharmacistReviews: { orderBy: { createdAt: "asc" as const } },
  transcriptions: {
    include: {
      lines: {
        include: { mapping: true },
        orderBy: { lineNumber: "asc" as const },
      },
    },
    orderBy: { revision: "asc" as const },
  },
} satisfies Prisma.PrescriptionRequestInclude

export async function getPrescriptionRequest(
  db: PrismaClient,
  input: {
    actorUserId: string
    breakGlassControlId?: string | null
    reason: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  const request = await db.prescriptionRequest.findFirst({
    include: prescriptionDetailInclude,
    where: {
      id: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!request) {
    throw new PrescriptionRequestError(
      "REQUEST_NOT_FOUND",
      "Prescription Request not found.",
    )
  }
  const accessTypes = ["customer_data"]
  if (request.transcriptions.length) accessTypes.push("transcript")
  if (request.pharmacistReviews.length) {
    accessTypes.push("pharmacist_decision")
  }
  await recordPrescriptionSensitiveAccess(db, {
    accessTypes,
    actorUserId: input.actorUserId,
    incidentControlId: input.breakGlassControlId,
    reason: input.reason,
    requestId: request.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return request
}

async function transitionPrescriptionRequest(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId?: string | null
    from: PrescriptionRequestStatus
    reason?: string | null
    requestId: string
    storeId: string
    tenantId: string
    to: PrescriptionRequestStatus
    type?: PrescriptionRequestAuditEventType
  },
) {
  assertPrescriptionRequestTransition(
    statusValue(input.from),
    statusValue(input.to),
  )
  const updated = await tx.prescriptionRequest.updateMany({
    data: { status: input.to },
    where: {
      id: input.requestId,
      status: input.from,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (updated.count !== 1) {
    throw new PrescriptionRequestError(
      "REQUEST_CONFLICT",
      "The Prescription Request changed. Refresh and try again.",
    )
  }
  await tx.prescriptionRequestAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      fromStatus: input.from,
      reason: input.reason,
      requestId: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      toStatus: input.to,
      type: input.type ?? PrescriptionRequestAuditEventType.STATUS_CHANGED,
    },
  })
}

export async function recordPrescriptionMediaSafety(
  db: PrismaClient,
  input: {
    mediaId: string
    outcome: "quarantined" | "rejected" | "safe"
    providerEventId: string
    safetyMetadata?: Record<string, unknown>
    storeId: string
    tenantId: string
  },
) {
  const mappedStatus = {
    quarantined: PrescriptionMediaStatus.QUARANTINED,
    rejected: PrescriptionMediaStatus.REJECTED,
    safe: PrescriptionMediaStatus.SAFE,
  }[input.outcome]
  return db.$transaction(async (tx) => {
    const media = await tx.prescriptionMedia.findFirst({
      include: { request: true },
      where: {
        id: input.mediaId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!media)
      throw new PrescriptionRequestError(
        "REQUEST_NOT_FOUND",
        "Prescription media not found.",
      )
    if (media.status !== PrescriptionMediaStatus.PENDING) {
      return media
    }
    const updated = await tx.prescriptionMedia.update({
      data: {
        safetyMetadata: json({
          ...(input.safetyMetadata ?? {}),
          providerEventId: input.providerEventId,
        }),
        status: mappedStatus,
      },
      where: { id: media.id },
    })
    await tx.prescriptionMediaAccessEvent.create({
      data: {
        action:
          input.outcome === "safe"
            ? PrescriptionMediaAccessAction.SCANNED
            : input.outcome === "quarantined"
              ? PrescriptionMediaAccessAction.QUARANTINED
              : PrescriptionMediaAccessAction.REJECTED,
        mediaId: media.id,
        metadata: json({ providerEventId: input.providerEventId }),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return updated
  })
}

export async function listPendingPrescriptionMediaForSafety(
  db: PrismaClient,
  input: { requestId: string },
) {
  return db.prescriptionMedia.findMany({
    orderBy: [{ revision: "asc" }, { pageNumber: "asc" }],
    select: {
      id: true,
      objectKey: true,
      storeId: true,
      tenantId: true,
    },
    where: {
      requestId: input.requestId,
      status: PrescriptionMediaStatus.PENDING,
    },
  })
}

export async function recordPrescriptionMediaAccess(
  db: PrismaClient,
  input: {
    actorUserId: string
    mediaId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  await assertActivePrescriptionStore(db, input)
  const access = await assertPrescriptionOperationalOrBreakGlassAccess(db, {
    actorUserId: input.actorUserId,
    reason: input.reason,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  const media = await db.prescriptionMedia.findFirst({
    select: { id: true, objectKey: true, requestId: true, status: true },
    where: {
      id: input.mediaId,
      status: PrescriptionMediaStatus.SAFE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!media) {
    throw new PrescriptionRequestError(
      "MEDIA_NOT_READY",
      "Authorized prescription media was not found.",
    )
  }
  await recordPrescriptionSensitiveAccess(db, {
    accessTypes: ["customer_data"],
    actorUserId: input.actorUserId,
    incidentControlId: access.breakGlassControlId,
    reason: input.reason,
    requestId: media.requestId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  await db.prescriptionMediaAccessEvent.create({
    data: {
      action: PrescriptionMediaAccessAction.ACCESSED,
      actorUserId: input.actorUserId,
      mediaId: media.id,
      reason: input.reason.trim(),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return { mediaId: media.id, objectKey: media.objectKey }
}

export async function requestClearerPrescriptionMedia(
  db: PrismaClient,
  input: {
    actorUserId: string
    reason: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  await assertPrescriptionStoreRole(db, {
    ...input,
    role: "attendant",
    userId: input.actorUserId,
  })
  const reason = input.reason.trim()
  if (!reason) {
    throw new PrescriptionRequestError(
      "MEDIA_CONFLICT",
      "A neutral clearer-media reason is required.",
    )
  }
  const reuploadToken = token()
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000)
  const request = await db.$transaction(async (tx) => {
    const current = await tx.prescriptionRequest.findFirst({
      where: {
        id: input.requestId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!current) {
      throw new PrescriptionRequestError(
        "REQUEST_NOT_FOUND",
        "Prescription Request not found.",
      )
    }
    if (
      current.status !== PrescriptionRequestStatus.MEDIA_REVIEW &&
      current.status !== PrescriptionRequestStatus.ATTENDANT_VERIFICATION
    ) {
      throw new PrescriptionRequestError(
        "REQUEST_CONFLICT",
        "Clearer media cannot be requested in the current state.",
      )
    }
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: current.status,
      reason,
      to: PrescriptionRequestStatus.NEEDS_CLEARER_MEDIA,
      type: PrescriptionRequestAuditEventType.CLEARER_MEDIA_REQUESTED,
    })
    return tx.prescriptionRequest.update({
      data: {
        clearerMediaReason: reason,
        reuploadTokenDigest: digest(reuploadToken),
        reuploadTokenExpiresAt: expiresAt,
      },
      where: { id: current.id },
    })
  })
  return {
    expiresAt,
    reference: request.reference,
    reuploadToken,
  }
}

export async function replacePrescriptionMedia(
  db: PrismaClient,
  input: { media: PrescriptionMediaManifestInput[]; reuploadToken: string },
) {
  const media = normalizePrescriptionMediaManifest(input.media)
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      where: {
        reuploadTokenDigest: digest(input.reuploadToken),
        reuploadTokenExpiresAt: { gt: new Date() },
        status: PrescriptionRequestStatus.NEEDS_CLEARER_MEDIA,
      },
    })
    if (!request) {
      throw new PrescriptionRequestError(
        "PUBLIC_ACCESS_INVALID",
        "This clearer-media link is unavailable.",
      )
    }
    const revision = request.currentMediaRevision + 1
    await tx.prescriptionMedia.createMany({
      data: media.map((page) => ({
        clientMediaId: page.clientMediaId,
        mediaType: page.mediaType,
        objectKey: page.objectKey,
        originalFileName: page.originalFileName,
        pageNumber: page.pageNumber,
        requestId: request.id,
        revision,
        sha256: page.sha256,
        sizeBytes: page.sizeBytes,
        storeId: request.storeId,
        tenantId: request.tenantId,
      })),
    })
    await tx.prescriptionTranscription.updateMany({
      data: {
        status: PrescriptionTranscriptionStatus.SUPERSEDED,
        supersededAt: new Date(),
      },
      where: {
        requestId: request.id,
        status: {
          in: [
            PrescriptionTranscriptionStatus.PENDING,
            PrescriptionTranscriptionStatus.PROCESSING,
            PrescriptionTranscriptionStatus.COMPLETED,
          ],
        },
      },
    })
    await tx.prescriptionRequest.update({
      data: {
        clearerMediaReason: null,
        currentMediaRevision: revision,
        currentTranscriptRevision: null,
        reuploadTokenDigest: null,
        reuploadTokenExpiresAt: null,
      },
      where: { id: request.id },
    })
    await transitionPrescriptionRequest(tx, {
      from: PrescriptionRequestStatus.NEEDS_CLEARER_MEDIA,
      requestId: request.id,
      storeId: request.storeId,
      tenantId: request.tenantId,
      to: PrescriptionRequestStatus.MEDIA_REVIEW,
      type: PrescriptionRequestAuditEventType.MEDIA_REVISION_CREATED,
    })
    return {
      currentMediaRevision: revision,
      reference: request.reference,
      requestId: request.id,
    }
  })
}

export async function markPrescriptionMediaReadyForTranscription(
  db: PrismaClient,
  input: {
    actorUserId: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  await assertPrescriptionStoreRole(db, {
    ...input,
    role: "attendant",
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      include: { media: true },
      where: {
        id: input.requestId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!request)
      throw new PrescriptionRequestError(
        "REQUEST_NOT_FOUND",
        "Prescription Request not found.",
      )
    const currentMedia = request.media.filter(
      (item) => item.revision === request.currentMediaRevision,
    )
    if (
      currentMedia.length < 1 ||
      currentMedia.some((item) => item.status !== PrescriptionMediaStatus.SAFE)
    ) {
      throw new PrescriptionRequestError(
        "MEDIA_NOT_READY",
        "Every current prescription page must pass safety review.",
      )
    }
    const from =
      request.status === PrescriptionRequestStatus.RECEIVED
        ? PrescriptionRequestStatus.RECEIVED
        : PrescriptionRequestStatus.MEDIA_REVIEW
    if (from === PrescriptionRequestStatus.RECEIVED) {
      await transitionPrescriptionRequest(tx, {
        ...input,
        from,
        to: PrescriptionRequestStatus.MEDIA_REVIEW,
      })
    }
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.MEDIA_REVIEW,
      to: PrescriptionRequestStatus.TRANSCRIBING,
      type: PrescriptionRequestAuditEventType.TRANSCRIPTION_REQUESTED,
    })
    const latest = await tx.prescriptionTranscription.findFirst({
      orderBy: { revision: "desc" },
      where: { requestId: request.id },
    })
    return tx.prescriptionTranscription.create({
      data: {
        mediaRevision: request.currentMediaRevision,
        providerKey: "pending-provider-resolution",
        requestId: request.id,
        requestedByUserId: input.actorUserId,
        revision: (latest?.revision ?? 0) + 1,
      },
    })
  })
}

export async function startManualPrescriptionTranscription(
  db: PrismaClient,
  input: {
    actorUserId: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  await assertPrescriptionStoreRole(db, {
    ...input,
    role: "attendant",
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      include: { media: true, transcriptions: true },
      where: {
        id: input.requestId,
        status: PrescriptionRequestStatus.RECEIVED,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const context = request?.sourceContext as
      | { manualIntakeText?: unknown }
      | null
      | undefined
    const manualText =
      typeof context?.manualIntakeText === "string"
        ? context.manualIntakeText.trim()
        : ""
    if (!request || request.media.length > 0 || !manualText) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "A media-free staff intake with manual transcription is required.",
      )
    }
    const lines = manualText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length < 1 || lines.length > 100) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Manual transcription requires between one and 100 lines.",
      )
    }
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.RECEIVED,
      to: PrescriptionRequestStatus.MEDIA_REVIEW,
    })
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.MEDIA_REVIEW,
      to: PrescriptionRequestStatus.TRANSCRIBING,
      type: PrescriptionRequestAuditEventType.TRANSCRIPTION_REQUESTED,
    })
    const revision =
      Math.max(0, ...request.transcriptions.map((item) => item.revision)) + 1
    const transcription = await tx.prescriptionTranscription.create({
      data: {
        completedAt: new Date(),
        mediaRevision: request.currentMediaRevision,
        providerKey: "manual-staff-entry",
        requestId: request.id,
        requestedByUserId: input.actorUserId,
        revision,
        status: PrescriptionTranscriptionStatus.COMPLETED,
        lines: {
          create: lines.map((draftText, index) => ({
            draftText,
            lineNumber: index + 1,
          })),
        },
      },
    })
    await tx.prescriptionRequest.update({
      data: { currentTranscriptRevision: revision },
      where: { id: request.id },
    })
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.TRANSCRIBING,
      to: PrescriptionRequestStatus.ATTENDANT_VERIFICATION,
      type: PrescriptionRequestAuditEventType.TRANSCRIPTION_COMPLETED,
    })
    return transcription
  })
}

export async function completePrescriptionTranscription(
  db: PrismaClient,
  input: {
    failureCode?: string | null
    lines?: Array<{
      confidence?: number | null
      draftText: string
      lineNumber: number
    }>
    providerKey: string
    providerOperationId?: string | null
    transcriptionId: string
  },
) {
  return db.$transaction(async (tx) => {
    const transcription = await tx.prescriptionTranscription.findUnique({
      include: { request: true },
      where: { id: input.transcriptionId },
    })
    if (!transcription)
      throw new PrescriptionRequestError(
        "REQUEST_NOT_FOUND",
        "Transcription not found.",
      )
    if (
      transcription.status === PrescriptionTranscriptionStatus.COMPLETED ||
      transcription.status === PrescriptionTranscriptionStatus.FAILED
    ) {
      return transcription
    }
    const failed = Boolean(input.failureCode)
    const updated = await tx.prescriptionTranscription.update({
      data: {
        completedAt: new Date(),
        failureCode: input.failureCode,
        providerKey: input.providerKey,
        providerOperationId: input.providerOperationId,
        status: failed
          ? PrescriptionTranscriptionStatus.FAILED
          : PrescriptionTranscriptionStatus.COMPLETED,
        ...(!failed && input.lines
          ? {
              lines: {
                create: input.lines.map((line) => ({
                  confidence: line.confidence,
                  draftText: line.draftText,
                  lineNumber: line.lineNumber,
                })),
              },
            }
          : {}),
      },
      where: { id: transcription.id },
    })
    if (!failed) {
      await tx.prescriptionRequest.update({
        data: { currentTranscriptRevision: transcription.revision },
        where: { id: transcription.requestId },
      })
      await transitionPrescriptionRequest(tx, {
        from: PrescriptionRequestStatus.TRANSCRIBING,
        requestId: transcription.requestId,
        storeId: transcription.request.storeId,
        tenantId: transcription.request.tenantId,
        to: PrescriptionRequestStatus.ATTENDANT_VERIFICATION,
        type: PrescriptionRequestAuditEventType.TRANSCRIPTION_COMPLETED,
      })
    }
    return updated
  })
}

export async function claimPrescriptionTranscriptionJob(
  db: PrismaClient,
  input: { transcriptionId: string },
) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.prescriptionTranscription.updateMany({
      data: {
        startedAt: new Date(),
        status: PrescriptionTranscriptionStatus.PROCESSING,
      },
      where: {
        id: input.transcriptionId,
        status: PrescriptionTranscriptionStatus.PENDING,
      },
    })
    if (claimed.count !== 1) return null
    const transcription = await tx.prescriptionTranscription.findUnique({
      include: {
        request: {
          include: {
            media: {
              orderBy: { pageNumber: "asc" },
            },
          },
        },
      },
      where: { id: input.transcriptionId },
    })
    if (!transcription) return null
    const current =
      transcription.request.currentMediaRevision ===
        transcription.mediaRevision &&
      transcription.request.status === PrescriptionRequestStatus.TRANSCRIBING
    const media = transcription.request.media.filter(
      (page) => page.revision === transcription.mediaRevision,
    )
    if (
      !current ||
      media.length < 1 ||
      media.some((page) => page.status !== PrescriptionMediaStatus.SAFE)
    ) {
      await tx.prescriptionTranscription.update({
        data: {
          status: PrescriptionTranscriptionStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
        where: { id: transcription.id },
      })
      return null
    }
    return {
      mediaRevision: transcription.mediaRevision,
      objectKeys: media.map((page) => page.objectKey),
      requestId: transcription.requestId,
      transcriptionId: transcription.id,
    }
  })
}

export async function retryPrescriptionTranscriptionJob(
  db: PrismaClient,
  input: { transcriptionId: string },
) {
  await db.prescriptionTranscription.updateMany({
    data: { startedAt: null, status: PrescriptionTranscriptionStatus.PENDING },
    where: {
      id: input.transcriptionId,
      status: PrescriptionTranscriptionStatus.PROCESSING,
    },
  })
}

export async function verifyPrescriptionTranscriptionLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    lineId: string
    status: "unreadable" | "verified"
    storeId: string
    tenantId: string
    verifiedText?: string | null
  },
) {
  await assertPrescriptionStoreRole(db, {
    ...input,
    role: "attendant",
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const line = await tx.prescriptionTranscriptionLine.findFirst({
      include: { transcription: { include: { request: true } } },
      where: {
        id: input.lineId,
        transcription: {
          request: { storeId: input.storeId, tenantId: input.tenantId },
        },
      },
    })
    if (
      !line ||
      line.transcription.request.currentTranscriptRevision !==
        line.transcription.revision
    ) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Current transcription line not found.",
      )
    }
    if (
      line.transcription.request.status !==
      PrescriptionRequestStatus.ATTENDANT_VERIFICATION
    ) {
      throw new PrescriptionRequestError(
        "REQUEST_CONFLICT",
        "The request is not awaiting attendant verification.",
      )
    }
    const verifiedText =
      input.status === "verified" ? input.verifiedText?.trim() : null
    if (input.status === "verified" && !verifiedText) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Verified lines require confirmed text.",
      )
    }
    const updated = await tx.prescriptionTranscriptionLine.update({
      data: {
        status:
          input.status === "verified"
            ? PrescriptionLineVerificationStatus.VERIFIED
            : PrescriptionLineVerificationStatus.UNREADABLE,
        verifiedAt: new Date(),
        verifiedByUserId: input.actorUserId,
        verifiedText,
      },
      where: { id: line.id },
    })
    await tx.prescriptionRequestAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: json({ lineId: line.id, status: input.status }),
        requestId: line.transcription.requestId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: PrescriptionRequestAuditEventType.LINE_VERIFIED,
      },
    })
    return updated
  })
}

export async function submitPrescriptionForPharmacistReview(
  db: PrismaClient,
  input: {
    actorUserId: string
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  await assertPrescriptionStoreRole(db, {
    ...input,
    role: "attendant",
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      where: {
        id: input.requestId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!request || request.currentTranscriptRevision === null) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Current transcription was not found.",
      )
    }
    const transcript = await tx.prescriptionTranscription.findFirst({
      include: { lines: true },
      where: {
        requestId: request.id,
        revision: request.currentTranscriptRevision,
      },
    })
    if (
      !transcript ||
      !requiresVerifiedTranscript(
        transcript.lines.map((line) => ({
          status: line.status.toLowerCase() as
            | "pending"
            | "unreadable"
            | "verified",
        })),
      )
    ) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Resolve every current transcription line first.",
      )
    }
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.ATTENDANT_VERIFICATION,
      to: PrescriptionRequestStatus.PHARMACIST_REVIEW,
    })
    return { requestId: request.id, status: "pharmacist_review" as const }
  })
}

export type PharmacistLineDecision = {
  availability:
    | "available"
    | "declined"
    | "partial"
    | "restricted"
    | "unavailable"
  customerWording?: string | null
  isAlternative?: boolean
  offeringId?: string | null
  quantity?: string | null
  transcriptionLineId: string
}

export async function recordPrescriptionPharmacistReview(
  db: PrismaClient,
  input: {
    actorUserId: string
    decision: "declined" | "needs_clarification" | "released"
    expectedMediaRevision: number
    expectedTranscriptRevision: number
    lines: PharmacistLineDecision[]
    reason?: string | null
    requestId: string
    storeId: string
    tenantId: string
  },
) {
  const role = await assertPrescriptionStoreRole(db, {
    ...input,
    role: "pharmacist",
    userId: input.actorUserId,
  })
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionRequest.findFirst({
      include: {
        transcriptions: {
          include: { lines: true },
          where: { revision: input.expectedTranscriptRevision },
        },
      },
      where: {
        currentMediaRevision: input.expectedMediaRevision,
        currentTranscriptRevision: input.expectedTranscriptRevision,
        id: input.requestId,
        status: PrescriptionRequestStatus.PHARMACIST_REVIEW,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const transcript = request?.transcriptions[0]
    if (!request || !transcript) {
      throw new PrescriptionRequestError(
        "REQUEST_CONFLICT",
        "The reviewed prescription revision is stale.",
      )
    }
    const currentLineIds = new Set(transcript.lines.map((line) => line.id))
    if (
      input.decision === "released" &&
      (input.lines.length !== currentLineIds.size ||
        input.lines.some(
          (line) => !currentLineIds.has(line.transcriptionLineId),
        ))
    ) {
      throw new PrescriptionRequestError(
        "TRANSCRIPT_NOT_READY",
        "Every current line requires a pharmacist decision.",
      )
    }
    const availabilityMap = {
      available: PrescriptionLineAvailability.AVAILABLE,
      declined: PrescriptionLineAvailability.DECLINED,
      partial: PrescriptionLineAvailability.PARTIAL,
      restricted: PrescriptionLineAvailability.RESTRICTED,
      unavailable: PrescriptionLineAvailability.UNAVAILABLE,
    } as const
    for (const line of input.lines) {
      if (
        (line.availability === "available" ||
          line.availability === "partial") &&
        !line.offeringId
      ) {
        throw new PrescriptionRequestError(
          "TRANSCRIPT_NOT_READY",
          "Available lines must map to a Product Offering.",
        )
      }
      let inventorySnapshot:
        | Awaited<ReturnType<typeof getCatalogOfferingAvailability>>
        | undefined
      if (line.offeringId) {
        const offering = await tx.sellableOffering.findFirst({
          where: {
            id: line.offeringId,
            kind: SellableOfferingKind.PRODUCT_UNIT,
            status: CatalogRecordStatus.ACTIVE,
            storeAvailability: {
              some: { isAvailable: true, storeId: input.storeId },
            },
            tenantId: input.tenantId,
          },
        })
        if (!offering) {
          throw new PrescriptionRequestError(
            "TRANSCRIPT_NOT_READY",
            "Mapped Product Offering is unavailable.",
          )
        }
        inventorySnapshot = await getCatalogOfferingAvailability(tx, {
          offeringId: line.offeringId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      }
      await tx.prescriptionLineMapping.upsert({
        create: {
          availability: availabilityMap[line.availability],
          customerWording: line.customerWording?.trim() || null,
          isAlternative: line.isAlternative ?? false,
          mappedByUserId: input.actorUserId,
          balanceRevision: inventorySnapshot?.revision,
          configurationVersionId: inventorySnapshot?.configurationVersionId,
          offeringId: line.offeringId,
          quantity: line.quantity,
          transcriptionLineId: line.transcriptionLineId,
        },
        update: {
          availability: availabilityMap[line.availability],
          customerWording: line.customerWording?.trim() || null,
          isAlternative: line.isAlternative ?? false,
          mappedAt: new Date(),
          mappedByUserId: input.actorUserId,
          balanceRevision: inventorySnapshot?.revision,
          configurationVersionId: inventorySnapshot?.configurationVersionId,
          offeringId: line.offeringId,
          quantity: line.quantity,
        },
        where: { transcriptionLineId: line.transcriptionLineId },
      })
    }
    const decisionMap = {
      declined: PrescriptionPharmacistDecision.DECLINED,
      needs_clarification: PrescriptionPharmacistDecision.NEEDS_CLARIFICATION,
      released: PrescriptionPharmacistDecision.RELEASED,
    } as const
    const review = await tx.prescriptionPharmacistReview.create({
      data: {
        decision: decisionMap[input.decision],
        mediaRevision: input.expectedMediaRevision,
        pharmacistRoleId: role.id,
        pharmacistUserId: input.actorUserId,
        reason: input.reason?.trim() || null,
        requestId: input.requestId,
        transcriptRevision: input.expectedTranscriptRevision,
      },
    })
    const to =
      input.decision === "released"
        ? PrescriptionRequestStatus.READY_TO_QUOTE
        : input.decision === "needs_clarification"
          ? PrescriptionRequestStatus.NEEDS_CLARIFICATION
          : PrescriptionRequestStatus.DECLINED
    await transitionPrescriptionRequest(tx, {
      ...input,
      from: PrescriptionRequestStatus.PHARMACIST_REVIEW,
      reason: input.reason,
      to,
      type: PrescriptionRequestAuditEventType.PHARMACIST_REVIEWED,
    })
    return review
  })
}

export async function issuePrescriptionQuote(
  db: PrismaClient,
  input: {
    actorUserId: string
    availabilityOutcome: "full" | "partial" | "unavailable"
    clientQuoteId: string
    clientVersionId: string
    customerNote?: string | null
    discountMinor?: number
    expiresAt?: Date
    fulfilmentPromise?: string | null
    lines: Array<{
      transcriptionLineId: string
      unitPriceMinor?: number
    }>
    requestId: string
    storeId: string
    taxMinor?: number
    tenantId: string
  },
) {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  const request = await db.prescriptionRequest.findFirst({
    include: {
      transcriptions: {
        include: {
          lines: {
            include: { mapping: true },
            orderBy: { lineNumber: "asc" },
          },
        },
        where: { revision: { not: 0 } },
      },
    },
    where: {
      id: input.requestId,
      status: PrescriptionRequestStatus.READY_TO_QUOTE,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!request || request.currentTranscriptRevision === null) {
    throw new PrescriptionRequestError(
      "REQUEST_CONFLICT",
      "A pharmacist-released Prescription Request is required.",
    )
  }
  const transcript = request.transcriptions.find(
    (item) => item.revision === request.currentTranscriptRevision,
  )
  if (!transcript || transcript.lines.some((line) => !line.mapping)) {
    throw new PrescriptionRequestError(
      "TRANSCRIPT_NOT_READY",
      "Every current line requires a pharmacist mapping.",
    )
  }
  const prices = new Map(
    input.lines.map((line) => [line.transcriptionLineId, line.unitPriceMinor]),
  )
  if (prices.size !== transcript.lines.length) {
    throw new PrescriptionRequestError(
      "TRANSCRIPT_NOT_READY",
      "Every current line requires a Quote outcome.",
    )
  }
  return issueCommerceQuote(db, {
    actorUserId: input.actorUserId,
    availabilityOutcome: input.availabilityOutcome,
    clientQuoteId: input.clientQuoteId,
    clientVersionId: input.clientVersionId,
    customerNote: input.customerNote ?? undefined,
    discountMinor: input.discountMinor,
    expiresAt: input.expiresAt,
    fulfilmentPromise: input.fulfilmentPromise ?? undefined,
    fulfilmentType: "pickup",
    lines: transcript.lines.map((line) => {
      const mapping = line.mapping
      if (!mapping) {
        throw new PrescriptionRequestError(
          "TRANSCRIPT_NOT_READY",
          "Every current line requires a pharmacist mapping.",
        )
      }
      const payable =
        mapping.availability === PrescriptionLineAvailability.AVAILABLE ||
        mapping.availability === PrescriptionLineAvailability.PARTIAL
      const unitPriceMinor = prices.get(line.id)
      if (payable && unitPriceMinor === undefined) {
        throw new PrescriptionRequestError(
          "TRANSCRIPT_NOT_READY",
          "Available prescription lines require a price.",
        )
      }
      const outcome = payable
        ? mapping.isAlternative
          ? ("alternative" as const)
          : ("included" as const)
        : mapping.availability === PrescriptionLineAvailability.DECLINED
          ? ("declined" as const)
          : ("unavailable" as const)
      return {
        balanceRevision: mapping.balanceRevision ?? undefined,
        configurationVersionId: mapping.configurationVersionId ?? undefined,
        customerNote: mapping.customerWording ?? undefined,
        offeringId: mapping.offeringId ?? undefined,
        outcome,
        quantity: mapping.quantity?.toString(),
        sourceLineId: line.id,
        unitPriceMinor,
      }
    }),
    sourceId: request.id,
    sourceType: "prescription_request",
    storeId: input.storeId,
    taxMinor: input.taxMinor,
    tenantId: input.tenantId,
  })
}

export async function getPublicPrescriptionQuote(
  db: PrismaClient,
  input: { acceptanceToken: string },
) {
  const quote = await getPublicCommerceQuote(db, input)
  if (quote.sourceType !== "prescription_request") {
    throw new PrescriptionRequestError(
      "PUBLIC_ACCESS_INVALID",
      "This prescription Quote is unavailable.",
    )
  }
  return quote
}

export function assertPrescriptionPickupQuoteAcceptance(input: {
  availabilityOutcome: "full" | "partial" | "unavailable"
  fulfilmentType: "delivery" | "pickup" | "unspecified"
  partialAcknowledged: boolean
}) {
  if (input.fulfilmentType !== "pickup") {
    throw new Error("This Quote is not a prescription pickup Quote.")
  }
  if (input.availabilityOutcome === "partial" && !input.partialAcknowledged) {
    throw new Error(
      "Partial availability must be acknowledged before acceptance.",
    )
  }
}

export async function acceptPrescriptionPickupQuote(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    clientAcceptanceId: string
    partialAcknowledged: boolean
  },
) {
  return acceptPrescriptionQuoteForFulfilment(db, input, "pickup")
}

export async function acceptPrescriptionDeliveryQuote(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    clientAcceptanceId: string
    partialAcknowledged: boolean
  },
) {
  return acceptPrescriptionQuoteForFulfilment(db, input, "delivery")
}

async function acceptPrescriptionQuoteForFulfilment(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    clientAcceptanceId: string
    partialAcknowledged: boolean
  },
  expectedFulfilment: "delivery" | "pickup",
) {
  try {
    return await db.$transaction(async (tx) => {
      const context = await getCommerceQuoteAcceptanceContext(tx, input)
      if (context.replayOrderId) {
        const order = await tx.commercialOrder.findFirstOrThrow({
          select: { customerPhone: true, storeId: true, tenantId: true },
          where: {
            id: context.replayOrderId,
            storeId: context.version.quote.storeId,
            tenantId: context.version.quote.tenantId,
          },
        })
        return {
          notification: order.customerPhone
            ? {
                customerPhone: order.customerPhone,
                storeId: order.storeId,
                tenantId: order.tenantId,
              }
            : null,
          orderId: context.replayOrderId,
          versionId: context.version.id,
        }
      }
      const { version } = context
      if (
        version.quote.sourceType !==
        CommerceQuoteSourceType.PRESCRIPTION_REQUEST
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "This Quote is not a prescription Quote.",
        )
      }
      try {
        const fulfilmentType = version.fulfilmentType.toLowerCase() as
          | "delivery"
          | "pickup"
          | "unspecified"
        if (fulfilmentType !== expectedFulfilment) {
          throw new Error(
            `This Quote is not a prescription ${expectedFulfilment} Quote.`,
          )
        }
        if (
          version.availabilityOutcome ===
            CommerceQuoteAvailabilityOutcome.PARTIAL &&
          !input.partialAcknowledged
        ) {
          throw new Error(
            "Partial availability must be acknowledged before acceptance.",
          )
        }
      } catch (error) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          error instanceof Error ? error.message : "Quote cannot be accepted.",
        )
      }
      const request = await tx.prescriptionRequest.findFirst({
        where: {
          id: version.quote.sourceId,
          status: PrescriptionRequestStatus.QUOTED,
          storeId: version.quote.storeId,
          tenantId: version.quote.tenantId,
        },
      })
      if (!request) {
        throw new CommerceQuoteError(
          "QUOTE_SOURCE_NOT_FOUND",
          "Prescription Request source not found.",
        )
      }
      const payableLines = version.lines.filter(
        (line) =>
          line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
          line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
      )
      if (
        payableLines.some(
          (line) =>
            !line.offeringId ||
            !line.quantity ||
            line.unitPriceMinor === null ||
            !line.configurationVersionId ||
            line.balanceRevision === null,
        )
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Accepted prescription Quote contains an incomplete inventory snapshot.",
        )
      }
      const order = await createCommercialOrderInTransaction(tx, {
        actorUserId: "public_prescription_quote_acceptance",
        clientOrderId: `${input.clientAcceptanceId}:order`,
        customerEmail: request.customerEmail ?? undefined,
        customerName: request.customerName ?? undefined,
        customerPhone: request.customerPhone ?? undefined,
        createTrackedServiceWork: false,
        discountMinor: version.discountMinor,
        lines: payableLines.map((line) => {
          if (
            !line.offeringId ||
            !line.quantity ||
            line.unitPriceMinor === null ||
            !line.configurationVersionId ||
            line.balanceRevision === null
          ) {
            throw new CommerceQuoteError(
              "QUOTE_CONFLICT",
              "Accepted prescription Quote contains an incomplete inventory snapshot.",
            )
          }
          return {
            expectedBalanceRevision: line.balanceRevision,
            expectedConfigurationVersionId: line.configurationVersionId,
            offeringId: line.offeringId,
            quantity: line.quantity.toString(),
            trustedUnitPriceMinor: line.unitPriceMinor,
          }
        }),
        schemaVersion: 1,
        serviceChargeMinor: version.fulfilmentFeeMinor,
        storeId: version.quote.storeId,
        taxMinor: version.taxMinor,
        tenantId: version.quote.tenantId,
      })
      await recordCommerceQuoteAcceptance(tx, {
        clientAcceptanceId: input.clientAcceptanceId,
        orderId: order.id,
        versionId: version.id,
      })
      if (expectedFulfilment === "pickup") {
        await tx.prescriptionPickupFulfillment.create({
          data: {
            orderId: order.id,
            storeId: request.storeId,
            tenantId: request.tenantId,
            events: { create: { type: "CREATED" } },
          },
        })
      } else {
        const address = await tx.prescriptionDeliveryAddress.findUnique({
          where: { quoteVersionId: version.id },
        })
        if (!address || address.eligibilityStatus !== "ELIGIBLE") {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            "A current eligible delivery address is required.",
          )
        }
        await tx.prescriptionDeliveryAddress.update({
          data: { orderId: order.id },
          where: { id: address.id },
        })
      }
      await tx.prescriptionRequest.update({
        data: {
          convertedAt: new Date(),
          status: PrescriptionRequestStatus.CONVERTED,
        },
        where: { id: request.id },
      })
      await tx.prescriptionRequestAuditEvent.create({
        data: {
          actorUserId: "public_prescription_quote_acceptance",
          fromStatus: PrescriptionRequestStatus.QUOTED,
          payload: json({ orderId: order.id }),
          requestId: request.id,
          storeId: request.storeId,
          tenantId: request.tenantId,
          toStatus: PrescriptionRequestStatus.CONVERTED,
          type: PrescriptionRequestAuditEventType.CONVERTED,
        },
      })
      await tx.prescriptionUsageEvent.create({
        data: {
          amounts: json({
            pharmacyRevenueMinor: order.totalMinor,
            taxMinor: order.taxMinor,
          }),
          deduplicationKey: `order-created:${order.id}`,
          eventType: "ORDER_CREATED",
          occurredAt: new Date(),
          sourceId: order.id,
          sourceType: "order",
          storeId: request.storeId,
          tenantId: request.tenantId,
        },
      })
      return {
        notification: request.customerPhone
          ? {
              customerPhone: request.customerPhone,
              storeId: request.storeId,
              tenantId: request.tenantId,
            }
          : null,
        orderId: order.id,
        versionId: version.id,
      }
    })
  } catch (error) {
    if (error instanceof CommerceQuoteError) {
      throw new PrescriptionRequestError(
        error.code === "PUBLIC_TOKEN_INVALID"
          ? "PUBLIC_ACCESS_INVALID"
          : "REQUEST_CONFLICT",
        error.message,
      )
    }
    throw error
  }
}
