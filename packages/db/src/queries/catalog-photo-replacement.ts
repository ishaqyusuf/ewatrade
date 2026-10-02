import { createHash } from "node:crypto"
import { CATALOG_PHOTO_CLEANUP_GRACE_MS } from "@ewatrade/catalog/photo-contracts"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import {
  type CatalogPhotoAsset,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import {
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

/** Exact replacement is atomic and replayable. Other Stores' attachments are
 * preserved; a newly selected photo must be owned by this authenticated actor. */
export async function replaceCatalogItemPhotos(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    catalogItemId: string
    illustrationId?: string | null
    assetIds: string[]
    clientOperationId: string
  },
) {
  const request = { ...input, assetIds: [...input.assetIds] }
  if (
    (request.illustrationId != null &&
      (!findCatalogIllustration(request.illustrationId) ||
        request.assetIds.length > 0)) ||
    request.assetIds.length > 8 ||
    new Set(request.assetIds).size !== request.assetIds.length ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(request.catalogItemId) ||
    request.assetIds.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
    request.clientOperationId.length < 8 ||
    request.clientOperationId.length > 160
  )
    throw new CatalogPhotoError(
      "INVALID_PHOTO",
      "Choose up to eight distinct photos.",
    )
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        request.actorUserId,
        request.storeId,
        request.catalogItemId,
        request.assetIds,
        ...(request.illustrationId === undefined
          ? []
          : [request.illustrationId]),
      ]),
    )
    .digest("hex")
  return db.$transaction(
    async (tx) => {
      await authorizeCatalogPhotoScope(tx, request)
      await lockCatalogCommandInTransaction(tx, request)
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog-photo-replace:${request.tenantId}:${request.catalogItemId}`},0))`,
      )
      const previous = await tx.catalogCommandReceipt.findUnique({
        where: {
          tenantId_clientOperationId: {
            tenantId: request.tenantId,
            clientOperationId: request.clientOperationId,
          },
        },
      })
      if (previous) {
        if (
          previous.commandType !== "REPLACE_PHOTOS" ||
          previous.payloadHash !== hash
        )
          throw new CatalogPhotoError(
            "PHOTO_COMMAND_CONFLICT",
            "This photo command was already used for another item or selection.",
          )
        return {
          assetIds: request.assetIds,
          illustrationId: request.illustrationId,
          replayed: true,
        }
      }
      const [item] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "CatalogItem" WHERE "id"=${request.catalogItemId}
        AND "tenantId"=${request.tenantId} AND "archivedAt" IS NULL
        AND "status" <> 'ARCHIVED' FOR UPDATE
      `)
      if (!item)
        throw new CatalogPhotoError(
          "PHOTO_NOT_FOUND",
          "Catalog item not found.",
        )
      const assets = await tx.$queryRaw<CatalogPhotoAsset[]>(Prisma.sql`
      SELECT * FROM "CatalogPhotoAsset" WHERE "tenantId"=${request.tenantId}
      AND ("catalogItemId"=${item.id} OR "id" IN (${Prisma.join(request.assetIds.length ? request.assetIds : ["__no_asset__"])}))
      ORDER BY "id" FOR UPDATE
    `)
      const selected = request.assetIds.map((id) =>
        assets.find((asset) => asset.id === id),
      )
      if (
        selected.some(
          (asset) =>
            !asset ||
            asset.storeId !== request.storeId ||
            (asset.catalogItemId !== item.id &&
              (asset.actorUserId !== request.actorUserId ||
                asset.catalogItemId ||
                asset.expiresAt <= new Date())) ||
            !asset.storagePath ||
            !asset.uploadedAt ||
            !["PENDING_REVIEW", "APPROVED"].includes(asset.state),
        )
      )
        throw new CatalogPhotoError(
          "PHOTO_NOT_READY",
          "One or more selected photos are unavailable in this Store.",
        )
      const otherStores = assets.filter(
        (asset) =>
          asset.catalogItemId === item.id && asset.storeId !== request.storeId,
      )
      if (otherStores.length + selected.length > 8)
        throw new CatalogPhotoError(
          "PHOTO_LIMIT_REACHED",
          "This item can have up to eight photos across its Stores.",
        )
      await tx.catalogPhotoAsset.updateMany({
        where: {
          tenantId: request.tenantId,
          catalogItemId: item.id,
          storeId: request.storeId,
        },
        data: { sortOrder: null },
      })
      await tx.catalogPhotoAsset.updateMany({
        where: {
          tenantId: request.tenantId,
          catalogItemId: item.id,
          storeId: request.storeId,
          id: { notIn: request.assetIds },
        },
        data: {
          catalogItemId: null,
          state: "REMOVED",
          approvedAt: null,
          expiresAt: new Date(Date.now() + CATALOG_PHOTO_CLEANUP_GRACE_MS),
        },
      })
      const offset = otherStores.reduce(
        (maximum, asset) => Math.max(maximum, (asset.sortOrder ?? -1) + 1),
        0,
      )
      for (const [index, id] of request.assetIds.entries())
        await tx.catalogPhotoAsset.update({
          where: { id },
          data: {
            catalogItemId: item.id,
            sortOrder: offset + index,
            attachedAt: new Date(),
          },
        })
      // Older empty photo-only commands preserve curated identity. Explicit null
      // clears it; selected photos or an illustration replace this Store only.
      if (request.illustrationId !== undefined || request.assetIds.length) {
        await tx.catalogItemIllustration.deleteMany({
          where: {
            tenantId: request.tenantId,
            storeId: request.storeId,
            catalogItemId: item.id,
          },
        })
        if (request.illustrationId)
          await tx.catalogItemIllustration.create({
            data: {
              tenantId: request.tenantId,
              storeId: request.storeId,
              catalogItemId: item.id,
              illustrationId: request.illustrationId,
            },
          })
      }
      await tx.catalogCommandReceipt.create({
        data: {
          tenantId: request.tenantId,
          storeId: request.storeId,
          catalogItemId: item.id,
          clientOperationId: request.clientOperationId,
          payloadHash: hash,
          commandType: "REPLACE_PHOTOS",
        },
      })
      return {
        assetIds: request.assetIds,
        illustrationId: request.illustrationId,
        replayed: false,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
