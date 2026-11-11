import { createHash } from "node:crypto"
import { CATALOG_PHOTO_CLEANUP_GRACE_MS } from "@ewatrade/catalog/photo-contracts"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import {
  type CatalogPhotoAsset,
  Prisma,
  type PrismaClient,
} from "../../generated/prisma/client"
import {
  catalogAiAttachableAssetIds,
  markCatalogAiAppliedInTransaction,
} from "./catalog-ai-images/lineage-attachment"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import {
  CATALOG_GALLERY_KEEP_UNTIL,
  type CatalogPhotoActorScope,
  CatalogPhotoError,
  authorizeCatalogPhotoScope,
} from "./catalog-photos"

/** Exact replacement is atomic and replayable. Other Stores' attachments are
 * preserved; a newly selected photo must be owned by this authenticated actor. */
export async function replaceCatalogItemPhotos(
  db: PrismaClient,
  input: CatalogPhotoReplacementInput,
) {
  return db.$transaction(
    (tx) => replaceCatalogItemPhotosInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export type CatalogPhotoReplacementInput = CatalogPhotoActorScope & {
  catalogItemId: string
  illustrationId?: string | null
  assetIds: string[]
  expectedAssetIds?: string[]
  optionVariantIds?: Array<string | null>
  expectedOptionVariantIds?: Array<string | null>
  expectedIllustrationId?: string | null
  clientOperationId: string
}
export async function replaceCatalogItemPhotosInTransaction(
  tx: Prisma.TransactionClient,
  input: CatalogPhotoReplacementInput,
) {
  const request = {
    ...input,
    assetIds: [...input.assetIds],
    optionVariantIds: input.optionVariantIds?.slice(),
    expectedAssetIds: input.expectedAssetIds?.slice(),
    expectedOptionVariantIds: input.expectedOptionVariantIds?.slice(),
  }
  if (
    (request.illustrationId != null &&
      (!findCatalogIllustration(request.illustrationId) ||
        request.assetIds.length > 0)) ||
    request.assetIds.length > 8 ||
    new Set(request.assetIds).size !== request.assetIds.length ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(request.catalogItemId) ||
    request.assetIds.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) ||
    (request.optionVariantIds !== undefined &&
      (request.optionVariantIds.length !== request.assetIds.length ||
        request.optionVariantIds.some(
          (id) => id !== null && !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
        ))) ||
    (request.expectedOptionVariantIds !== undefined &&
      request.expectedOptionVariantIds.length !==
        request.expectedAssetIds?.length) ||
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
        ...(request.expectedAssetIds === undefined
          ? []
          : [request.expectedAssetIds, request.expectedIllustrationId ?? null]),
        ...(request.optionVariantIds === undefined &&
        request.expectedOptionVariantIds === undefined
          ? []
          : [
              {
                optionVariantIds: request.optionVariantIds,
                expectedOptionVariantIds: request.expectedOptionVariantIds,
              },
            ]),
      ]),
    )
    .digest("hex")

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
      ...(request.optionVariantIds === undefined
        ? {}
        : { optionVariantIds: request.optionVariantIds }),
      illustrationId: request.illustrationId,
      replayed: true,
    }
  }
  const [item] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "CatalogItem" WHERE "id"=${request.catalogItemId}
        AND "tenantId"=${request.tenantId} AND "archivedAt" IS NULL
        AND "systemRole" IS NULL
        AND "status" <> 'ARCHIVED' FOR UPDATE
      `)
  if (!item)
    throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Catalog item not found.")
  const assets = await tx.$queryRaw<CatalogPhotoAsset[]>(Prisma.sql`
      SELECT * FROM "CatalogPhotoAsset" WHERE "tenantId"=${request.tenantId}
      AND ("catalogItemId"=${item.id} OR "id" IN (${Prisma.join(request.assetIds.length ? request.assetIds : ["__no_asset__"])}))
      ORDER BY "id" FOR UPDATE
    `)
  const selected = request.assetIds.map((id) =>
    assets.find((asset) => asset.id === id),
  )
  if (request.expectedAssetIds !== undefined) {
    const current = assets
      .filter(
        (asset) =>
          asset.catalogItemId === item.id &&
          asset.storeId === request.storeId &&
          ["PENDING_REVIEW", "APPROVED"].includes(asset.state),
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const illustration = await tx.catalogItemIllustration.findUnique({
      where: {
        tenantId_catalogItemId_storeId: {
          tenantId: request.tenantId,
          catalogItemId: item.id,
          storeId: request.storeId,
        },
      },
      select: { illustrationId: true },
    })
    if (
      JSON.stringify(current.map((asset) => asset.id)) !==
        JSON.stringify(request.expectedAssetIds) ||
      (request.expectedOptionVariantIds !== undefined &&
        JSON.stringify(current.map((asset) => asset.optionVariantId)) !==
          JSON.stringify(request.expectedOptionVariantIds)) ||
      (request.expectedIllustrationId !== undefined &&
        (illustration?.illustrationId ?? null) !==
          request.expectedIllustrationId)
    )
      throw new CatalogPhotoError(
        "PHOTO_COMMAND_CONFLICT",
        "These photos changed elsewhere. Reopen Images to see the latest, then try again.",
      )
  }
  const aiAttachable = await catalogAiAttachableAssetIds(
    tx,
    request,
    request.assetIds,
    item.id,
  )
  if (
    selected.some(
      (asset) =>
        !asset ||
        asset.storeId !== request.storeId ||
        (asset.catalogItemId !== item.id &&
          ((asset.actorUserId !== request.actorUserId &&
            !aiAttachable.has(asset.id)) ||
            asset.catalogItemId ||
            // My images uploads are copied onto Items, never moved.
            (asset.galleryAddedAt && !aiAttachable.has(asset.id)) ||
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
  // Legacy callers keep an existing assignment. New attachments are general
  // unless the editor explicitly supplies a variant.
  const optionVariantIds =
    request.optionVariantIds ??
    selected.map((asset) => asset?.optionVariantId ?? null)
  const changedVariants = [
    ...new Set(
      optionVariantIds.filter(
        (id, index): id is string =>
          id !== null && id !== selected[index]?.optionVariantId,
      ),
    ),
  ]
  if (changedVariants.length) {
    const variants = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SellableVariant"
      WHERE "catalogItemId"=${item.id}
        AND "id" IN (${Prisma.join(changedVariants)})
        AND "archivedAt" IS NULL AND "status" <> 'ARCHIVED'
      ORDER BY "id" FOR SHARE
    `)
    if (variants.length !== changedVariants.length)
      throw new CatalogPhotoError(
        "INVALID_PHOTO",
        "Choose a current option for this item.",
      )
  }
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
  const selectedVersions = await tx.catalogAiImageVersion.findMany({
    where: {
      tenantId: request.tenantId,
      OR: [
        { assetId: { in: request.assetIds } },
        { rootAssetId: { in: request.assetIds } },
      ],
      removedAt: null,
    },
    select: { rootAssetId: true },
  })
  const roots = selectedVersions.map((version) => version.rootAssetId)
  const history = roots.length
    ? await tx.catalogAiImageVersion.findMany({
        where: {
          tenantId: request.tenantId,
          rootAssetId: { in: roots },
          removedAt: null,
        },
        select: { assetId: true },
      })
    : []
  const retainedIds = [
    ...new Set([...roots, ...history.map((version) => version.assetId)]),
  ].filter((id) => !request.assetIds.includes(id))
  if (retainedIds.length)
    await tx.catalogPhotoAsset.updateMany({
      where: {
        tenantId: request.tenantId,
        catalogItemId: item.id,
        storeId: request.storeId,
        id: { in: retainedIds },
        state: "APPROVED",
      },
      data: {
        catalogItemId: null,
        optionVariantId: null,
        sortOrder: null,
        galleryAddedAt: new Date(),
        expiresAt: CATALOG_GALLERY_KEEP_UNTIL,
      },
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
      optionVariantId: null,
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
        optionVariantId: optionVariantIds[index],
        sortOrder: offset + index,
        attachedAt: new Date(),
        galleryAddedAt: null,
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
  await markCatalogAiAppliedInTransaction(
    tx,
    request,
    request.assetIds,
    item.id,
  )
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
    ...(request.optionVariantIds === undefined ? {} : { optionVariantIds }),
    illustrationId: request.illustrationId,
    replayed: false,
  }
}
