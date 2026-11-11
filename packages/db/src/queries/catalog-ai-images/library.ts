import {
  type CatalogStoredPhoto,
  catalogPhotoStoragePath,
} from "@ewatrade/catalog/photo-contracts"
import { catalogPhotoStorageIdentity } from "@ewatrade/catalog/photo-qa-policy"
import { catalogAiTokenUsageSchema } from "@ewatrade/utils/catalog-ai-images"
import { Prisma } from "../../../generated/prisma/client"
import type { DbClient } from "../types"
import { CatalogAiError } from "./policy"

// This is the private review surface for delivered output. Use the same
// retained asset and exact approved bytes as Catalog, including removal checks.
function retainedCatalogAiImages() {
  const { storeId } = catalogPhotoStorageIdentity("LIVE")
  return Prisma.sql`
    FROM "CatalogAiImageJob" j
    JOIN "CatalogAiImageVersion" v
      ON v."jobId" = j.id AND v."assetId" = j."outputAssetId"
      AND v."tenantId" = j."tenantId" AND v."storeId" = j."storeId"
    JOIN "CatalogPhotoAsset" a
      ON a.id = v."assetId" AND a."tenantId" = v."tenantId" AND a."storeId" = v."storeId"
    JOIN "Tenant" t ON t.id = a."tenantId"
    JOIN "Store" s ON s.id = a."storeId" AND s."tenantId" = a."tenantId"
    WHERE j.state = 'DELIVERED' AND j."deliveredAt" IS NOT NULL
      AND j.mode IN ('generate', 'refine') AND v."removedAt" IS NULL
      AND t."isActive" AND t."qaPurgeStartedAt" IS NULL
      AND t."dataClassification" = 'LIVE' AND s.status = 'ACTIVE'
      AND a.state = 'APPROVED' AND a."bytesDeletedAt" IS NULL
      AND a."uploadedAt" IS NOT NULL AND a."storagePath" IS NOT NULL
      AND a."reviewDisplayDigest" IS NOT NULL
      AND a."contentType" = 'image/webp'
      AND a."storageProvider" = 'vercel_blob_private' AND a."storageStoreId" = ${storeId}
      AND (a."catalogItemId" IS NOT NULL OR a."expiresAt" > NOW())
  `
}

export async function readCatalogAiLibrary(db: DbClient, cursor?: string) {
  const pageSize = 24
  const rows = await db.$queryRaw<
    Array<{
      id: string
      mode: "generate" | "refine"
      model: string
      deliveredAt: Date
      usage: unknown
      estimatedCostMicros: number | null
    }>
  >`
    SELECT j.id, j.mode, j.model, j."deliveredAt", j.usage,
      j."costMicros" AS "estimatedCostMicros"
    ${retainedCatalogAiImages()}
    ${
      cursor
        ? Prisma.sql`
      AND (j."deliveredAt", j.id) < (
        SELECT "deliveredAt", id FROM "CatalogAiImageJob" WHERE id = ${cursor}
      )
    `
        : Prisma.empty
    }
    ORDER BY j."deliveredAt" DESC, j.id DESC
    LIMIT ${pageSize + 1}
  `
  const items = rows.slice(0, pageSize).map(({ usage, ...row }) => {
    const parsed = catalogAiTokenUsageSchema.safeParse(usage)
    return { ...row, usage: parsed.success ? parsed.data : null }
  })
  return {
    items,
    nextCursor: rows.length > pageSize ? (items.at(-1)?.id ?? null) : null,
  }
}

export async function readCatalogAiLibraryImageTarget(
  db: DbClient,
  requestId: string,
) {
  const [row] = await db.$queryRaw<
    Array<{
      assetId: string
      tenantId: string
      storeId: string
      storagePath: string
      storageStoreId: string
      contentDigest: string
      sizeBytes: number
      reviewDisplayDigest: string
    }>
  >`
    SELECT a.id AS "assetId", a."tenantId", a."storeId", a."storagePath",
      a."storageStoreId", a."contentDigest", a."sizeBytes", a."reviewDisplayDigest"
    ${retainedCatalogAiImages()} AND j.id = ${requestId}
  `
  if (!row) throw new CatalogAiError("NOT_FOUND", "Image unavailable.")
  const { storageStoreId, reviewDisplayDigest, ...stored } = row
  const photo: CatalogStoredPhoto = {
    ...stored,
    storageProvider: "vercel_blob_private",
    contentType: "image/webp",
  }
  if (photo.storagePath !== catalogPhotoStoragePath(photo))
    throw new CatalogAiError("NOT_FOUND", "Image unavailable.")
  return {
    photo,
    storageStoreId,
    reviewDisplayDigest,
    scope: {
      tenantId: photo.tenantId,
      storeId: photo.storeId,
      dataClassification: "LIVE" as const,
    },
  }
}
