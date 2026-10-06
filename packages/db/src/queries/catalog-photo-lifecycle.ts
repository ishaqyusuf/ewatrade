import {
  CATALOG_PHOTO_CLEANUP_GRACE_MS,
  CATALOG_PHOTO_CONTENT_TYPES,
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

const options = { maxWait: 10_000, timeout: 30_000 } as const

function descriptor(asset: {
  id: string
  tenantId: string
  storeId: string
  contentDigest: string
  contentType: string
  sizeBytes: number
}) {
  const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
    (type) => type === asset.contentType,
  )
  if (!contentType)
    throw new CatalogPhotoError("INVALID_PHOTO", "Photo unavailable.")
  const photo: CatalogStoredPhoto = {
    tenantId: asset.tenantId,
    storeId: asset.storeId,
    contentDigest: asset.contentDigest,
    sizeBytes: asset.sizeBytes,
    assetId: asset.id,
    contentType,
    storageProvider: "vercel_blob_private",
    storagePath: "",
  }
  photo.storagePath = catalogPhotoStoragePath(photo)
  return photo
}

/** Logical removal precedes provider I/O; pending deletion stays durable/retryable. */
export async function removeCatalogPhoto(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  return db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, input)
    const [asset] = await tx.$queryRaw<
      Array<{
        id: string
        tenantId: string
        storeId: string
        contentDigest: string
        contentType: string
        sizeBytes: number
        bytesDeletedAt: Date | null
        state: string
        expiresAt: Date
      }>
    >(Prisma.sql`
      SELECT * FROM "CatalogPhotoAsset" WHERE "id"=${input.assetId} AND "tenantId"=${input.tenantId}
      AND "storeId"=${input.storeId} AND ("actorUserId"=${input.actorUserId} OR "catalogItemId" IS NOT NULL) FOR UPDATE
    `)
    if (!asset)
      throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
    // A bounded writer already in flight may finish after logical removal.
    // Keep its durable cleanup identity until the 30-second transport/storage
    // deadlines have elapsed; a failed writer can never resurrect visibility.
    const expiresAt =
      asset.state === "REMOVED"
        ? asset.expiresAt
        : new Date(Date.now() + CATALOG_PHOTO_CLEANUP_GRACE_MS)
    await tx.catalogPhotoAsset.update({
      where: { id: asset.id },
      data: {
        state: "REMOVED",
        catalogItemId: null,
        sortOrder: null,
        approvedAt: null,
        expiresAt,
      },
    })
    return {
      photo: descriptor(asset),
      scope: {
        tenantId: asset.tenantId,
        storeId: asset.storeId,
        dataClassification: tenant.dataClassification,
      },
      alreadyDeleted: Boolean(asset.bytesDeletedAt),
      canDelete: expiresAt <= new Date(),
    }
  }, options)
}

/** Called only after the pinned provider confirms deletion of this exact path. */
export async function recordCatalogPhotoDeletion(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { photo: CatalogStoredPhoto },
) {
  if (
    input.photo.tenantId !== input.tenantId ||
    input.photo.storeId !== input.storeId ||
    input.photo.storagePath !== catalogPhotoStoragePath(input.photo)
  )
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Photo deletion does not match.",
    )
  return db.$transaction(async (tx) => {
    await authorizeCatalogPhotoScope(tx, input)
    if (
      await tx.catalogPhotoDerivative.count({
        where: { assetId: input.photo.assetId, tenantId: input.tenantId },
      })
    )
      throw new CatalogPhotoError(
        "PHOTO_COMMAND_CONFLICT",
        "Photo derivative cleanup is pending.",
      )
    const result = await tx.catalogPhotoAsset.updateMany({
      where: {
        id: input.photo.assetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        state: "REMOVED",
        catalogItemId: null,
        expiresAt: { lte: new Date() },
        contentDigest: input.photo.contentDigest,
      },
      data: { bytesDeletedAt: new Date(), storagePath: null },
    })
    if (result.count !== 1)
      throw new CatalogPhotoError(
        "PHOTO_COMMAND_CONFLICT",
        "Photo removal changed. Retry.",
      )
    return { assetId: input.photo.assetId, state: "REMOVED" as const }
  }, options)
}

export async function listExpiredCatalogPhotoIds(
  db: PrismaClient,
  input: CatalogPhotoActorScope,
) {
  return db.$transaction(async (tx) => {
    await authorizeCatalogPhotoScope(tx, input)
    return tx.catalogPhotoAsset.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        bytesDeletedAt: null,
        expiresAt: { lte: new Date() },
        OR: [{ state: "REMOVED" }, { catalogItemId: null }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 32,
    })
  }, options)
}

/** No browser/mobile mutation exposes verdicts. A trusted screening worker calls
 * this only after checking the normalized bytes with its configured provider. */
export async function recordCatalogPhotoVerdict(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    assetId: string
    sourceDigest: string
    displayDigest: string
    provider: string
    policyVersion: string
    verdict: "APPROVED" | "REJECTED"
    leaseToken?: string
    storageStoreId?: string
  },
) {
  if (
    !/^[a-f0-9]{64}$/.test(input.sourceDigest) ||
    !/^[a-f0-9]{64}$/.test(input.displayDigest) ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.provider) ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.policyVersion)
  )
    throw new CatalogPhotoError("INVALID_PHOTO", "Invalid photo review.")
  const snapshot = { ...input }
  return db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, snapshot)
    const [asset] = await tx.$queryRaw<
      Array<{
        id: string
        state: string
        contentDigest: string
        storagePath: string | null
        uploadedAt: Date | null
        catalogItemId: string | null
        expiresAt: Date
        bytesDeletedAt: Date | null
        storageStoreId: string | null
        reviewLeaseToken: string | null
        reviewLeaseUntil: Date | null
      }>
    >(Prisma.sql`
      SELECT * FROM "CatalogPhotoAsset" WHERE "id"=${snapshot.assetId} AND "tenantId"=${snapshot.tenantId}
      AND "storeId"=${snapshot.storeId} AND "actorUserId"=${snapshot.actorUserId} FOR UPDATE
    `)
    if (
      !asset ||
      tenant.dataClassification !== "LIVE" ||
      asset.bytesDeletedAt !== null ||
      asset.contentDigest !== snapshot.sourceDigest ||
      !asset.storagePath ||
      !asset.uploadedAt ||
      asset.state !== "PENDING_REVIEW" ||
      (!asset.catalogItemId && asset.expiresAt <= new Date())
    )
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "Photo is no longer ready for review.",
      )
    if (
      snapshot.leaseToken
        ? asset.reviewLeaseToken !== snapshot.leaseToken ||
          !asset.reviewLeaseUntil ||
          asset.reviewLeaseUntil <= new Date() ||
          !snapshot.storageStoreId ||
          asset.storageStoreId !== snapshot.storageStoreId ||
          snapshot.storageStoreId !== process.env.BLOB_STORE_ID?.trim()
        : asset.reviewLeaseToken !== null
    )
      throw new CatalogPhotoError(
        "PHOTO_NOT_READY",
        "Photo review lease is no longer valid.",
      )
    const now = new Date()
    await tx.catalogPhotoAsset.update({
      where: { id: asset.id },
      data: {
        state: snapshot.verdict,
        reviewProvider: snapshot.provider,
        reviewPolicyVersion: snapshot.policyVersion,
        reviewDisplayDigest: snapshot.displayDigest,
        reviewedAt: now,
        approvedAt: snapshot.verdict === "APPROVED" ? now : null,
        reviewLeaseToken: null,
        reviewLeaseUntil: null,
      },
    })
    return { assetId: asset.id, state: snapshot.verdict }
  }, options)
}

/** Internal retention worker authority, separate from merchant permissions.
 * Only expired unattached or removed LIVE assets are eligible. */
export async function listCatalogPhotoCleanupCandidates(db: PrismaClient) {
  return db.catalogPhotoAsset.findMany({
    where: {
      bytesDeletedAt: null,
      expiresAt: { lte: new Date() },
      OR: [{ state: "REMOVED" }, { catalogItemId: null }],
      tenant: {
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
    },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: 4,
  })
}

export async function claimCatalogPhotoCleanup(
  db: PrismaClient,
  assetId: string,
) {
  return db.$transaction(async (tx) => {
    const assets = await tx.$queryRaw<
      Array<{
        id: string
        tenantId: string
        storeId: string
        contentDigest: string
        contentType: string
        sizeBytes: number
        storageStoreId: string | null
        state: string
        expiresAt: Date
      }>
    >(Prisma.sql`
      SELECT a.* FROM "CatalogPhotoAsset" a JOIN "Tenant" t ON t."id"=a."tenantId" JOIN "Store" s ON s."id"=a."storeId"
      WHERE a."id"=${assetId} AND a."bytesDeletedAt" IS NULL AND a."expiresAt" <= NOW()
      AND (a."state"='REMOVED' OR a."catalogItemId" IS NULL)
      AND t."dataClassification"='LIVE' AND t."qaPurgeStartedAt" IS NULL
      AND (a."state"<>'REMOVED' OR NOT EXISTS (SELECT 1 FROM "CatalogPhotoDerivative" d WHERE d."assetId"=a."id" AND d."tenantId"=a."tenantId"))
      FOR UPDATE OF a SKIP LOCKED
    `)
    const asset = assets[0]
    if (!asset) return null
    if (asset.state !== "REMOVED") {
      await tx.catalogPhotoAsset.update({
        where: { id: asset.id },
        data: {
          state: "REMOVED",
          catalogItemId: null,
          sortOrder: null,
          approvedAt: null,
          expiresAt: new Date(Date.now() + CATALOG_PHOTO_CLEANUP_GRACE_MS),
        },
      })
      return null
    }
    return {
      storageStoreId: asset.storageStoreId,
      photo: descriptor(asset),
      scope: {
        tenantId: asset.tenantId,
        storeId: asset.storeId,
        dataClassification: "LIVE" as const,
      },
    }
  }, options)
}

export async function finishCatalogPhotoCleanup(
  db: PrismaClient,
  photo: CatalogStoredPhoto,
) {
  if (
    photo.storageProvider !== "vercel_blob_private" ||
    photo.storagePath !== catalogPhotoStoragePath(photo)
  )
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Invalid photo cleanup identity.",
    )
  const result = await db.catalogPhotoAsset.updateMany({
    where: {
      id: photo.assetId,
      tenantId: photo.tenantId,
      storeId: photo.storeId,
      state: "REMOVED",
      catalogItemId: null,
      contentDigest: photo.contentDigest,
      expiresAt: { lte: new Date() },
      tenant: { dataClassification: "LIVE", qaPurgeStartedAt: null },
    },
    data: { bytesDeletedAt: new Date(), storagePath: null },
  })
  return result.count === 1
}
