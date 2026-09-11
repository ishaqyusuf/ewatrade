import {
  DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
  STORE_CONVERSATION_ATTACHMENT_MIME_TYPES,
  STORE_CONVERSATION_VOICE_NOTE_MAX_BYTES,
  STORE_CONVERSATION_VOICE_NOTE_MAX_DURATION_MS,
  type ServiceCommerceMediaKind,
  type ServiceCommerceMediaMimeType,
  type StoreConversationAttachmentCapabilityProjection,
  type StoreConversationAttachmentCommitInput,
  type StoreConversationAttachmentTarget,
  canTransitionServiceCommerceMediaAsset,
  projectStoreConversationAttachment,
  storeConversationAttachmentCommitInputSchema,
  storeConversationAttachmentTargetSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceMediaAuditEventType,
  ServiceCommerceMediaLifecycle,
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  type StoreConversationGuestCredentialPurpose,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import {
  type PrescriptionMediaManifestInput,
  appendStoreConversationPrescriptionMediaInTransaction,
  recordPrescriptionMediaAccess,
} from "./prescription-requests"
import { getAuthorizedServiceCommerceMediaViewInTransaction } from "./service-commerce-attachments"
import { resolveServiceCommerceCatalogSourceLine } from "./service-commerce-catalog-source"
import {
  auditMedia,
  getScopedAsset,
  validateServiceCommerceMediaIntakeReadiness,
} from "./service-commerce-media-assets"
import { runStoreConversationSensitiveRead } from "./store-conversation-sensitive-reads"
import {
  StoreConversationError,
  assertStoreConversationAvailable,
  assertStoreConversationComposerEnabled,
  loadStoreConversationForGuest,
  loadStoreConversationRequestSummaries,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"
import type { DbClient } from "./types"

type ResolveEntry = typeof resolveStoreConversationEntry

const requestKindToDb = {
  commerce_inquiry: StoreConversationRequestKind.COMMERCE_INQUIRY,
  prescription_request: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
  service_request: StoreConversationRequestKind.SERVICE_REQUEST,
} as const

const requestKindToEntry = {
  commerce_inquiry: "product_inquiry",
  prescription_request: "prescription",
  service_request: "service",
} as const

const dbChannel = {
  mobile: StoreConversationMessageChannel.MOBILE,
  web: StoreConversationMessageChannel.WEB,
} as const

function safeAttachmentProjection(link: {
  id: string
  prescriptionMedia?: { mediaType: string; status: string } | null
  sourceAttachment?: {
    lifecycle: string
    mediaAsset: {
      kind: string
      lifecycle: string
      verifiedDurationMs?: number | null
    }
  } | null
}) {
  const ownerCount =
    Number(Boolean(link.sourceAttachment)) +
    Number(Boolean(link.prescriptionMedia))
  if (ownerCount !== 1) {
    throw new StoreConversationError(
      "CONFLICT",
      "This conversation attachment has an invalid media owner.",
    )
  }
  return link.sourceAttachment
    ? projectStoreConversationAttachment({
        id: link.id,
        kind: link.sourceAttachment.mediaAsset.kind,
        lifecycle:
          link.sourceAttachment.lifecycle === "ACTIVE"
            ? link.sourceAttachment.mediaAsset.lifecycle
            : "DELETED",
        ownerKind: "generic",
        verifiedDurationMs:
          link.sourceAttachment.mediaAsset.verifiedDurationMs ?? null,
      })
    : projectStoreConversationAttachment({
        id: link.id,
        kind: link.prescriptionMedia?.mediaType.startsWith("image/")
          ? "IMAGE"
          : "DOCUMENT",
        lifecycle: link.prescriptionMedia?.status ?? "DELETED",
        ownerKind: "prescription",
      })
}

export function projectStoreConversationMessageAttachments(message: {
  attachments?: Array<{
    id: string
    prescriptionMedia?: { mediaType: string; status: string } | null
    sourceAttachment?: {
      lifecycle: string
      mediaAsset: {
        kind: string
        lifecycle: string
        verifiedDurationMs?: number | null
      }
    } | null
  }>
}) {
  return (message.attachments ?? []).map(safeAttachmentProjection)
}

type AttachmentUploadTarget =
  | {
      kind: "generic"
      source: {
        id: string
        kind: "commerce_inquiry" | "service"
      }
      sourceLineId: string
      sourceVersion: string
    }
  | { kind: "prescription"; requestId: string }
  | { kind: "new_commerce_inquiry" }
  | { kind: "new_prescription_request" }

export type GuestStoreConversationAttachmentUploadProjection = {
  actorUserId: "public_store_conversation"
  capability: StoreConversationAttachmentCapabilityProjection
  channel: "web"
  conversationId: string
  intakeContext: {
    entryPointId: string
    entryPointRevision: number
    kind: "entry_point"
  }
  storeId: string
  target: AttachmentUploadTarget
  tenantId: string
  vertical: "pharmacy" | "service"
}

async function resolveGenericTarget(
  db: DbClient,
  input: {
    actorUserId: string
    requestId: string
    requestKind: "commerce_inquiry" | "service_request"
    storeId: string
    tenantId: string
  },
): Promise<Extract<AttachmentUploadTarget, { kind: "generic" }>> {
  const line =
    input.requestKind === "commerce_inquiry"
      ? await db.commerceInquiryLine.findFirst({
          orderBy: { position: "asc" },
          select: { id: true },
          where: {
            inquiryId: input.requestId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })
      : await db.serviceRequestLine.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
          where: {
            request: {
              id: input.requestId,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          },
        })
  if (!line) {
    throw new StoreConversationError(
      "NOT_READY",
      "This Request has no current attachment target.",
    )
  }
  const source = {
    id: input.requestId,
    kind:
      input.requestKind === "commerce_inquiry"
        ? ("commerce_inquiry" as const)
        : ("service" as const),
  }
  const resolved = await resolveServiceCommerceCatalogSourceLine(db, {
    actorUserId: input.actorUserId,
    operation: "read",
    source,
    sourceLineId: line.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return {
    kind: "generic",
    source,
    sourceLineId: line.id,
    sourceVersion: resolved.ref.sourceVersion,
  }
}

/**
 * Resolve the exact generic media owner for a Commerce Inquiry that was just
 * created by the authenticated Store Conversation attachment flow. The
 * caller supplies only server-derived scope and the authoritative create
 * result; no customer-provided source reference crosses this seam.
 */
export async function resolveCreatedStoreConversationCommerceInquiryAttachmentTarget(
  db: PrismaClient,
  input: {
    actorUserId: "public_store_conversation"
    inquiryId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction((tx) =>
    resolveGenericTarget(tx, {
      actorUserId: input.actorUserId,
      requestId: input.inquiryId,
      requestKind: "commerce_inquiry",
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
  )
}

export async function resolveGuestStoreConversationAttachmentUpload(
  db: PrismaClient,
  input: {
    channel: "mobile" | "web"
    conversationId: string
    credentialToken: string
    file: {
      attachmentCount: number
      byteSize: number
      kind: ServiceCommerceMediaKind
      mimeType: ServiceCommerceMediaMimeType
      signatureMimeType: ServiceCommerceMediaMimeType | null
    }
    installationToken?: string
    privateMediaProviderReady: boolean
    publicToken: string
    purpose?: StoreConversationGuestCredentialPurpose
    target: StoreConversationAttachmentTarget
  },
  dependencies: { resolveEntry?: ResolveEntry } = {},
): Promise<GuestStoreConversationAttachmentUploadProjection> {
  const target = storeConversationAttachmentTargetSchema.parse(input.target)
  const resolveEntry =
    dependencies.resolveEntry ?? resolveStoreConversationEntry
  return db.$transaction(async (tx) => {
    const entry = await resolveEntry(tx, { publicToken: input.publicToken })
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: input.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now: new Date(),
      purpose: input.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    assertStoreConversationAvailable(entry.availability)
    assertStoreConversationComposerEnabled(entry.channelMode)
    if (
      conversation.lifecycle !== StoreConversationLifecycle.ACTIVE ||
      conversation.moderationState !== StoreConversationModerationState.OPEN
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "Attachments are unavailable while this conversation is paused.",
      )
    }

    let vertical: "pharmacy" | "service"
    let resolvedTarget: AttachmentUploadTarget
    if (target.kind === "new_commerce_inquiry") {
      if (!entry.requestKinds.includes("product_inquiry")) {
        throw new StoreConversationError(
          "NOT_READY",
          "Product attachments are unavailable for this Store.",
        )
      }
      vertical = "service"
      resolvedTarget = { kind: "new_commerce_inquiry" }
    } else if (target.kind === "new_prescription_request") {
      if (!entry.requestKinds.includes("prescription")) {
        throw new StoreConversationError(
          "NOT_READY",
          "Prescription attachments are unavailable for this Store.",
        )
      }
      vertical = "pharmacy"
      resolvedTarget = { kind: "new_prescription_request" }
    } else {
      if (
        !entry.requestKinds.includes(requestKindToEntry[target.request.kind])
      ) {
        throw new StoreConversationError(
          "NOT_READY",
          "This Request type is unavailable for attachments.",
        )
      }
      const requests = await loadStoreConversationRequestSummaries(tx, {
        conversationId: conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      const current = requests.find(
        (request) =>
          request.id === target.request.id &&
          request.kind === target.request.kind &&
          request.lifecycle === "active" &&
          request.revision === target.request.revision,
      )
      if (!current) {
        throw new StoreConversationError(
          "CONFLICT",
          "This Request changed. Refresh before adding an attachment.",
        )
      }
      vertical =
        target.request.kind === "prescription_request" ? "pharmacy" : "service"
      resolvedTarget =
        target.request.kind === "prescription_request"
          ? { kind: "prescription", requestId: target.request.id }
          : await resolveGenericTarget(tx, {
              actorUserId: "public_store_conversation",
              requestId: target.request.id,
              requestKind: target.request.kind,
              storeId: entry.storeId,
              tenantId: entry.tenantId,
            })
    }

    await validateServiceCommerceMediaIntakeReadiness(tx, {
      actorUserId: "public_store_conversation",
      attachmentCount: input.file.attachmentCount,
      byteSize: input.file.byteSize,
      channel: "web",
      kind: input.file.kind,
      mimeType: input.file.mimeType,
      privateMediaProviderReady: input.privateMediaProviderReady,
      signatureMimeType: input.file.signatureMimeType,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
      vertical,
    })

    if (vertical === "pharmacy" && input.file.kind === "audio") {
      throw new StoreConversationError(
        "NOT_READY",
        "A voice note cannot replace required Prescription media.",
      )
    }

    const prescriptionTarget =
      resolvedTarget.kind === "prescription" ||
      resolvedTarget.kind === "new_prescription_request"

    return {
      actorUserId: "public_store_conversation",
      capability: {
        acceptedMimeTypes: STORE_CONVERSATION_ATTACHMENT_MIME_TYPES.filter(
          (mimeType) => !prescriptionTarget || !mimeType.startsWith("audio/"),
        ),
        allowedKinds: prescriptionTarget
          ? ["image", "document"]
          : ["image", "document", "audio"],
        available: true,
        blockers: [],
        limits: {
          maxAudioBytes: STORE_CONVERSATION_VOICE_NOTE_MAX_BYTES,
          maxBytes: SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
          maxCount: 1,
          maxDurationMs: STORE_CONVERSATION_VOICE_NOTE_MAX_DURATION_MS,
        },
        uploadAuthorization: null,
      },
      // The media owner retains its established web/staff/WhatsApp origin.
      // Mobile stays explicit on the conversation message itself.
      channel: "web",
      conversationId: conversation.id,
      intakeContext: {
        entryPointId: entry.entryPointId,
        entryPointRevision: entry.entryPointRevision,
        kind: "entry_point",
      },
      storeId: entry.storeId,
      target: resolvedTarget,
      tenantId: entry.tenantId,
      vertical,
    }
  })
}

export async function resolveGuestStoreConversationAttachmentCapability(
  db: PrismaClient,
  input: Omit<
    Parameters<typeof resolveGuestStoreConversationAttachmentUpload>[1],
    "file"
  >,
  dependencies: { resolveEntry?: ResolveEntry } = {},
) {
  const resolved = await resolveGuestStoreConversationAttachmentUpload(
    db,
    {
      ...input,
      // A known-valid byte envelope exercises the same current Store, Request,
      // provider and policy authorization before the picker opens. The upload
      // route repeats authorization with the actual verified bytes.
      file: {
        attachmentCount: 1,
        byteSize: 1,
        kind: "image",
        mimeType: "image/jpeg",
        signatureMimeType: "image/jpeg",
      },
    },
    dependencies,
  )
  return resolved.capability
}

type StoreConversationMediaSafetyCursor = {
  createdAt: string
  id: string
  kind: "generic" | "prescription"
}

function encodeStoreConversationMediaSafetyCursor(
  cursor: StoreConversationMediaSafetyCursor,
) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function decodeStoreConversationMediaSafetyCursor(value?: string) {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<StoreConversationMediaSafetyCursor>
    if (
      (parsed.kind !== "generic" && parsed.kind !== "prescription") ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.createdAt !== "string" ||
      Number.isNaN(new Date(parsed.createdAt).getTime())
    ) {
      throw new Error("invalid")
    }
    return parsed as StoreConversationMediaSafetyCursor
  } catch {
    throw new StoreConversationError(
      "CONFLICT",
      "The media safety recovery cursor is invalid.",
    )
  }
}

export async function listPendingStoreConversationMediaSafetyWork(
  db: PrismaClient,
  input: { cursor?: string; limit?: number; now?: Date },
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const now = input.now ?? new Date()
  const cursor = decodeStoreConversationMediaSafetyCursor(input.cursor)
  const cursorDate = cursor ? new Date(cursor.createdAt) : null
  const after = (kind: "generic" | "prescription") =>
    cursorDate
      ? {
          OR: [
            { createdAt: { gt: cursorDate } },
            {
              createdAt: cursorDate,
              id: {
                gt:
                  cursor?.kind === kind
                    ? cursor.id
                    : kind === "generic"
                      ? "\uffff"
                      : "",
              },
            },
          ],
        }
      : {}
  const [generic, clinical] = await Promise.all([
    db.serviceCommerceMediaAsset.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true, id: true, storeId: true, tenantId: true },
      take: limit + 1,
      where: {
        ...after("generic"),
        OR: [
          { lifecycle: { in: ["STORED", "SAFETY_PENDING"] } },
          {
            lifecycle: "RETRYABLE",
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
        ],
        attachments: {
          some: { conversationAttachments: { some: {} } },
        },
      },
    }),
    db.prescriptionMedia.findMany({
      distinct: ["requestId"],
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        id: true,
        requestId: true,
        storeId: true,
        tenantId: true,
      },
      take: limit + 1,
      where: {
        ...after("prescription"),
        conversationAttachments: { some: {} },
        status: "PENDING",
      },
    }),
  ])
  const merged = [
    ...generic.map((row) => ({ ...row, kind: "generic" as const })),
    ...clinical.map((row) => ({ ...row, kind: "prescription" as const })),
  ].sort(
    (left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  )
  const selected = merged.slice(0, limit)
  const last = selected.at(-1)
  return {
    items: selected.map((row) =>
      row.kind === "generic"
        ? {
            kind: "generic" as const,
            mediaAssetId: row.id,
            storeId: row.storeId,
            tenantId: row.tenantId,
          }
        : {
            kind: "prescription" as const,
            requestId: row.requestId,
            storeId: row.storeId,
            tenantId: row.tenantId,
          },
    ),
    nextCursor:
      merged.length > limit && last
        ? encodeStoreConversationMediaSafetyCursor({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
            kind: last.kind,
          })
        : null,
  }
}

export async function preparePendingStoreConversationMediaSafetyWork(
  db: PrismaClient,
  input: {
    mediaAssetId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const linked = await tx.storeConversationMessageAttachment.findFirst({
      select: { id: true },
      where: {
        sourceAttachment: {
          mediaAssetId: input.mediaAssetId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!linked) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "Conversation-linked media safety work was not found.",
      )
    }
    const asset = await getScopedAsset(tx, input)
    if (asset.lifecycle === ServiceCommerceMediaLifecycle.SAFETY_PENDING) {
      return {
        kind: "generic" as const,
        mediaAssetId: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      }
    }
    if (
      asset.lifecycle !== ServiceCommerceMediaLifecycle.STORED &&
      asset.lifecycle !== ServiceCommerceMediaLifecycle.RETRYABLE
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This media is not eligible for safety recovery.",
      )
    }
    if (
      asset.lifecycle === ServiceCommerceMediaLifecycle.RETRYABLE &&
      asset.nextRetryAt &&
      asset.nextRetryAt > (input.now ?? new Date())
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This media safety retry is not due yet.",
      )
    }
    if (
      !canTransitionServiceCommerceMediaAsset(
        asset.lifecycle.toLowerCase() as "retryable" | "stored",
        "safety_pending",
      )
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This media lifecycle does not permit safety recovery.",
      )
    }
    if (
      !asset.objectKey?.trim() ||
      !asset.contentDigest?.trim() ||
      !asset.verifiedMediaType?.trim() ||
      !asset.verifiedSizeBytes ||
      asset.verifiedSizeBytes < 1
    ) {
      throw new StoreConversationError(
        "NOT_READY",
        "This media does not have complete verified storage facts for safety recovery.",
      )
    }
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        lastFailureCode: null,
        lifecycle: ServiceCommerceMediaLifecycle.SAFETY_PENDING,
        nextRetryAt: null,
      },
      where: {
        id: asset.id,
        lifecycle: asset.lifecycle,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "Media safety recovery changed concurrently.",
      )
    }
    await auditMedia(tx, {
      lifecycle: ServiceCommerceMediaLifecycle.SAFETY_PENDING,
      mediaAssetId: asset.id,
      reason:
        asset.lifecycle === ServiceCommerceMediaLifecycle.RETRYABLE
          ? "conversation_safety_retry_requested"
          : "conversation_safety_recovery_requested",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type:
        asset.lifecycle === ServiceCommerceMediaLifecycle.RETRYABLE
          ? ServiceCommerceMediaAuditEventType.RETRY_SCHEDULED
          : ServiceCommerceMediaAuditEventType.SAFETY_REQUESTED,
    })
    return {
      kind: "generic" as const,
      mediaAssetId: asset.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }
  })
}

type MessageAttachmentOwner =
  | {
      attachment: {
        id: string
        prescriptionMedia: null
        sourceAttachment: {
          lifecycle: "ACTIVE"
          mediaAsset: {
            kind: string
            lifecycle: string
            verifiedDurationMs: number | null
          }
        }
      }
      body: "Document attachment" | "Image attachment" | "Voice note"
    }
  | {
      attachment: {
        id: string
        prescriptionMedia: { mediaType: string; status: string }
        sourceAttachment: null
      }
      body: "Document attachment" | "Image attachment"
    }

async function resolveMessageAttachmentOwner(
  tx: DbClient,
  input: {
    owner: StoreConversationAttachmentCommitInput["owner"]
    request: StoreConversationAttachmentCommitInput["request"]
    storeId: string
    tenantId: string
  },
): Promise<MessageAttachmentOwner> {
  if (input.owner.kind === "generic") {
    if (input.request.kind === "prescription_request") {
      throw new StoreConversationError(
        "CONFLICT",
        "Prescription attachments must retain clinical media authority.",
      )
    }
    const attachment = await tx.serviceCommerceSourceAttachment.findFirst({
      include: { mediaAsset: true },
      where: {
        id: input.owner.sourceAttachmentId,
        lifecycle: "ACTIVE",
        sourceId: input.request.id,
        sourceKind:
          input.request.kind === "commerce_inquiry"
            ? "COMMERCE_INQUIRY"
            : "SERVICE_REQUEST",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!attachment) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Request attachment is unavailable.",
      )
    }
    const kind =
      attachment.mediaAsset.kind === "IMAGE"
        ? "IMAGE"
        : attachment.mediaAsset.kind === "AUDIO"
          ? "AUDIO"
          : "DOCUMENT"
    return {
      attachment: {
        id: "pending",
        prescriptionMedia: null,
        sourceAttachment: {
          lifecycle: "ACTIVE",
          mediaAsset: {
            kind,
            lifecycle: attachment.mediaAsset.lifecycle,
            verifiedDurationMs: attachment.mediaAsset.verifiedDurationMs,
          },
        },
      },
      body:
        kind === "IMAGE"
          ? "Image attachment"
          : kind === "AUDIO"
            ? "Voice note"
            : "Document attachment",
    }
  }
  if (input.request.kind !== "prescription_request") {
    throw new StoreConversationError(
      "CONFLICT",
      "Clinical media can be linked only to its Prescription Request.",
    )
  }
  const media = await tx.prescriptionMedia.findFirst({
    select: { id: true, mediaType: true, status: true },
    where: {
      id: input.owner.prescriptionMediaId,
      requestId: input.request.id,
      revision: input.request.revision,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!media) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Prescription attachment is unavailable.",
    )
  }
  const image = media.mediaType.startsWith("image/")
  return {
    attachment: {
      id: "pending",
      prescriptionMedia: { mediaType: media.mediaType, status: media.status },
      sourceAttachment: null,
    },
    body: image ? "Image attachment" : "Document attachment",
  }
}

function projectAttachmentMessage(message: {
  attachments?: Array<{
    id: string
    prescriptionMedia?: { mediaType: string; status: string } | null
    sourceAttachment?: {
      lifecycle: string
      mediaAsset: {
        kind: string
        lifecycle: string
        verifiedDurationMs?: number | null
      }
    } | null
  }>
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
}) {
  return projectStoreConversationMessage({
    ...message,
    attachments: projectStoreConversationMessageAttachments(message),
  })
}

export async function appendGuestStoreConversationAttachment(
  db: PrismaClient,
  input: StoreConversationAttachmentCommitInput & {
    credentialToken: string
    installationToken?: string
    purpose?: StoreConversationGuestCredentialPurpose
  },
  dependencies: { resolveEntry?: ResolveEntry } = {},
) {
  const parsed = storeConversationAttachmentCommitInputSchema.parse({
    channel: input.channel,
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    owner: input.owner,
    publicToken: input.publicToken,
    request: input.request,
  })
  const resolveEntry =
    dependencies.resolveEntry ?? resolveStoreConversationEntry
  const now = new Date()
  const payloadHash = storeConversationPayloadHash({
    channel: parsed.channel,
    conversationId: parsed.conversationId,
    owner: parsed.owner,
    request: parsed.request,
  })
  return db.$transaction(async (tx) => {
    const entry = await resolveEntry(tx, { publicToken: parsed.publicToken })
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose: input.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    assertStoreConversationAvailable(entry.availability)
    assertStoreConversationComposerEnabled(entry.channelMode)
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const current = await tx.storeConversation.findFirst({
      where: {
        id: conversation.id,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!current) {
      throw new StoreConversationError(
        "NOT_READY",
        "Attachments are unavailable while this conversation is paused.",
      )
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      include: {
        message: {
          include: {
            attachments: {
              include: {
                prescriptionMedia: {
                  select: { mediaType: true, status: true },
                },
                sourceAttachment: {
                  include: {
                    mediaAsset: {
                      select: {
                        kind: true,
                        lifecycle: true,
                        verifiedDurationMs: true,
                      },
                    },
                  },
                },
              },
            },
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
      },
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: current.id,
      },
    })
    if (receipt) {
      if (
        receipt.kind !== StoreConversationCommandKind.CUSTOMER_ATTACHMENT ||
        receipt.payloadHash !== payloadHash ||
        !receipt.message
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This attachment command was already used with different input.",
        )
      }
      return {
        message: projectAttachmentMessage(receipt.message),
        replayed: true,
      }
    }
    if (!entry.requestKinds.includes(requestKindToEntry[parsed.request.kind])) {
      throw new StoreConversationError(
        "NOT_READY",
        "This Request type is unavailable for attachments.",
      )
    }
    const revision = await resolveCurrentStoreConversationRequestRevision(tx, {
      kind: requestKindToDb[parsed.request.kind],
      sourceId: parsed.request.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    if (revision !== parsed.request.revision) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Request changed. Refresh before adding an attachment.",
      )
    }
    const owner = await resolveMessageAttachmentOwner(tx, {
      owner: parsed.owner,
      request: parsed.request,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const sequence = current.lastMessageSequence + 1
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        body: owner.body,
        channel: dbChannel[parsed.channel],
        conversationId: current.id,
        kind: StoreConversationMessageKind.CUSTOMER_ATTACHMENT,
        occurredAt: now,
        sequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const link = await tx.storeConversationMessageAttachment.create({
      data: {
        conversationId: current.id,
        messageId: message.id,
        position: 1,
        prescriptionMediaId:
          parsed.owner.kind === "prescription"
            ? parsed.owner.prescriptionMediaId
            : null,
        sourceAttachmentId:
          parsed.owner.kind === "generic"
            ? parsed.owner.sourceAttachmentId
            : null,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await tx.storeConversationRequestLink.create({
      data: {
        conversationId: current.id,
        kind: requestKindToDb[parsed.request.kind],
        messageId: message.id,
        sourceId: parsed.request.id,
        sourceRevision: revision,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const updated = await tx.storeConversation.updateMany({
      data: {
        lastActivityAt: now,
        lastCustomerMessageAt: now,
        lastCustomerMessageSequence: sequence,
        lastMessageSequence: sequence,
        responseDueAt: new Date(
          now.getTime() +
            DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES * 60_000,
        ),
      },
      where: {
        id: current.id,
        lastMessageSequence: current.lastMessageSequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation changed. Refresh and try again.",
      )
    }
    await Promise.all([
      tx.storeConversationCommandReceipt.create({
        data: {
          clientOperationId: parsed.clientOperationId,
          conversationId: current.id,
          kind: StoreConversationCommandKind.CUSTOMER_ATTACHMENT,
          messageId: message.id,
          payloadHash,
          sourceId: parsed.request.id,
          sourceKind: requestKindToDb[parsed.request.kind],
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
          conversationId: current.id,
          conversationSequence: sequence,
          reasonCode: "customer_attachment_accepted",
          storeId: entry.storeId,
          tenantId: entry.tenantId,
          type: StoreConversationAuditEventType.CUSTOMER_ATTACHMENT_APPENDED,
        },
      }),
    ])
    const projectedAttachment = {
      ...owner.attachment,
      id: link.id,
    }
    return {
      message: projectAttachmentMessage({
        ...message,
        attachments: [projectedAttachment],
        requestLinks: [
          {
            kind: requestKindToDb[parsed.request.kind],
            sourceId: parsed.request.id,
          },
        ],
      }),
      replayed: false,
    }
  })
}

/**
 * Atomically advances authoritative clinical media and appends its exact
 * conversation message. The private object is stored before this command; a
 * caller deletes that object if this transaction fails or returns a replay.
 */
export async function commitGuestStoreConversationPrescriptionAttachment(
  db: PrismaClient,
  input: {
    channel: "mobile" | "web"
    clientOperationId: string
    conversationId: string
    credentialToken: string
    expectedMediaRevision: number
    installationToken?: string
    media: PrescriptionMediaManifestInput
    publicToken: string
    purpose?: StoreConversationGuestCredentialPurpose
    requestId: string
  },
  dependencies: { resolveEntry?: ResolveEntry } = {},
) {
  if (input.clientOperationId.trim().length < 8) {
    throw new StoreConversationError(
      "CONFLICT",
      "A stable attachment command identity is required.",
    )
  }
  const resolveEntry =
    dependencies.resolveEntry ?? resolveStoreConversationEntry
  const now = new Date()
  const payloadHash = storeConversationPayloadHash({
    channel: input.channel,
    conversationId: input.conversationId,
    expectedMediaRevision: input.expectedMediaRevision,
    media: {
      clientMediaId: input.media.clientMediaId,
      mediaType: input.media.mediaType,
      originalFileName: input.media.originalFileName,
      sha256: input.media.sha256,
      sizeBytes: input.media.sizeBytes,
    },
    requestId: input.requestId,
  })
  return db.$transaction(async (tx) => {
    const entry = await resolveEntry(tx, { publicToken: input.publicToken })
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: input.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose: input.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    assertStoreConversationAvailable(entry.availability)
    assertStoreConversationComposerEnabled(entry.channelMode)
    if (!entry.requestKinds.includes("prescription")) {
      throw new StoreConversationError(
        "NOT_READY",
        "Prescription attachments are unavailable for this Store.",
      )
    }
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const current = await tx.storeConversation.findFirst({
      where: {
        id: conversation.id,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!current) {
      throw new StoreConversationError(
        "NOT_READY",
        "Attachments are unavailable while this conversation is paused.",
      )
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      include: {
        message: {
          include: {
            attachments: {
              include: {
                prescriptionMedia: {
                  select: { mediaType: true, status: true },
                },
                sourceAttachment: {
                  include: {
                    mediaAsset: {
                      select: {
                        kind: true,
                        lifecycle: true,
                        verifiedDurationMs: true,
                      },
                    },
                  },
                },
              },
            },
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
      },
      where: {
        clientOperationId: input.clientOperationId.trim(),
        conversationId: current.id,
      },
    })
    if (receipt) {
      if (
        receipt.kind !== StoreConversationCommandKind.CUSTOMER_ATTACHMENT ||
        receipt.payloadHash !== payloadHash ||
        !receipt.message
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This attachment command was already used with different input.",
        )
      }
      return {
        message: projectAttachmentMessage(receipt.message),
        replayed: true as const,
      }
    }
    const clinical =
      await appendStoreConversationPrescriptionMediaInTransaction(tx, {
        actorUserId: "public_store_conversation",
        expectedMediaRevision: input.expectedMediaRevision,
        intakeContext: {
          entryPointId: entry.entryPointId,
          entryPointRevision: entry.entryPointRevision,
          kind: "entry_point",
        },
        media: input.media,
        requestId: input.requestId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
    const media = await tx.prescriptionMedia.findFirst({
      select: { id: true, mediaType: true, status: true },
      where: {
        id: clinical.mediaId,
        requestId: clinical.requestId,
        revision: clinical.revision,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!media) {
      throw new StoreConversationError(
        "CONFLICT",
        "The clinical media owner could not be verified.",
      )
    }
    const body = media.mediaType.startsWith("image/")
      ? ("Image attachment" as const)
      : ("Document attachment" as const)
    const sequence = current.lastMessageSequence + 1
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        body,
        channel: dbChannel[input.channel],
        conversationId: current.id,
        kind: StoreConversationMessageKind.CUSTOMER_ATTACHMENT,
        occurredAt: now,
        sequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const attachment = await tx.storeConversationMessageAttachment.create({
      data: {
        conversationId: current.id,
        messageId: message.id,
        position: 1,
        prescriptionMediaId: media.id,
        sourceAttachmentId: null,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await tx.storeConversationRequestLink.create({
      data: {
        conversationId: current.id,
        kind: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
        messageId: message.id,
        sourceId: clinical.requestId,
        sourceRevision: clinical.revision,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const updated = await tx.storeConversation.updateMany({
      data: {
        lastActivityAt: now,
        lastCustomerMessageAt: now,
        lastCustomerMessageSequence: sequence,
        lastMessageSequence: sequence,
        responseDueAt: new Date(
          now.getTime() +
            DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES * 60_000,
        ),
      },
      where: {
        id: current.id,
        lastMessageSequence: current.lastMessageSequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation changed. Refresh and try again.",
      )
    }
    await Promise.all([
      tx.storeConversationCommandReceipt.create({
        data: {
          clientOperationId: input.clientOperationId.trim(),
          conversationId: current.id,
          kind: StoreConversationCommandKind.CUSTOMER_ATTACHMENT,
          messageId: message.id,
          payloadHash,
          sourceId: clinical.requestId,
          sourceKind: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
          conversationId: current.id,
          conversationSequence: sequence,
          reasonCode: "customer_attachment_accepted",
          storeId: entry.storeId,
          tenantId: entry.tenantId,
          type: StoreConversationAuditEventType.CUSTOMER_ATTACHMENT_APPENDED,
        },
      }),
    ])
    return {
      message: projectAttachmentMessage({
        ...message,
        attachments: [
          {
            id: attachment.id,
            prescriptionMedia: {
              mediaType: media.mediaType,
              status: media.status,
            },
            sourceAttachment: null,
          },
        ],
        requestLinks: [
          {
            kind: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
            sourceId: clinical.requestId,
          },
        ],
      }),
      replayed: false as const,
    }
  })
}

export async function authorizeStoreConversationAttachmentView(
  db: PrismaClient,
  input: {
    actorUserId: string
    conversationId: string
    expiresAt: Date
    messageAttachmentId: string
    reason: string
    storeId: string
    tenantId: string
  },
  dependencies: {
    getGenericView?: typeof getAuthorizedServiceCommerceMediaViewInTransaction
    recordPrescriptionAccess?: typeof recordPrescriptionMediaAccess
  } = {},
) {
  const now = new Date()
  if (
    input.expiresAt <= now ||
    input.expiresAt.getTime() > now.getTime() + 60_000
  ) {
    throw new StoreConversationError(
      "NOT_READY",
      "Attachment view authorization must expire within 60 seconds.",
    )
  }
  const getGenericView =
    dependencies.getGenericView ??
    getAuthorizedServiceCommerceMediaViewInTransaction
  const recordPrescriptionAccess =
    dependencies.recordPrescriptionAccess ?? recordPrescriptionMediaAccess
  return runStoreConversationSensitiveRead(
    db,
    {
      actorUserId: input.actorUserId,
      conversationId: input.conversationId,
      kind: "attachment",
      purpose: "customer_request_attachment_review",
      storeId: input.storeId,
      subjectReference: input.messageAttachmentId,
      tenantId: input.tenantId,
    },
    async (_context, tx) => {
      const link = await tx.storeConversationMessageAttachment.findFirst({
        include: {
          message: {
            select: {
              requestLinks: { select: { kind: true, sourceId: true } },
            },
          },
          prescriptionMedia: {
            select: {
              id: true,
              mediaType: true,
              requestId: true,
              status: true,
            },
          },
          sourceAttachment: {
            select: {
              id: true,
              lifecycle: true,
              mediaAsset: { select: { lifecycle: true } },
              sourceId: true,
              sourceKind: true,
            },
          },
        },
        where: {
          conversationId: input.conversationId,
          id: input.messageAttachmentId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (
        !link ||
        Boolean(link.sourceAttachment) === Boolean(link.prescriptionMedia)
      ) {
        throw new StoreConversationError(
          "NOT_FOUND",
          "This conversation attachment is unavailable.",
        )
      }
      if (link.sourceAttachment) {
        const sourceLink = link.message.requestLinks.find(
          (request) =>
            request.sourceId === link.sourceAttachment?.sourceId &&
            request.kind === link.sourceAttachment.sourceKind,
        )
        if (!sourceLink) {
          throw new StoreConversationError(
            "CONFLICT",
            "This attachment is not linked to the current conversation Request.",
          )
        }
        const authorized = await getGenericView(tx, {
          actorUserId: input.actorUserId,
          attachmentId: link.sourceAttachment.id,
          expiresAt: input.expiresAt,
          reason: input.reason,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        return { ...authorized, kind: "generic" as const }
      }
      const prescription = link.prescriptionMedia
      const sourceLink = link.message.requestLinks.find(
        (request) =>
          request.kind === StoreConversationRequestKind.PRESCRIPTION_REQUEST &&
          request.sourceId === prescription?.requestId,
      )
      if (!prescription || !sourceLink) {
        throw new StoreConversationError(
          "CONFLICT",
          "This clinical attachment is not linked to its Prescription Request.",
        )
      }
      const authorized = await recordPrescriptionAccess(tx, {
        actorUserId: input.actorUserId,
        mediaId: prescription.id,
        reason: input.reason,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      return {
        expiresAt: input.expiresAt,
        kind: "prescription" as const,
        mediaId: authorized.mediaId,
        storageReference: authorized.objectKey,
      }
    },
  )
}

/**
 * Authorizes only a safe generic voice note for the guest participant that
 * owns this exact conversation. Clinical media and non-audio attachments stay
 * behind their existing purpose-specific delivery paths.
 */
export async function authorizeGuestStoreConversationVoiceNoteView(
  db: PrismaClient,
  input: {
    conversationId: string
    credentialToken: string
    expiresAt: Date
    installationToken?: string
    messageAttachmentId: string
    publicToken: string
    purpose?: StoreConversationGuestCredentialPurpose
  },
  dependencies: { resolveEntry?: ResolveEntry } = {},
) {
  const now = new Date()
  if (
    input.expiresAt <= now ||
    input.expiresAt.getTime() > now.getTime() + 60_000
  ) {
    throw new StoreConversationError(
      "NOT_READY",
      "Voice note authorization must expire within 60 seconds.",
    )
  }
  const resolveEntry =
    dependencies.resolveEntry ?? resolveStoreConversationEntry
  return db.$transaction(async (tx) => {
    const entry = await resolveEntry(tx, { publicToken: input.publicToken })
    await loadStoreConversationForGuest(tx, {
      conversationId: input.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now,
      purpose: input.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const link = await tx.storeConversationMessageAttachment.findFirst({
      include: {
        message: {
          select: {
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
        sourceAttachment: { include: { mediaAsset: true } },
      },
      where: {
        conversationId: input.conversationId,
        id: input.messageAttachmentId,
        prescriptionMediaId: null,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    const sourceAttachment = link?.sourceAttachment
    if (
      !link ||
      !sourceAttachment ||
      sourceAttachment.lifecycle !== "ACTIVE" ||
      sourceAttachment.mediaAsset.kind !== "AUDIO" ||
      sourceAttachment.mediaAsset.lifecycle !== "SAFE" ||
      !sourceAttachment.mediaAsset.objectKey ||
      !link.message.requestLinks.some(
        (request) =>
          request.kind === sourceAttachment.sourceKind &&
          request.sourceId === sourceAttachment.sourceId,
      )
    ) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This voice note is unavailable.",
      )
    }
    await auditMedia(tx, {
      actorUserId: "public_store_conversation",
      attachmentId: sourceAttachment.id,
      lifecycle: ServiceCommerceMediaLifecycle.SAFE,
      mediaAssetId: sourceAttachment.mediaAssetId,
      reason: "customer_voice_note_playback",
      storeId: entry.storeId,
      tenantId: entry.tenantId,
      type: ServiceCommerceMediaAuditEventType.VIEW_AUTHORIZED,
    })
    return {
      expiresAt: input.expiresAt,
      mediaAssetId: sourceAttachment.mediaAssetId,
      storageReference: sourceAttachment.mediaAsset.objectKey,
    }
  })
}
