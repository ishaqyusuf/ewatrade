import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { lockCatalogCommandInTransaction } from "../catalog-command-locks"
import { replaceCatalogItemPhotosInTransaction } from "../catalog-photo-replacement"
import {
  type CatalogPhotoActorScope,
  authorizeCatalogPhotoScope,
  getCatalogPhotoReadTarget,
} from "../catalog-photos"
import { runInOwnTransaction } from "../own-transaction"
import { CatalogAiError, lockCatalogAiPolicy } from "./policy"

export async function readCatalogAiVersions(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetId: string },
) {
  await getCatalogPhotoReadTarget(db, input)
  const selected = await db.catalogAiImageVersion.findFirst({
    where: {
      assetId: input.assetId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      removedAt: null,
    },
  })
  const rootAssetId = selected?.rootAssetId ?? input.assetId
  const versions = await db.catalogAiImageVersion.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      rootAssetId,
      removedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  })
  const ids = [rootAssetId, ...versions.map((version) => version.assetId)]
  const visible = await db.catalogPhotoAsset.findMany({
    where: {
      id: { in: ids },
      tenantId: input.tenantId,
      storeId: input.storeId,
      state: "APPROVED",
      bytesDeletedAt: null,
      OR: [
        { actorUserId: input.actorUserId },
        { catalogItemId: { not: null } },
        { galleryAddedAt: { not: null } },
      ],
    },
    select: { id: true, createdAt: true },
  })
  const root = visible.find((asset) => asset.id === rootAssetId)
  return {
    rootAssetId,
    versions: [
      ...(root
        ? [
            {
              assetId: root.id,
              sourceAssetId: null,
              label: versions.find((v) => v.assetId === root.id)
                ? "Generated"
                : "Original",
              createdAt: root.createdAt,
            },
          ]
        : []),
      ...versions
        .filter(
          (v) =>
            v.assetId !== rootAssetId &&
            visible.some((asset) => asset.id === v.assetId),
        )
        .map((version, index) => ({
          assetId: version.assetId,
          sourceAssetId: version.sourceAssetId,
          label: `Refinement ${index + 1}`,
          createdAt: version.createdAt,
        })),
    ],
  }
}
export async function deleteCatalogAiRefinement(
  db: PrismaClient,
  input: CatalogPhotoActorScope & {
    assetId: string
    clientOperationId: string
    expectedVersionAssetIds: string[]
  },
) {
  // The ordinary private read boundary protects unattached source identities too.
  await getCatalogPhotoReadTarget(db, input)
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    await authorizeCatalogPhotoScope(tx, input)
    const version = await tx.catalogAiImageVersion.findFirst({
      where: {
        assetId: input.assetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    })
    if (!version || !version.sourceAssetId)
      throw new CatalogAiError(
        "BAD_REQUEST",
        "The original cannot be deleted as a refinement.",
      )
    const history = await tx.catalogAiImageVersion.findMany({
      where: {
        rootAssetId: version.rootAssetId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        removedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    })
    if (version.removedAt)
      return {
        rootAssetId: version.rootAssetId,
        removedAssetIds: [input.assetId],
        assetIds: null,
      }
    const remove = new Set([input.assetId])
    for (const entry of history)
      if (entry.sourceAssetId && remove.has(entry.sourceAssetId))
        remove.add(entry.assetId)
    const expected = [...input.expectedVersionAssetIds].sort()
    const actual = [...remove].sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new CatalogAiError(
        "CONFLICT",
        "Refinements changed. Review their current history before deleting.",
      )
    const pending = await tx.catalogAiImageJob.count({
      where: {
        tenantId: input.tenantId,
        rootAssetId: version.rootAssetId,
        state: { in: ["QUEUED", "DISPATCHING", "UNCERTAIN", "PENDING_REVIEW"] },
      },
    })
    if (pending)
      throw new CatalogAiError(
        "CONFLICT",
        "Wait for this image request to finish before deleting a refinement.",
      )
    const attached = await tx.catalogPhotoAsset.findFirst({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        id: { in: actual },
        catalogItemId: { not: null },
      },
      select: { catalogItemId: true },
    })
    let assetIds: string[] | null = null
    if (attached?.catalogItemId) {
      const catalogItemId = attached.catalogItemId
      await lockCatalogCommandInTransaction(tx, input)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog-photo-replace:${input.tenantId}:${catalogItemId}`},0))`
      const current = await tx.catalogPhotoAsset.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          catalogItemId,
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      })
      assetIds = [
        ...new Set(
          current.map((asset) =>
            remove.has(asset.id) ? version.rootAssetId : asset.id,
          ),
        ),
      ]
      // Reuse the canonical image command in the same transaction; no alternate
      // attachment writer or provider deletion can race restoration.
      await replaceCatalogItemPhotosInTransaction(tx, {
        ...input,
        catalogItemId,
        assetIds,
        expectedAssetIds: current.map((asset) => asset.id),
        clientOperationId: input.clientOperationId,
      })
    }
    await tx.catalogAiImageVersion.updateMany({
      where: {
        tenantId: input.tenantId,
        assetId: { in: actual },
        removedAt: null,
      },
      data: { removedAt: new Date() },
    })
    await tx.catalogPhotoAsset.updateMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        id: { in: actual },
        catalogItemId: null,
      },
      data: {
        state: "REMOVED",
        approvedAt: null,
        galleryAddedAt: null,
        expiresAt: new Date(Date.now() + 180_000),
      },
    })
    return {
      rootAssetId: version.rootAssetId,
      removedAssetIds: actual,
      assetIds,
    }
  })
}

export async function readCatalogAiSources(
  db: PrismaClient,
  input: CatalogPhotoActorScope & { assetIds: string[] },
) {
  return runInOwnTransaction(db, async (tx) => {
    await authorizeCatalogPhotoScope(tx, input)
    return tx.catalogPhotoAsset.findMany({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        id: { in: input.assetIds },
        bytesDeletedAt: null,
        OR: [
          { actorUserId: input.actorUserId },
          { catalogItemId: { not: null } },
          { galleryAddedAt: { not: null }, state: "APPROVED" },
        ],
      },
      select: { id: true, state: true },
    })
  })
}
