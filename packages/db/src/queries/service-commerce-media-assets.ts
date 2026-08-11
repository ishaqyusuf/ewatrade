import {
  type ServiceCommerceChannelOrigin,
  type ServiceCommerceMediaKind,
  type ServiceCommerceMediaMimeType,
  type ServiceCommercePrivateMediaSafetyLifecycle,
  canTransitionServiceCommerceMediaAsset,
  getServiceCommerceMediaIntakeValidation,
} from "@ewatrade/service-commerce"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceMediaAuditEventType,
  ServiceCommerceMediaChannelOrigin,
  ServiceCommerceMediaKind as ServiceCommerceMediaKindEnum,
  ServiceCommerceMediaLifecycle,
  ServiceCommerceMediaRetentionClass,
} from "../../generated/prisma/enums"
import {
  ServiceCommercePolicyError,
  assertServiceCommercePolicyAllowedInTransaction,
} from "./service-commerce-policy"
import type { DbClient } from "./types"

export class ServiceCommerceMediaError extends Error {
  constructor(
    readonly code:
      | "CONFLICT"
      | "FORBIDDEN"
      | "IDEMPOTENCY_MISMATCH"
      | "INTAKE_BLOCKED"
      | "INVALID_STATE"
      | "NOT_FOUND"
      | "NOT_READY",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceMediaError"
  }
}

type AssetWriteClient = DbClient

const originToDb = {
  staff: ServiceCommerceMediaChannelOrigin.STAFF,
  web: ServiceCommerceMediaChannelOrigin.WEB,
  whatsapp: ServiceCommerceMediaChannelOrigin.WHATSAPP,
} satisfies Record<
  ServiceCommerceChannelOrigin,
  ServiceCommerceMediaChannelOrigin
>

const kindToDb = {
  document: ServiceCommerceMediaKindEnum.DOCUMENT,
  image: ServiceCommerceMediaKindEnum.IMAGE,
} satisfies Record<ServiceCommerceMediaKind, ServiceCommerceMediaKindEnum>

function lifecycleFromSafety(
  lifecycle: ServiceCommercePrivateMediaSafetyLifecycle,
) {
  if (lifecycle === "safe") return ServiceCommerceMediaLifecycle.SAFE
  if (lifecycle === "quarantined") {
    return ServiceCommerceMediaLifecycle.QUARANTINED
  }
  if (lifecycle === "rejected") return ServiceCommerceMediaLifecycle.REJECTED
  return ServiceCommerceMediaLifecycle.RETRYABLE
}

function mediaLifecycle(value: string) {
  return value.toLowerCase() as Parameters<
    typeof canTransitionServiceCommerceMediaAsset
  >[0]
}

function assertTransition(current: string, next: string) {
  if (
    !canTransitionServiceCommerceMediaAsset(
      mediaLifecycle(current),
      mediaLifecycle(next),
    )
  ) {
    throw new ServiceCommerceMediaError(
      "INVALID_STATE",
      "Media is not in a lifecycle state that permits this operation.",
    )
  }
}

export async function assertActiveServiceCommerceAttendant(
  db: AssetWriteClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const assignment = await db.serviceCommerceStoreTeamAssignment.findFirst({
    select: { id: true, membershipId: true },
    where: {
      capability: "ATTENDANT",
      membership: {
        acceptedAt: { not: null },
        status: "ACTIVE",
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
      status: "ACTIVE",
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!assignment) {
    throw new ServiceCommerceMediaError(
      "FORBIDDEN",
      "An active Store attendant assignment is required.",
    )
  }
  return assignment
}

async function getScopedAsset(
  db: AssetWriteClient,
  input: { mediaAssetId: string; storeId: string; tenantId: string },
) {
  const asset = await db.serviceCommerceMediaAsset.findFirst({
    where: {
      id: input.mediaAssetId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!asset) {
    throw new ServiceCommerceMediaError("NOT_FOUND", "Media asset not found.")
  }
  return asset
}

async function auditMedia(
  db: AssetWriteClient,
  input: {
    actorUserId?: string | null
    attachmentId?: string | null
    lifecycle?: ServiceCommerceMediaLifecycle
    mediaAssetId: string
    metadata?: Record<string, unknown>
    reason: string
    storeId: string
    tenantId: string
    type: ServiceCommerceMediaAuditEventType
  },
) {
  await db.serviceCommerceMediaAuditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      attachmentId: input.attachmentId ?? null,
      lifecycle: input.lifecycle,
      mediaAssetId: input.mediaAssetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      reason: input.reason.trim().slice(0, 240) || "media_lifecycle",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: input.type,
    },
  })
}

export async function validateServiceCommerceMediaIntakeReadiness(
  db: AssetWriteClient,
  input: {
    actorUserId: string
    attachmentCount: number
    byteSize: number
    channel: ServiceCommerceChannelOrigin
    deferSignatureValidation?: boolean
    kind: ServiceCommerceMediaKind
    mimeType: ServiceCommerceMediaMimeType
    privateMediaProviderReady: boolean
    signatureMimeType: ServiceCommerceMediaMimeType | null
    storeId: string
    tenantId: string
    vertical: "pharmacy" | "service"
  },
) {
  const profile = await db.serviceCommerceStoreProfile.findFirst({
    select: {
      attachmentsEnabled: true,
      attachmentsProviderReady: true,
      staffEnabled: true,
      status: true,
      webEnabled: true,
      whatsappEnabled: true,
    },
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  if (!profile || profile.status !== "ACTIVE") {
    throw new ServiceCommerceMediaError(
      "NOT_READY",
      "Service Commerce media is not active for this Store.",
    )
  }
  const channelEnabled =
    input.channel === "staff"
      ? profile.staffEnabled
      : input.channel === "web"
        ? profile.webEnabled
        : profile.whatsappEnabled
  const channelReady =
    input.channel !== "whatsapp"
      ? channelEnabled
      : channelEnabled &&
        Boolean(
          await db.whatsAppStoreBinding.findFirst({
            select: { id: true },
            where: {
              connection: { status: "ACTIVE", tenantId: input.tenantId },
              status: "ACTIVE",
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          }),
        )
  let policyAllowed = false
  try {
    await assertServiceCommercePolicyAllowedInTransaction(db, {
      actorUserId: input.actorUserId,
      channel: input.channel,
      purpose: "service_commerce_media_intake",
      storeId: input.storeId,
      subject: "attachments",
      tenantId: input.tenantId,
      vertical: input.vertical,
    })
    policyAllowed = true
  } catch (error) {
    if (!(error instanceof ServiceCommercePolicyError)) throw error
    policyAllowed = false
  }
  const fullValidation = getServiceCommerceMediaIntakeValidation({
    attachmentCount: input.attachmentCount,
    attachmentsEnabled: profile.attachmentsEnabled,
    byteSize: input.byteSize,
    channelReady,
    kind: input.kind,
    mimeType: input.mimeType,
    policyAllowed,
    privateMediaProviderReady:
      profile.attachmentsProviderReady && input.privateMediaProviderReady,
    signatureMimeType: input.signatureMimeType ?? input.mimeType,
  })
  const validation = input.deferSignatureValidation
    ? {
        accepted: fullValidation.blockers.every(
          (blocker) => blocker === "signature_mime_mismatch",
        ),
        blockers: fullValidation.blockers.filter(
          (blocker) => blocker !== "signature_mime_mismatch",
        ),
      }
    : fullValidation
  if (!validation.accepted) {
    throw new ServiceCommerceMediaError(
      "INTAKE_BLOCKED",
      `Media intake is blocked: ${validation.blockers.join(", ")}.`,
    )
  }
  return validation
}

function assertVerifiedMediaContent(input: {
  byteSize: number
  kind: ServiceCommerceMediaKind
  mimeType: ServiceCommerceMediaMimeType
}) {
  const validation = getServiceCommerceMediaIntakeValidation({
    attachmentCount: 1,
    attachmentsEnabled: true,
    byteSize: input.byteSize,
    channelReady: true,
    kind: input.kind,
    mimeType: input.mimeType,
    policyAllowed: true,
    privateMediaProviderReady: true,
    signatureMimeType: input.mimeType,
  })
  if (!validation.accepted) {
    throw new ServiceCommerceMediaError(
      "INTAKE_BLOCKED",
      `Retrieved media is invalid: ${validation.blockers.join(", ")}.`,
    )
  }
}

export function projectSafeServiceCommerceMediaAsset(asset: {
  createdAt: Date
  declaredMediaType: string
  id: string
  kind: string
  lifecycle: string
  originalFileName: string
  verifiedMediaType: string | null
  verifiedSizeBytes: number | null
}) {
  return {
    createdAt: asset.createdAt,
    fileName: asset.originalFileName,
    id: asset.id,
    kind: asset.kind.toLowerCase(),
    lifecycle: asset.lifecycle.toLowerCase(),
    mimeType: asset.verifiedMediaType ?? asset.declaredMediaType,
    byteSize: asset.verifiedSizeBytes,
  }
}

export async function recordStoredServiceCommerceMediaAsset(
  db: PrismaClient,
  input: {
    actorUserId?: string | null
    contentDigest: string
    mediaAssetId: string
    objectKey: string
    reason: string
    storeId: string
    tenantId: string
    verifiedMediaType: ServiceCommerceMediaMimeType
    verifiedSizeBytes: number
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    assertTransition(asset.lifecycle, ServiceCommerceMediaLifecycle.STORED)
    assertVerifiedMediaContent({
      byteSize: input.verifiedSizeBytes,
      kind: asset.kind.toLowerCase() as ServiceCommerceMediaKind,
      mimeType: input.verifiedMediaType,
    })
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        contentDigest: input.contentDigest,
        lastFailureCode: null,
        lifecycle: ServiceCommerceMediaLifecycle.STORED,
        nextRetryAt: null,
        objectKey: input.objectKey,
        storedAt: new Date(),
        verifiedMediaType: input.verifiedMediaType,
        verifiedSizeBytes: input.verifiedSizeBytes,
      },
      where: {
        id: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before it could be marked as stored.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      actorUserId: input.actorUserId,
      lifecycle: ServiceCommerceMediaLifecycle.STORED,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.UPLOAD_STORED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

export async function requestServiceCommerceMediaSafety(
  db: PrismaClient,
  input: {
    actorUserId?: string | null
    mediaAssetId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    assertTransition(
      asset.lifecycle,
      ServiceCommerceMediaLifecycle.SAFETY_PENDING,
    )
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: { lifecycle: ServiceCommerceMediaLifecycle.SAFETY_PENDING },
      where: {
        id: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before safety could be requested.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      actorUserId: input.actorUserId,
      lifecycle: ServiceCommerceMediaLifecycle.SAFETY_PENDING,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.SAFETY_REQUESTED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

export async function recordServiceCommerceMediaSafety(
  db: PrismaClient,
  input: {
    actorUserId?: string | null
    mediaAssetId: string
    outcome: ServiceCommercePrivateMediaSafetyLifecycle
    reason: string
    safetyMetadata?: Record<string, unknown>
    safetyProvider?: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    const lifecycle = lifecycleFromSafety(input.outcome)
    assertTransition(asset.lifecycle, lifecycle)
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        lifecycle,
        safetyAttempts: { increment: 1 },
        safetyMetadata: input.safetyMetadata as
          | Prisma.InputJsonValue
          | undefined,
        safetyProvider: input.safetyProvider?.trim() || null,
        safetyResolvedAt: new Date(),
      },
      where: {
        id: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before safety could be recorded.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      actorUserId: input.actorUserId,
      lifecycle,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.SAFETY_RECORDED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

export async function scheduleServiceCommerceMediaRetry(
  db: PrismaClient,
  input: {
    actorUserId?: string | null
    failureCode: string
    mediaAssetId: string
    nextRetryAt: Date
    reason: string
    retryLifecycle: "pending_retrieval" | "pending_upload"
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    const lifecycle =
      input.retryLifecycle === "pending_retrieval"
        ? ServiceCommerceMediaLifecycle.PENDING_RETRIEVAL
        : ServiceCommerceMediaLifecycle.PENDING_UPLOAD
    assertTransition(asset.lifecycle, lifecycle)
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        lastFailureCode: input.failureCode.trim().slice(0, 120),
        lifecycle,
        nextRetryAt: input.nextRetryAt,
        retrievalAttempts:
          input.retryLifecycle === "pending_retrieval"
            ? { increment: 1 }
            : undefined,
      },
      where: {
        id: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before retry could be scheduled.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      actorUserId: input.actorUserId,
      lifecycle,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.RETRY_SCHEDULED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

/**
 * Internal job boundary. Jobs receive only `mediaAssetId`; this repository
 * resolves the tenant/store-scoped private provider reference after claiming
 * the due retrieval attempt. Never return this object from a public route.
 */
export async function claimServiceCommerceMediaRetrieval(
  db: PrismaClient,
  input: { mediaAssetId: string; storeId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const candidate = await getScopedAsset(tx, input)
    if (!candidate.providerConnectionId?.trim()) {
      throw new ServiceCommerceMediaError(
        "NOT_READY",
        "A scoped provider connection is required for media retrieval.",
      )
    }
    const binding = await tx.whatsAppStoreBinding.findFirst({
      select: { id: true },
      where: {
        connection: {
          id: candidate.providerConnectionId,
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
        "The provider connection is not active for this Store.",
      )
    }
    const now = new Date()
    const claimed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        nextRetryAt: new Date(now.getTime() + 15 * 60_000),
        retrievalAttempts: { increment: 1 },
      },
      where: {
        id: input.mediaAssetId,
        lifecycle: ServiceCommerceMediaLifecycle.PENDING_RETRIEVAL,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (claimed.count !== 1) return null
    const asset = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      lifecycle: ServiceCommerceMediaLifecycle.PENDING_RETRIEVAL,
      mediaAssetId: asset.id,
      reason: "media_retrieval_claimed",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.RETRIEVAL_ATTEMPTED,
    })
    return {
      mediaAssetId: asset.id,
      provider: asset.provider,
      providerConnectionId: asset.providerConnectionId,
      providerMediaId: asset.providerMediaId,
    }
  })
}

/** Marks invalid fetched bytes as terminal; provider transport failures use retry. */
export async function rejectServiceCommerceMediaRetrieval(
  db: PrismaClient,
  input: {
    actorUserId?: string | null
    failureCode: string
    mediaAssetId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    assertTransition(asset.lifecycle, ServiceCommerceMediaLifecycle.REJECTED)
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        lastFailureCode: input.failureCode.trim().slice(0, 120),
        lifecycle: ServiceCommerceMediaLifecycle.REJECTED,
        nextRetryAt: null,
      },
      where: {
        id: asset.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before invalid retrieval could be rejected.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      actorUserId: input.actorUserId,
      lifecycle: ServiceCommerceMediaLifecycle.REJECTED,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.RETRIEVAL_ATTEMPTED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

/** Internal safety-worker read; private object references stay server-only. */
export async function getServiceCommerceMediaForSafety(
  db: PrismaClient,
  input: { mediaAssetId: string; storeId: string; tenantId: string },
) {
  const asset = await db.serviceCommerceMediaAsset.findFirst({
    where: {
      id: input.mediaAssetId,
      lifecycle: ServiceCommerceMediaLifecycle.SAFETY_PENDING,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return asset
    ? {
        contentDigest: asset.contentDigest,
        mediaAssetId: asset.id,
        mimeType: asset.verifiedMediaType,
        storageReference: asset.objectKey,
        verifiedSizeBytes: asset.verifiedSizeBytes,
      }
    : null
}

export async function claimServiceCommerceMediaRetention(
  db: PrismaClient,
  input: {
    mediaAssetId: string
    now?: Date
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const now = input.now ?? new Date()
    const leaseUntil = new Date(now.getTime() + 15 * 60_000)
    const claimed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        lifecycle: ServiceCommerceMediaLifecycle.RETENTION_HOLD,
        nextRetryAt: leaseUntil,
      },
      where: {
        id: input.mediaAssetId,
        lifecycle: {
          in: [
            ServiceCommerceMediaLifecycle.QUARANTINED,
            ServiceCommerceMediaLifecycle.REJECTED,
            ServiceCommerceMediaLifecycle.RETRYABLE,
            ServiceCommerceMediaLifecycle.SAFE,
          ],
        },
        retentionClass: ServiceCommerceMediaRetentionClass.ORDINARY_COMMERCE,
        retentionUntil: { lte: now },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (claimed.count !== 1) {
      const retry = await tx.serviceCommerceMediaAsset.updateMany({
        data: { nextRetryAt: leaseUntil },
        where: {
          id: input.mediaAssetId,
          lifecycle: ServiceCommerceMediaLifecycle.RETENTION_HOLD,
          nextRetryAt: { lte: now },
          retentionClass: ServiceCommerceMediaRetentionClass.ORDINARY_COMMERCE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (retry.count !== 1) return null
    }
    const asset = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      lifecycle: ServiceCommerceMediaLifecycle.RETENTION_HOLD,
      mediaAssetId: asset.id,
      reason: "baseline_retention_due",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.RETENTION_HELD,
    })
    return {
      mediaAssetId: asset.id,
      storageReference: asset.objectKey,
    }
  })
}

export async function recordDeletedServiceCommerceMediaAsset(
  db: PrismaClient,
  input: {
    mediaAssetId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await getScopedAsset(tx, input)
    // Object deletion can succeed while the worker crashes before this durable
    // transition. A replay must therefore be safe and must not try to recreate
    // private provider references or append a second deletion audit event.
    if (asset.lifecycle === ServiceCommerceMediaLifecycle.DELETED) {
      return projectSafeServiceCommerceMediaAsset(asset)
    }
    assertTransition(asset.lifecycle, ServiceCommerceMediaLifecycle.DELETED)
    const changed = await tx.serviceCommerceMediaAsset.updateMany({
      data: {
        deletedAt: new Date(),
        lifecycle: ServiceCommerceMediaLifecycle.DELETED,
        nextRetryAt: null,
        objectKey: null,
        providerConnectionId: null,
        providerMediaId: null,
      },
      where: {
        id: input.mediaAssetId,
        lifecycle: ServiceCommerceMediaLifecycle.RETENTION_HOLD,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (changed.count !== 1) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "Media changed before retention deletion completed.",
      )
    }
    const updated = await getScopedAsset(tx, input)
    await auditMedia(tx, {
      lifecycle: ServiceCommerceMediaLifecycle.DELETED,
      mediaAssetId: asset.id,
      reason: input.reason,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: ServiceCommerceMediaAuditEventType.DELETED,
    })
    return projectSafeServiceCommerceMediaAsset(updated)
  })
}

export { auditMedia, getScopedAsset, kindToDb, originToDb }
