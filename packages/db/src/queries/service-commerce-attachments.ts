import {
  type ServiceCommerceChannelOrigin,
  type ServiceCommerceMediaKind,
  type ServiceCommerceMediaMimeType,
  type ServiceCommerceSourceRef,
  getServiceCommerceMediaViewerGrantState,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  CommerceQuoteSourceType,
  ServiceCommerceMediaAuditEventType,
  ServiceCommerceMediaLifecycle,
  ServiceCommerceMediaRetentionClass,
  ServiceCommerceSourceAttachmentLifecycle,
} from "../../generated/prisma/enums"
import { resolveServiceCommerceCatalogSourceLine } from "./service-commerce-catalog-source"
import {
  ServiceCommerceMediaError,
  assertActiveServiceCommerceAttendant,
  auditMedia,
  kindToDb,
  originToDb,
  projectSafeServiceCommerceMediaAsset,
  validateServiceCommerceMediaIntakeReadiness,
} from "./service-commerce-media-assets"
import type { DbClient } from "./types"

const sourceKindToDb = {
  commerce_inquiry: CommerceQuoteSourceType.COMMERCE_INQUIRY,
  prescription: CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
  service: CommerceQuoteSourceType.SERVICE_REQUEST,
} as const

function toSourceKind(value: CommerceQuoteSourceType) {
  if (value === CommerceQuoteSourceType.COMMERCE_INQUIRY) {
    return "commerce_inquiry" as const
  }
  if (value === CommerceQuoteSourceType.PRESCRIPTION_REQUEST) {
    return "prescription" as const
  }
  return "service" as const
}

export async function resolveCurrentServiceCommerceMediaSource(
  db: DbClient,
  input: {
    actorUserId: string
    source: ServiceCommerceSourceRef
    sourceLineId: string
    sourceVersion: string
    storeId: string
    tenantId: string
  },
) {
  const source = serviceCommerceSourceRefSchema.parse(input.source)
  const resolved = await resolveServiceCommerceCatalogSourceLine(db, {
    actorUserId: input.actorUserId,
    operation: "read",
    source,
    sourceLineId: input.sourceLineId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  if (resolved.ref.sourceVersion !== input.sourceVersion) {
    throw new ServiceCommerceMediaError(
      "CONFLICT",
      "The source changed before this media operation completed.",
    )
  }
  return resolved
}

function matchingAsset(
  asset: {
    channelOrigin: string
    clientMediaId: string
    contentDigest: string | null
    declaredMediaType: string
    declaredSizeBytes: number | null
    verifiedDurationMs: number | null
    kind: string
    originalFileName: string
    provider: string | null
    providerConnectionId: string | null
    providerMediaId: string | null
  },
  input: {
    channel: ServiceCommerceChannelOrigin
    clientMediaId: string
    contentDigest?: string
    fileName: string
    kind: ServiceCommerceMediaKind
    mimeType: ServiceCommerceMediaMimeType
    provider?: string
    providerConnectionId?: string
    providerMediaId?: string
    sizeBytes: number
    verifiedDurationMs?: number
  },
) {
  return (
    asset.channelOrigin === originToDb[input.channel] &&
    asset.clientMediaId === input.clientMediaId &&
    (input.channel === "whatsapp" ||
      asset.contentDigest === input.contentDigest) &&
    asset.declaredMediaType === input.mimeType &&
    asset.declaredSizeBytes === input.sizeBytes &&
    asset.verifiedDurationMs === (input.verifiedDurationMs ?? null) &&
    asset.kind === kindToDb[input.kind] &&
    asset.originalFileName === input.fileName &&
    asset.provider === (input.provider?.trim() || null) &&
    asset.providerConnectionId ===
      (input.providerConnectionId?.trim() || null) &&
    asset.providerMediaId === (input.providerMediaId?.trim() || null)
  )
}

export async function recordServiceCommerceMediaIntake(
  db: PrismaClient,
  input: {
    actorUserId: string
    channel: ServiceCommerceChannelOrigin
    clientMediaId: string
    contentDigest?: string
    fileName: string
    kind: ServiceCommerceMediaKind
    mimeType: ServiceCommerceMediaMimeType
    privateMediaProviderReady: boolean
    provider?: string
    providerConnectionId?: string
    providerMediaId?: string
    retentionUntil: Date
    signatureMimeType: ServiceCommerceMediaMimeType | null
    sizeBytes: number
    verifiedDurationMs?: number
    source: ServiceCommerceSourceRef
    sourceLineId: string
    sourceVersion: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    if (
      input.channel !== "whatsapp" &&
      !/^[a-f0-9]{64}$/.test(input.contentDigest ?? "")
    ) {
      throw new ServiceCommerceMediaError(
        "INTAKE_BLOCKED",
        "A server-verified content digest is required for uploaded media.",
      )
    }
    if (input.channel === "staff") {
      await assertActiveServiceCommerceAttendant(tx, input)
    }
    const source = await resolveCurrentServiceCommerceMediaSource(tx, input)
    const existing = await tx.serviceCommerceMediaAsset.findFirst({
      include: {
        attachments: {
          where: {
            sourceId: input.source.id,
            sourceKind: sourceKindToDb[input.source.kind],
            sourceLineId: input.sourceLineId,
            sourceVersion: input.sourceVersion,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        },
      },
      where: {
        channelOrigin: originToDb[input.channel],
        clientMediaId: input.clientMediaId.trim(),
        tenantId: input.tenantId,
      },
    })
    if (existing) {
      if (
        !matchingAsset(existing, input) ||
        existing.storeId !== input.storeId
      ) {
        throw new ServiceCommerceMediaError(
          "IDEMPOTENCY_MISMATCH",
          "The media client identity was already used with different content.",
        )
      }
      const attachment = existing.attachments[0]
      if (!attachment) {
        throw new ServiceCommerceMediaError(
          "IDEMPOTENCY_MISMATCH",
          "The media client identity was already attached to another source.",
        )
      }
      return {
        attachment: projectSafeServiceCommerceSourceAttachment(attachment),
        media: projectSafeServiceCommerceMediaAsset(existing),
        replayed: true as const,
      }
    }

    const activeAttachments = await tx.serviceCommerceSourceAttachment.count({
      where: {
        lifecycle: ServiceCommerceSourceAttachmentLifecycle.ACTIVE,
        sourceId: input.source.id,
        sourceKind: sourceKindToDb[input.source.kind],
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (input.channel === "whatsapp") {
      if (!input.providerConnectionId?.trim()) {
        throw new ServiceCommerceMediaError(
          "NOT_READY",
          "A scoped WhatsApp connection is required for provider retrieval.",
        )
      }
      const binding = await tx.whatsAppStoreBinding.findFirst({
        select: { id: true },
        where: {
          connection: {
            id: input.providerConnectionId.trim(),
            status: "ACTIVE",
            tenantId: input.tenantId,
          },
          status: "ACTIVE",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!binding) {
        throw new ServiceCommerceMediaError(
          "NOT_READY",
          "The WhatsApp provider connection is not active for this Store.",
        )
      }
    }
    await validateServiceCommerceMediaIntakeReadiness(tx, {
      actorUserId: input.actorUserId,
      attachmentCount: activeAttachments + 1,
      byteSize: input.sizeBytes,
      channel: input.channel,
      kind: input.kind,
      mimeType: input.mimeType,
      privateMediaProviderReady: input.privateMediaProviderReady,
      signatureMimeType: input.signatureMimeType,
      storeId: input.storeId,
      tenantId: input.tenantId,
      vertical: source.vertical,
      deferSignatureValidation:
        input.channel === "whatsapp" && input.signatureMimeType === null,
    })
    const lifecycle =
      input.channel === "whatsapp"
        ? ServiceCommerceMediaLifecycle.PENDING_RETRIEVAL
        : ServiceCommerceMediaLifecycle.PENDING_UPLOAD
    const asset = await tx.serviceCommerceMediaAsset.create({
      data: {
        channelOrigin: originToDb[input.channel],
        clientMediaId: input.clientMediaId.trim(),
        contentDigest: input.contentDigest ?? null,
        createdByUserId: input.channel === "staff" ? input.actorUserId : null,
        declaredMediaType: input.mimeType,
        declaredSizeBytes: input.sizeBytes,
        verifiedDurationMs: input.verifiedDurationMs ?? null,
        kind: kindToDb[input.kind],
        lifecycle,
        originalFileName: input.fileName.trim(),
        provider: input.provider?.trim() || null,
        providerConnectionId: input.providerConnectionId?.trim() || null,
        providerMediaId: input.providerMediaId?.trim() || null,
        retentionClass:
          source.vertical === "pharmacy"
            ? ServiceCommerceMediaRetentionClass.CLINICAL_EXTENSION
            : ServiceCommerceMediaRetentionClass.ORDINARY_COMMERCE,
        retentionUntil: input.retentionUntil,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const attachment = await tx.serviceCommerceSourceAttachment.create({
      data: {
        attachedByUserId: input.channel === "staff" ? input.actorUserId : null,
        mediaAssetId: asset.id,
        sourceId: input.source.id,
        sourceKind: sourceKindToDb[input.source.kind],
        sourceLineId: input.sourceLineId,
        sourceVersion: input.sourceVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await auditMedia(tx, {
      actorUserId: input.channel === "staff" ? input.actorUserId : null,
      attachmentId: attachment.id,
      lifecycle,
      mediaAssetId: asset.id,
      reason: "media_reference_recorded",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.REFERENCE_RECORDED,
    })
    return {
      attachment: projectSafeServiceCommerceSourceAttachment(attachment),
      media: projectSafeServiceCommerceMediaAsset(asset),
      replayed: false as const,
    }
  })
}

export function projectSafeServiceCommerceSourceAttachment(attachment: {
  createdAt: Date
  id: string
  lifecycle: string
  mediaAssetId: string
  sourceId: string
  sourceKind: CommerceQuoteSourceType
  sourceLineId: string | null
  sourceVersion: string
}) {
  return {
    attachedAt: attachment.createdAt,
    id: attachment.id,
    lifecycle: attachment.lifecycle.toLowerCase(),
    mediaAssetId: attachment.mediaAssetId,
    source: {
      id: attachment.sourceId,
      kind: toSourceKind(attachment.sourceKind),
    },
    sourceLineId: attachment.sourceLineId,
    sourceVersion: attachment.sourceVersion,
  }
}

export async function getAuthorizedServiceCommerceMediaView(
  db: PrismaClient,
  input: {
    actorUserId: string
    attachmentId: string
    expiresAt: Date
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction((tx) =>
    getAuthorizedServiceCommerceMediaViewInTransaction(tx, input),
  )
}

export async function getAuthorizedServiceCommerceMediaViewInTransaction(
  tx: DbClient,
  input: {
    actorUserId: string
    attachmentId: string
    expiresAt: Date
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const now = new Date()
  if (
    input.expiresAt <= now ||
    input.expiresAt.getTime() > now.getTime() + 5 * 60_000
  ) {
    throw new ServiceCommerceMediaError(
      "NOT_READY",
      "Media view authorization must expire within five minutes.",
    )
  }
  await assertActiveServiceCommerceAttendant(tx, input)
  const attachment = await tx.serviceCommerceSourceAttachment.findFirst({
    include: { mediaAsset: true },
    where: {
      id: input.attachmentId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!attachment) {
    throw new ServiceCommerceMediaError(
      "NOT_FOUND",
      "Media attachment not found.",
    )
  }
  if (!attachment.sourceLineId) {
    throw new ServiceCommerceMediaError(
      "NOT_READY",
      "A current source line is required for media viewing.",
    )
  }
  const source = await resolveCurrentServiceCommerceMediaSource(tx, {
    actorUserId: input.actorUserId,
    source: {
      id: attachment.sourceId,
      kind: toSourceKind(attachment.sourceKind),
    },
    sourceLineId: attachment.sourceLineId,
    sourceVersion: attachment.sourceVersion,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  await validateServiceCommerceMediaIntakeReadiness(tx, {
    actorUserId: input.actorUserId,
    attachmentCount: 1,
    byteSize: attachment.mediaAsset.verifiedSizeBytes ?? 0,
    channel:
      attachment.mediaAsset.channelOrigin.toLowerCase() as ServiceCommerceChannelOrigin,
    kind: attachment.mediaAsset.kind.toLowerCase() as ServiceCommerceMediaKind,
    mimeType: (attachment.mediaAsset.verifiedMediaType ??
      attachment.mediaAsset.declaredMediaType) as ServiceCommerceMediaMimeType,
    privateMediaProviderReady: true,
    signatureMimeType: attachment.mediaAsset
      .verifiedMediaType as ServiceCommerceMediaMimeType | null,
    storeId: input.storeId,
    tenantId: input.tenantId,
    vertical: source.vertical,
  })
  const state = getServiceCommerceMediaViewerGrantState({
    accessAuthorized: true,
    assetLifecycle: attachment.mediaAsset.lifecycle.toLowerCase() as "safe",
    attachmentLifecycle: attachment.lifecycle.toLowerCase() as "active",
    expiresAt: input.expiresAt,
  })
  if (state !== "available" || !attachment.mediaAsset.objectKey) {
    throw new ServiceCommerceMediaError(
      "FORBIDDEN",
      "A safe active media attachment is required for viewing.",
    )
  }
  await auditMedia(tx, {
    actorUserId: input.actorUserId,
    attachmentId: attachment.id,
    lifecycle: ServiceCommerceMediaLifecycle.SAFE,
    mediaAssetId: attachment.mediaAssetId,
    reason: input.reason,
    storeId: input.storeId,
    tenantId: input.tenantId,
    type: ServiceCommerceMediaAuditEventType.VIEW_AUTHORIZED,
  })
  return {
    expiresAt: input.expiresAt,
    mediaAssetId: attachment.mediaAssetId,
    storageReference: attachment.mediaAsset.objectKey,
  }
}

export async function getScopedServiceCommerceMediaAttachment(
  db: DbClient,
  input: { attachmentId: string; storeId: string; tenantId: string },
) {
  const attachment = await db.serviceCommerceSourceAttachment.findFirst({
    include: {
      mediaAsset: true,
      observations: {
        orderBy: { revision: "desc" },
        take: 1,
        where: { lifecycle: "CURRENT" },
      },
    },
    where: {
      id: input.attachmentId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!attachment) {
    throw new ServiceCommerceMediaError(
      "NOT_FOUND",
      "Media attachment not found.",
    )
  }
  return attachment
}

export async function getAuthorizedServiceCommerceMediaAttachment(
  db: PrismaClient,
  input: {
    actorUserId: string
    attachmentId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    await assertActiveServiceCommerceAttendant(tx, input)
    const attachment = await getScopedServiceCommerceMediaAttachment(tx, input)
    if (!attachment.sourceLineId) {
      throw new ServiceCommerceMediaError(
        "NOT_READY",
        "A current source line is required for media access.",
      )
    }
    const source = await resolveCurrentServiceCommerceMediaSource(tx, {
      actorUserId: input.actorUserId,
      source: {
        id: attachment.sourceId,
        kind: toSourceKind(attachment.sourceKind),
      },
      sourceLineId: attachment.sourceLineId,
      sourceVersion: attachment.sourceVersion,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    await validateServiceCommerceMediaIntakeReadiness(tx, {
      actorUserId: input.actorUserId,
      attachmentCount: 1,
      byteSize:
        attachment.mediaAsset.verifiedSizeBytes ??
        attachment.mediaAsset.declaredSizeBytes ??
        0,
      channel:
        attachment.mediaAsset.channelOrigin.toLowerCase() as ServiceCommerceChannelOrigin,
      deferSignatureValidation: true,
      kind: attachment.mediaAsset.kind.toLowerCase() as ServiceCommerceMediaKind,
      mimeType: (attachment.mediaAsset.verifiedMediaType ??
        attachment.mediaAsset
          .declaredMediaType) as ServiceCommerceMediaMimeType,
      privateMediaProviderReady: true,
      signatureMimeType: attachment.mediaAsset
        .verifiedMediaType as ServiceCommerceMediaMimeType | null,
      storeId: input.storeId,
      tenantId: input.tenantId,
      vertical: source.vertical,
    })
    return attachment
  })
}
