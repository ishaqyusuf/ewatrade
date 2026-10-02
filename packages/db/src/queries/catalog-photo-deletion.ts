import { inventoryCatalogDerivativesBeforeTenantDeletion } from "./catalog-photo-derivatives"
import { randomUUID } from "node:crypto"
import {
  CATALOG_PHOTO_CLEANUP_GRACE_MS,
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"

const options = { maxWait: 10_000, timeout: 30_000 } as const
const provenance = "catalog-tenant-inventory-v1"

/** Internal integration boundary, NOT deletion authority. The approved domain
 * processor must call this in its own transaction BEFORE deleting photo metadata
 * and Tenant, and must independently satisfy all retention/legal gates. No API
 * exposes this function. Larger inventories block rather than silently truncate. */
export async function inventoryCatalogPhotosBeforeTenantDeletion(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  const [tenant] = await tx.$queryRaw<
    Array<{ dataClassification: string }>
  >(Prisma.sql`
    SELECT "dataClassification" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE
  `)
  if (!tenant || tenant.dataClassification !== "LIVE")
    throw new Error("Live Catalog deletion inventory unavailable.")
  const assets = await tx.catalogPhotoAsset.findMany({
    where: { tenantId, bytesDeletedAt: null },
    orderBy: { id: "asc" },
    take: 257,
  })
  if (assets.length > 256)
    throw new Error("Catalog deletion inventory exceeds transaction bound.")
  for (const asset of assets) {
    const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
      (type) => type === asset.contentType,
    )
    if (
      !contentType ||
      asset.storageProvider !== "vercel_blob_private" ||
      !asset.storageStoreId ||
      !/^store_[a-zA-Z0-9]+$/.test(asset.storageStoreId ?? "") ||
      asset.sizeBytes < 1 ||
      asset.sizeBytes > CATALOG_PHOTO_MAX_BYTES
    )
      throw new Error("Catalog storage ownership requires review.")
    const storagePath = catalogPhotoStoragePath({
      ...asset,
      assetId: asset.id,
      contentType,
    })
    if (asset.storagePath !== null && asset.storagePath !== storagePath)
      throw new Error("Catalog storage ownership requires review.")
    // UPLOADING can already have provider bytes without a completed receipt.
    const identity = {
      assetId: asset.id,
      tenantId,
      storeId: asset.storeId,
      contentDigest: asset.contentDigest,
      contentType,
      sizeBytes: asset.sizeBytes,
      storageProvider: asset.storageProvider,
      storageStoreId: asset.storageStoreId,
      storagePath,
      dataClassification: "LIVE",
      provenance,
    }
    const previous = await tx.catalogPhotoDeletionOutbox.findUnique({
      where: { assetId: asset.id },
    })
    if (previous) {
      if (
        previous.completedAt ||
        Object.entries(identity).some(
          ([key, value]) => previous[key as keyof typeof previous] !== value,
        )
      )
        throw new Error("Catalog deletion inventory changed.")
      // Extend grace for replayed/aborted preparation; a writer may still be in flight.
      await tx.catalogPhotoDeletionOutbox.update({
        where: { id: previous.id },
        data: {
          availableAt: new Date(Date.now() + CATALOG_PHOTO_CLEANUP_GRACE_MS),
        },
      })
    } else
      await tx.catalogPhotoDeletionOutbox.create({
        data: {
          ...identity,
          availableAt: new Date(Date.now() + CATALOG_PHOTO_CLEANUP_GRACE_MS),
        },
      })
  }
  const derivatives = await inventoryCatalogDerivativesBeforeTenantDeletion(
    tx,
    tenantId,
  )
  return { inventoried: assets.length, derivatives }
}

/** Deleted-Tenant rows only; lease expiry recovers crashes, capped retries pause
 * for operator review. QA and surviving Tenant preparations never reach Blob. */
export async function claimDeletedTenantCatalogPhoto(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT o."id" FROM "CatalogPhotoDeletionOutbox" o
      WHERE o."completedAt" IS NULL AND o."dataClassification"='LIVE'
      AND o."provenance"=${provenance} AND o."availableAt" <= NOW()
      AND (o."leaseUntil" IS NULL OR o."leaseUntil" <= NOW()) AND o."attempts" < 8
      AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id"=o."tenantId")
      AND NOT EXISTS (SELECT 1 FROM "CatalogPhotoAsset" a WHERE a."id"=o."assetId")
      AND NOT EXISTS (SELECT 1 FROM "CatalogPhotoDerivative" d WHERE d."assetId"=o."assetId" AND d."tenantId"=o."tenantId")
      ORDER BY o."availableAt", o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED
    `)
    if (!row) return null
    const leaseToken = randomUUID()
    const entry = await tx.catalogPhotoDeletionOutbox.update({
      where: { id: row.id },
      data: {
        leaseToken,
        leaseUntil: new Date(Date.now() + 60_000),
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + 300_000),
      },
    })
    const contentType = CATALOG_PHOTO_CONTENT_TYPES.find(
      (type) => type === entry.contentType,
    )
    if (
      !contentType ||
      entry.storageProvider !== "vercel_blob_private" ||
      !entry.storageStoreId ||
      !/^store_[a-zA-Z0-9]+$/.test(entry.storageStoreId) ||
      entry.sizeBytes < 1 ||
      entry.sizeBytes > CATALOG_PHOTO_MAX_BYTES
    )
      return null
    const photo: CatalogStoredPhoto = {
      ...entry,
      assetId: entry.assetId,
      contentType,
      storageProvider: "vercel_blob_private",
    }
    try {
      if (photo.storagePath !== catalogPhotoStoragePath(photo)) return null
    } catch {
      return null
    }
    return {
      id: entry.id,
      leaseToken,
      storageStoreId: entry.storageStoreId,
      photo,
      scope: {
        tenantId: entry.tenantId,
        storeId: entry.storeId,
        dataClassification: "LIVE" as const,
      },
    }
  }, options)
}

export async function finishDeletedTenantCatalogPhoto(
  db: PrismaClient,
  claim: { id: string; leaseToken: string },
) {
  // Successful rows need no personal ownership/path retention. Delete the exact
  // leased receipt; retries after uncertain provider success repeat idempotent del.
  const result = await db.catalogPhotoDeletionOutbox.deleteMany({
    where: {
      id: claim.id,
      leaseToken: claim.leaseToken,
      leaseUntil: { gt: new Date() },
    },
  })
  return result.count === 1
}
