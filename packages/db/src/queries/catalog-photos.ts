import { createHash, randomUUID } from "node:crypto"
import {
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogPhotoContentType,
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import {
  type CatalogPhotoAsset,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"

export class CatalogPhotoError extends Error {
  constructor(
    readonly code:
      | "INVALID_PHOTO"
      | "PHOTO_NOT_FOUND"
      | "PHOTO_ACCESS_DENIED"
      | "PHOTO_COMMAND_CONFLICT"
      | "PHOTO_NOT_READY"
      | "PHOTO_LIMIT_REACHED",
    message: string,
  ) {
    super(message)
    this.name = "CatalogPhotoError"
  }
}

export type CatalogPhotoActorScope = {
  actorUserId: string
  tenantId: string
  storeId: string
}

export type CreateCatalogPhotoIntentInput = CatalogPhotoActorScope & {
  clientOperationId: string
  contentDigest: string
  contentType: CatalogPhotoContentType
  sizeBytes: number
}

const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const
const intentLifetimeMs = 24 * 60 * 60 * 1000
const maxOpenIntents = 32

/** Public metadata never carries private object paths or provider credentials. */
function metadata(asset: CatalogPhotoAsset) {
  return {
    assetId: asset.id,
    catalogItemId: asset.catalogItemId,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    state: asset.state,
    expiresAt: asset.expiresAt,
    uploadedAt: asset.uploadedAt,
    attachedAt: asset.attachedAt,
    sortOrder: asset.sortOrder,
    bytesDeletedAt: asset.bytesDeletedAt,
  }
}

function validateIntent(input: CreateCatalogPhotoIntentInput) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input.actorUserId) ||
    input.clientOperationId.length < 8 ||
    input.clientOperationId.length > 160 ||
    !/^[a-f0-9]{64}$/.test(input.contentDigest) ||
    !CATALOG_PHOTO_CONTENT_TYPES.includes(input.contentType) ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > CATALOG_PHOTO_MAX_BYTES
  ) {
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Invalid photo upload details.",
    )
  }
  catalogPhotoStoragePath({ ...input, assetId: "validated-intent" })
}

/** Locks current permissions for the transaction, including replay operations. */
export async function authorizeCatalogPhotoScope(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
) {
  const tenants = await tx.$queryRaw<
    Array<{ id: string; dataClassification: "LIVE" | "QA" }>
  >(Prisma.sql`
    SELECT "id", "dataClassification" FROM "Tenant"
    WHERE "id" = ${scope.tenantId} AND "isActive" = true
      AND "qaPurgeStartedAt" IS NULL FOR SHARE
  `)
  const stores = tenants.length
    ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Store" WHERE "id" = ${scope.storeId}
          AND "tenantId" = ${scope.tenantId} AND "status" = 'ACTIVE' FOR SHARE
      `)
    : []
  const memberships = stores.length
    ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Membership" WHERE "tenantId" = ${scope.tenantId}
          AND "userId" = ${scope.actorUserId} AND "status" = 'ACTIVE'
          AND "role" IN ('OWNER', 'ADMIN', 'MANAGER') FOR SHARE
      `)
    : []
  if (!memberships.length) {
    throw new CatalogPhotoError(
      "PHOTO_ACCESS_DENIED",
      "Catalog photo management is unavailable in this business and Store.",
    )
  }
  const tenant = tenants[0]
  if (!tenant)
    throw new CatalogPhotoError(
      "PHOTO_ACCESS_DENIED",
      "Catalog photos are unavailable.",
    )
  return tenant
}

/** Server-only upload target; no private descriptor is returned by metadata API. */
export async function getCatalogPhotoUploadTarget(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  return db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, input)
    const asset = await tx.catalogPhotoAsset.findFirst({
      where: {
        id: input.assetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        actorUserId: input.actorUserId,
      },
    })
    if (!asset)
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    if (
      (asset.state !== "UPLOADING" && asset.state !== "PENDING_REVIEW") ||
      (asset.expiresAt <= new Date() && !asset.catalogItemId)
    ) {
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "This photo upload is no longer available.",
      )
    }
    const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
      (type) => type === asset.contentType,
    )
    if (!contentType) {
      throw new CatalogPhotoError(
        "INVALID_PHOTO",
        "Invalid photo upload details.",
      )
    }
    if (
      tenant.dataClassification === "LIVE" &&
      (!asset.storageStoreId ||
        asset.storageStoreId !== process.env.BLOB_STORE_ID?.trim())
    )
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "Photo storage ownership is unavailable.",
      )
    return {
      assetId: asset.id,
      actorUserId: input.actorUserId,
      scope: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        dataClassification: tenant.dataClassification,
      },
      contentDigest: asset.contentDigest,
      contentType,
      sizeBytes: asset.sizeBytes,
    }
  }, transactionOptions)
}

export async function createCatalogPhotoIntent(
  db: PrismaClient,
  input: CreateCatalogPhotoIntentInput,
) {
  validateIntent(input)
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify([
        input.actorUserId,
        input.storeId,
        input.contentDigest,
        input.contentType,
        input.sizeBytes,
      ]),
    )
    .digest("hex")
  return db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, input)
    // Serializes quota/replay for one actor/Store, including simultaneous retries.
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(
        ${`catalog-photo-intent:${input.tenantId}:${input.storeId}:${input.actorUserId}`}, 0))
    `)
    const where = {
      tenantId_clientOperationId: {
        tenantId: input.tenantId,
        clientOperationId: input.clientOperationId,
      },
    }
    let asset = await tx.catalogPhotoAsset.findUnique({ where })
    if (!asset) {
      const now = new Date()
      const count = await tx.catalogPhotoAsset.count({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          catalogItemId: null,
          expiresAt: { gt: now },
          state: { in: ["UPLOADING", "PENDING_REVIEW"] },
        },
      })
      if (count >= maxOpenIntents) {
        throw new CatalogPhotoError(
          "PHOTO_LIMIT_REACHED",
          "Finish your existing photo uploads before adding more.",
        )
      }
      await tx.catalogPhotoAsset.createMany({
        skipDuplicates: true,
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          storeId: input.storeId,
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          payloadHash,
          storageStoreId:
            tenant.dataClassification === "LIVE" &&
            /^store_[a-zA-Z0-9]+$/.test(process.env.BLOB_STORE_ID?.trim() ?? "")
              ? process.env.BLOB_STORE_ID?.trim()
              : null,
          contentDigest: input.contentDigest,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          expiresAt: new Date(now.getTime() + intentLifetimeMs),
        },
      })
      asset = await tx.catalogPhotoAsset.findUniqueOrThrow({ where })
    }
    if (asset.payloadHash !== payloadHash) {
      throw new CatalogPhotoError(
        "PHOTO_COMMAND_CONFLICT",
        "This upload identity was already used for another photo or context.",
      )
    }
    return metadata(asset)
  }, transactionOptions)
}

export async function getCatalogPhotoMetadata(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  return db.$transaction(async (tx) => {
    await authorizeCatalogPhotoScope(tx, input)
    const asset = await tx.catalogPhotoAsset.findFirst({
      where: {
        id: input.assetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        actorUserId: input.actorUserId,
      },
    })
    if (!asset)
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    return metadata(asset)
  }, transactionOptions)
}

/** Private merchant delivery. Attached photos are shared by Store managers;
 * unattached drafts stay visible only to their original actor. */
export async function getCatalogPhotoReadTarget(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  return db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, input)
    const asset = await tx.catalogPhotoAsset.findFirst({
      where: {
        id: input.assetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        OR: [
          { actorUserId: input.actorUserId },
          { catalogItemId: { not: null } },
        ],
      },
    })
    if (
      !asset ||
      !asset.storagePath ||
      !asset.uploadedAt ||
      asset.state === "REMOVED" ||
      asset.state === "REJECTED" ||
      (!asset.catalogItemId && asset.expiresAt <= new Date())
    )
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
      (type) => type === asset.contentType,
    )
    if (!contentType)
      throw new CatalogPhotoError("INVALID_PHOTO", "Photo unavailable.")
    const photo: CatalogStoredPhoto = {
      assetId: asset.id,
      tenantId: asset.tenantId,
      storeId: asset.storeId,
      storageProvider: "vercel_blob_private",
      storagePath: asset.storagePath,
      contentDigest: asset.contentDigest,
      contentType,
      sizeBytes: asset.sizeBytes,
    }
    if (
      !asset.storageStoreId ||
      asset.storageStoreId !== process.env.BLOB_STORE_ID?.trim() ||
      asset.storageProvider !== photo.storageProvider ||
      photo.storagePath !== catalogPhotoStoragePath(photo)
    )
      throw new CatalogPhotoError("INVALID_PHOTO", "Photo unavailable.")
    return {
      photo,
      storageStoreId: asset.storageStoreId,
      scope: {
        tenantId: asset.tenantId,
        storeId: asset.storeId,
        dataClassification: tenant.dataClassification,
      },
    }
  }, transactionOptions)
}

/** Anonymous delivery requires both a trusted verdict and current published
 * storefront/Offering availability. Asset ids alone are never capabilities. */
export async function getCatalogPublicPhotoTarget(
  db: PrismaClient,
  input: { assetId: string; storeId: string },
) {
  const asset = await db.catalogPhotoAsset.findFirst({
    where: {
      id: input.assetId,
      storeId: input.storeId,
      state: "APPROVED",
      approvedAt: { not: null },
      reviewedAt: { not: null },
      reviewProvider: { not: null },
      reviewPolicyVersion: { not: null },
      reviewDisplayDigest: { not: null },
      bytesDeletedAt: null,
      tenant: {
        isActive: true,
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      store: { status: "ACTIVE", sites: { some: { status: "PUBLISHED" } } },
      catalogItem: {
        is: {
          status: "ACTIVE",
          archivedAt: null,
          offerings: {
            some: {
              status: "ACTIVE",
              variant: { status: "ACTIVE" },
              storeAvailability: {
                some: { storeId: input.storeId, isAvailable: true },
              },
            },
          },
        },
      },
    },
  })
  if (!asset?.storagePath || !asset.uploadedAt || !asset.reviewDisplayDigest)
    throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
  const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
    (type) => type === asset.contentType,
  )
  if (!contentType)
    throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
  const photo: CatalogStoredPhoto = {
    assetId: asset.id,
    tenantId: asset.tenantId,
    storeId: asset.storeId,
    storageProvider: "vercel_blob_private",
    storagePath: asset.storagePath,
    contentDigest: asset.contentDigest,
    contentType,
    sizeBytes: asset.sizeBytes,
  }
  if (
    !asset.storageStoreId ||
    asset.storageStoreId !== process.env.BLOB_STORE_ID?.trim() ||
    asset.storageProvider !== photo.storageProvider ||
    photo.storagePath !== catalogPhotoStoragePath(photo)
  )
    throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
  return {
    photo,
    storageStoreId: asset.storageStoreId,
    displayDigest: asset.reviewDisplayDigest,
    scope: {
      tenantId: asset.tenantId,
      storeId: asset.storeId,
      dataClassification: "LIVE" as const,
    },
  }
}

async function lockAssets(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
  assetIds: string[],
) {
  if (
    assetIds.length > 8 ||
    new Set(assetIds).size !== assetIds.length ||
    assetIds.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
  ) {
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Choose up to eight distinct photos.",
    )
  }
  await authorizeCatalogPhotoScope(tx, scope)
  if (!assetIds.length) return []
  // Stable order prevents overlapping multi-photo commands from deadlocking.
  const assets = await tx.$queryRaw<CatalogPhotoAsset[]>(Prisma.sql`
    SELECT * FROM "CatalogPhotoAsset" WHERE "id" IN (${Prisma.join(assetIds)})
      AND "tenantId" = ${scope.tenantId} AND "storeId" = ${scope.storeId}
      AND "actorUserId" = ${scope.actorUserId} ORDER BY "id" FOR UPDATE
  `)
  if (assets.length !== assetIds.length)
    throw new CatalogPhotoError(
      "PHOTO_NOT_FOUND",
      "One or more photos are unavailable in this context.",
    )
  return assets
}

/** Server-internal completion. Call only after scoped storage verifies bytes. */
export async function recordVerifiedCatalogPhotoUpload(
  db: PrismaClient,
  scope: CatalogPhotoActorScope,
  photo: CatalogStoredPhoto,
) {
  // Snapshot the verified descriptor before any awaits.
  const verified = { ...photo }
  if (
    verified.tenantId !== scope.tenantId ||
    verified.storeId !== scope.storeId ||
    verified.storageProvider !== "vercel_blob_private" ||
    verified.storagePath !== catalogPhotoStoragePath(verified)
  ) {
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Stored photo identity does not match its upload.",
    )
  }
  return db.$transaction(async (tx) => {
    const [asset] = await lockAssets(tx, scope, [verified.assetId])
    if (!asset)
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    if (
      asset.contentDigest !== verified.contentDigest ||
      asset.contentType !== verified.contentType ||
      asset.sizeBytes !== verified.sizeBytes
    ) {
      throw new CatalogPhotoError(
        "PHOTO_COMMAND_CONFLICT",
        "Stored photo contents do not match the upload intent.",
      )
    }
    if (
      asset.state === "PENDING_REVIEW" &&
      asset.storagePath === verified.storagePath
    )
      return metadata(asset)
    if (asset.state !== "UPLOADING" || asset.expiresAt <= new Date())
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "This photo upload is no longer available.",
      )
    return metadata(
      await tx.catalogPhotoAsset.update({
        where: { id: asset.id },
        data: {
          state: "PENDING_REVIEW",
          storagePath: verified.storagePath,
          uploadedAt: new Date(),
        },
      }),
    )
  }, transactionOptions)
}

/** Must share the Item creation transaction. Pending photos never become URLs. */
export async function attachCatalogPhotoAssets(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoActorScope & { assetIds: string[]; catalogItemId: string },
) {
  const assets = await lockAssets(tx, input, input.assetIds)
  const item = await tx.catalogItem.findFirst({
    where: {
      id: input.catalogItemId,
      tenantId: input.tenantId,
      archivedAt: null,
      status: { not: "ARCHIVED" },
    },
    select: { id: true },
  })
  if (!item)
    throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Catalog item not found.")
  if (
    assets.some(
      (asset) =>
        (asset.state !== "PENDING_REVIEW" && asset.state !== "APPROVED") ||
        !asset.storagePath ||
        !asset.uploadedAt ||
        asset.expiresAt <= new Date() ||
        asset.catalogItemId,
    )
  ) {
    throw new CatalogPhotoError(
      "PHOTO_NOT_READY",
      "Finish the photo upload before adding it to this item.",
    )
  }
  const attachedAt = new Date()
  for (const [sortOrder, id] of input.assetIds.entries())
    await tx.catalogPhotoAsset.update({
      where: { id },
      data: {
        catalogItemId: item.id,
        sortOrder,
        attachedAt,
      },
    })
}

export async function assertCatalogPhotoCreationReplay(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoActorScope & { assetIds: string[]; catalogItemId: string },
) {
  const assets = await lockAssets(tx, input, input.assetIds)
  if (assets.some((asset) => asset.catalogItemId !== input.catalogItemId))
    throw new CatalogPhotoError(
      "PHOTO_COMMAND_CONFLICT",
      "The previous item does not own these photos.",
    )
}
