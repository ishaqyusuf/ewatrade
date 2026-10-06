import { randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  authorizeCatalogPhotoScope,
  getCatalogPhotoReadTarget,
} from "./catalog-photos"

const options = { maxWait: 10_000, timeout: 30_000 } as const
const leaseMs = 120_000
const maxAttempts = 8

/** Durable pending rows recover lost dispatches and expired/crashed leases. */
export async function listCatalogPhotoReviewCandidates(db: PrismaClient) {
  const storeId = process.env.BLOB_STORE_ID?.trim()
  if (!storeId) return []
  return db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a."id" FROM "CatalogPhotoAsset" a
    JOIN "Tenant" t ON t."id"=a."tenantId"
    JOIN "Store" s ON s."id"=a."storeId" AND s."tenantId"=a."tenantId"
    WHERE a."state"='PENDING_REVIEW' AND a."bytesDeletedAt" IS NULL
      AND a."uploadedAt" IS NOT NULL AND a."storagePath" IS NOT NULL
      AND a."storageProvider"='vercel_blob_private' AND a."storageStoreId"=${storeId}
      AND a."reviewAttempts"<${maxAttempts} AND a."reviewAvailableAt"<=NOW()
      AND (a."reviewLeaseUntil" IS NULL OR a."reviewLeaseUntil"<=NOW())
      AND (a."catalogItemId" IS NOT NULL OR a."expiresAt">NOW())
      AND t."isActive"=true AND t."dataClassification"='LIVE' AND t."qaPurgeStartedAt" IS NULL
      AND s."status"='ACTIVE'
      AND EXISTS (SELECT 1 FROM "Membership" m WHERE m."tenantId"=a."tenantId"
        AND m."userId"=a."actorUserId" AND m."status"='ACTIVE'
        AND m."role" IN ('OWNER','ADMIN','MANAGER'))
    ORDER BY a."reviewAvailableAt", a."id" LIMIT 4
  `)
}

/** Queue payload carries only an asset identity; authority comes from current DB
 * records. Claim commits before provider I/O. Never hold a DB lock over a call. */
export async function claimCatalogPhotoReview(
  db: PrismaClient,
  assetId: string,
) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(assetId)) return null
  const initial = await db.catalogPhotoAsset.findUnique({
    where: { id: assetId },
    select: { tenantId: true, storeId: true, actorUserId: true },
  })
  if (!initial) return null
  const leaseToken = randomUUID()
  const claimed = await db.$transaction(async (tx) => {
    const tenant = await authorizeCatalogPhotoScope(tx, initial)
    if (tenant.dataClassification !== "LIVE") return false
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "CatalogPhotoAsset" WHERE "id"=${assetId}
        AND "tenantId"=${initial.tenantId} AND "storeId"=${initial.storeId}
        AND "actorUserId"=${initial.actorUserId} AND "state"='PENDING_REVIEW'
        AND "bytesDeletedAt" IS NULL AND "uploadedAt" IS NOT NULL AND "storagePath" IS NOT NULL
        AND "storageProvider"='vercel_blob_private'
        AND "storageStoreId"=${process.env.BLOB_STORE_ID?.trim() || ""}
        AND "reviewAttempts"<${maxAttempts} AND "reviewAvailableAt"<=NOW()
        AND ("reviewLeaseUntil" IS NULL OR "reviewLeaseUntil"<=NOW())
        AND ("catalogItemId" IS NOT NULL OR "expiresAt">NOW()) FOR UPDATE SKIP LOCKED
    `)
    if (!rows.length) return false
    const deadline = new Date(Date.now() + leaseMs)
    await tx.catalogPhotoAsset.update({
      where: { id: assetId },
      data: {
        reviewLeaseToken: leaseToken,
        reviewLeaseUntil: deadline,
        reviewAvailableAt: deadline,
        reviewAttempts: { increment: 1 },
      },
    })
    return true
  }, options)
  if (!claimed) return null
  try {
    // Rechecks permissions, canonical private path and original Blob store pin.
    const target = await getCatalogPhotoReadTarget(db, { ...initial, assetId })
    return { ...target, actor: initial, leaseToken }
  } catch {
    await releaseCatalogPhotoReview(db, { assetId, leaseToken })
    throw new Error("Catalog image review target is unavailable.")
  }
}

export async function releaseCatalogPhotoReview(
  db: PrismaClient,
  input: { assetId: string; leaseToken: string },
) {
  const asset = await db.catalogPhotoAsset.findFirst({
    where: {
      id: input.assetId,
      state: "PENDING_REVIEW",
      reviewLeaseToken: input.leaseToken,
    },
    select: { reviewAttempts: true },
  })
  if (!asset) return
  const backoffMs = Math.min(
    15 * 60_000,
    60_000 * 2 ** Math.max(0, asset.reviewAttempts - 1),
  )
  await db.catalogPhotoAsset.updateMany({
    where: {
      id: input.assetId,
      state: "PENDING_REVIEW",
      reviewLeaseToken: input.leaseToken,
    },
    data: {
      reviewLeaseToken: null,
      reviewLeaseUntil: null,
      reviewAvailableAt: new Date(Date.now() + backoffMs),
    },
  })
}
