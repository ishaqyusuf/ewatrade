import { randomUUID } from "node:crypto"
import {
  type CatalogPhotoDerivative,
  type CatalogPhotoScope,
  type CatalogStoredPhoto,
} from "@ewatrade/catalog/photo-contracts"
import { validateCatalogPhotoDerivative } from "@ewatrade/catalog/photo-derivatives"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"

const options = { maxWait: 10_000, timeout: 30_000 } as const
const provenance = "catalog-derivative-v1"
export type CatalogPhotoCacheTarget = {
  photo: CatalogStoredPhoto
  scope: CatalogPhotoScope
  storageStoreId: string
}

function receipt(row: {
  assetId: string
  tenantId: string
  storeId: string
  sourceDigest: string
  processingVersion: string
  variant: string
  displayDigest: string
  storageStoreId: string
  storagePath: string
  contentDigest: string
  contentType: string
  sizeBytes: number
  width: number
  height: number
}): CatalogPhotoDerivative {
  if (
    (row.variant !== "display" && row.variant !== "thumbnail") ||
    row.contentType !== "image/webp"
  )
    throw new Error("Invalid Catalog derivative receipt.")
  const result: CatalogPhotoDerivative = {
    ...row,
    variant: row.variant,
    contentType: row.contentType,
  }
  validateCatalogPhotoDerivative(result)
  return result
}

export async function readCatalogPhotoDerivativeReceipts(
  db: PrismaClient,
  target: CatalogPhotoCacheTarget,
  processingVersion: string,
) {
  const rows = await db.catalogPhotoDerivative.findMany({
    where: {
      assetId: target.photo.assetId,
      tenantId: target.scope.tenantId,
      storeId: target.scope.storeId,
      sourceDigest: target.photo.contentDigest,
      storageStoreId: target.storageStoreId,
      processingVersion,
      dataClassification: "LIVE",
      provenance,
      readyAt: { not: null },
      leaseToken: null,
    },
    take: 3,
  })
  if (rows.length !== 2) return null
  const display = rows.find((row) => row.variant === "display")
  const thumbnail = rows.find((row) => row.variant === "thumbnail")
  if (
    !display ||
    !thumbnail ||
    display.displayDigest !== thumbnail.displayDigest
  )
    return null
  return { display: receipt(display), thumbnail: receipt(thumbnail) }
}

/** Inventory both immutable identities BEFORE provider work. Tenant then asset
 * locks serialize with deletion inventory/removal. Maximum four codec versions.
 * Pending rows are cleanup receipts even after process crash or unknown put. */
export async function reserveCatalogPhotoDerivatives(
  db: PrismaClient,
  target: CatalogPhotoCacheTarget,
  photos: CatalogPhotoDerivative[],
) {
  if (photos.length !== 2 || new Set(photos.map((p) => p.variant)).size !== 2)
    return false
  const display = photos.find((photo) => photo.variant === "display")
  if (
    !display ||
    photos.some(
      (photo) =>
        photo.processingVersion !== display.processingVersion ||
        photo.displayDigest !== display.contentDigest,
    )
  )
    return false
  for (const photo of photos) validateCatalogPhotoDerivative(photo)
  return db.$transaction(async (tx) => {
    const [tenant] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Tenant" WHERE "id"=${target.scope.tenantId} AND "isActive"=true
      AND "dataClassification"='LIVE' AND "qaPurgeStartedAt" IS NULL FOR UPDATE
    `)
    if (!tenant) return false
    const [asset] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "CatalogPhotoAsset" WHERE "id"=${target.photo.assetId}
      AND "tenantId"=${target.scope.tenantId} AND "storeId"=${target.scope.storeId}
      AND "contentDigest"=${target.photo.contentDigest} AND "storagePath"=${target.photo.storagePath}
      AND "storageStoreId"=${target.storageStoreId} AND "bytesDeletedAt" IS NULL
      AND "state" IN ('PENDING_REVIEW', 'APPROVED') AND ("catalogItemId" IS NOT NULL OR "expiresAt">NOW()) FOR UPDATE
    `)
    if (!asset) return false
    const rows = await tx.catalogPhotoDerivative.findMany({
      where: { assetId: asset.id },
      take: 9,
    })
    if (rows.length > 8) return false
    let added = 0
    for (const photo of photos) {
      if (
        photo.tenantId !== target.scope.tenantId ||
        photo.storeId !== target.scope.storeId ||
        photo.assetId !== target.photo.assetId ||
        photo.sourceDigest !== target.photo.contentDigest ||
        photo.storageStoreId !== target.storageStoreId
      )
        return false
      const previous = rows.find((row) => row.storagePath === photo.storagePath)
      if (previous) {
        if (
          previous.leaseToken ||
          Object.entries(photo).some(
            ([key, value]) => previous[key as keyof typeof previous] !== value,
          )
        )
          return false
      } else added++
    }
    if (rows.length + added > 8) return false
    const deadline = new Date(Date.now() + 180_000)
    for (const photo of photos) {
      const previous = rows.find((row) => row.storagePath === photo.storagePath)
      if (previous)
        await tx.catalogPhotoDerivative.update({
          where: { id: previous.id },
          data: { writeUntil: deadline, availableAt: deadline },
        })
      else
        await tx.catalogPhotoDerivative.create({
          data: {
            ...photo,
            dataClassification: "LIVE",
            provenance,
            writeUntil: deadline,
            availableAt: deadline,
          },
        })
    }
    return true
  }, options)
}

export async function completeCatalogPhotoDerivative(
  db: PrismaClient,
  photo: CatalogPhotoDerivative,
) {
  return db.$transaction(
    (tx) =>
      tx.$executeRaw(Prisma.sql`
    UPDATE "CatalogPhotoDerivative" d SET "readyAt"=NOW()
    WHERE d."assetId"=${photo.assetId} AND d."storageStoreId"=${photo.storageStoreId}
    AND d."storagePath"=${photo.storagePath} AND d."contentDigest"=${photo.contentDigest}
    AND d."leaseToken" IS NULL AND EXISTS (
      SELECT 1 FROM "CatalogPhotoAsset" a WHERE a."id"=d."assetId"
      AND a."tenantId"=d."tenantId" AND a."storeId"=d."storeId"
      AND a."contentDigest"=d."sourceDigest" AND a."bytesDeletedAt" IS NULL
      AND a."state" IN ('APPROVED', 'PENDING_REVIEW')
    )
  `),
    options,
  )
}

/** Used within the Tenant-exclusive deletion transaction. Receipts survive it;
 * all versions/pending writes retain exact original pin and grace. */
export async function inventoryCatalogDerivativesBeforeTenantDeletion(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  const rows = await tx.catalogPhotoDerivative.findMany({
    where: { tenantId },
    take: 2049,
  })
  if (rows.length > 2048)
    throw new Error("Catalog derivative inventory exceeds transaction bound.")
  const assets = await tx.catalogPhotoAsset.findMany({
    where: { tenantId },
    take: 257,
  })
  if (assets.length > 256)
    throw new Error(
      "Catalog derivative source inventory exceeds transaction bound.",
    )
  for (const row of rows) {
    receipt(row)
    const asset = assets.find((asset) => asset.id === row.assetId)
    if (
      !asset ||
      asset.storeId !== row.storeId ||
      asset.contentDigest !== row.sourceDigest ||
      asset.storageStoreId !== row.storageStoreId
    )
      throw new Error("Catalog derivative source ownership requires review.")
    if (row.dataClassification !== "LIVE" || row.provenance !== provenance)
      throw new Error("Catalog derivative ownership requires review.")
  }
  await tx.catalogPhotoDerivative.updateMany({
    where: { tenantId },
    data: {
      availableAt: new Date(Date.now() + 180_000),
      writeUntil: new Date(Date.now() + 180_000),
    },
  })
  return rows.length
}

/** Four claims/run, leased recovery, eight attempts then operator review.
 * A row cannot be removed until every bounded writer/grace has elapsed. */
export async function claimCatalogPhotoDerivativeCleanup(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id" FROM "CatalogPhotoDerivative" d
      LEFT JOIN "CatalogPhotoAsset" a ON a."id"=d."assetId" AND a."tenantId"=d."tenantId" AND a."storeId"=d."storeId"
      LEFT JOIN "Tenant" t ON t."id"=d."tenantId"
      LEFT JOIN "CatalogPhotoDeletionOutbox" o ON o."assetId"=d."assetId"
        AND o."tenantId"=d."tenantId" AND o."storeId"=d."storeId"
        AND o."contentDigest"=d."sourceDigest" AND o."storageStoreId"=d."storageStoreId"
        AND o."dataClassification"='LIVE' AND o."provenance"='catalog-tenant-inventory-v1' 
      WHERE d."dataClassification"='LIVE' AND d."provenance"=${provenance}
      AND d."availableAt"<=NOW() AND d."writeUntil"<=NOW() AND d."attempts"<8
      AND (d."leaseUntil" IS NULL OR d."leaseUntil"<=NOW())
      AND ((t."id" IS NULL AND a."id" IS NULL AND o."id" IS NOT NULL AND o."availableAt"<=NOW()) OR
        (t."dataClassification"='LIVE' AND t."qaPurgeStartedAt" IS NULL AND a."state"='REMOVED' AND a."expiresAt"<=NOW()))
      ORDER BY d."availableAt", d."id" LIMIT 1 FOR UPDATE OF d SKIP LOCKED
    `)
    if (!row) return null
    const leaseToken = randomUUID()
    const entry = await tx.catalogPhotoDerivative.update({
      where: { id: row.id },
      data: {
        leaseToken,
        leaseUntil: new Date(Date.now() + 60_000),
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + 300_000),
      },
    })
    let photo: CatalogPhotoDerivative
    try {
      photo = receipt(entry)
    } catch {
      // Commit the bounded attempt/backoff for malformed ownership. Rolling back
      // would repeatedly select the same row and starve valid cleanup receipts.
      return null
    }
    return {
      id: entry.id,
      leaseToken,
      photo,
      scope: {
        tenantId: entry.tenantId,
        storeId: entry.storeId,
        dataClassification: "LIVE" as const,
      },
    }
  }, options)
}

export async function finishCatalogPhotoDerivativeCleanup(
  db: PrismaClient,
  claim: { id: string; leaseToken: string },
) {
  return db.catalogPhotoDerivative.deleteMany({
    where: {
      id: claim.id,
      leaseToken: claim.leaseToken,
      leaseUntil: { gt: new Date() },
    },
  })
}
