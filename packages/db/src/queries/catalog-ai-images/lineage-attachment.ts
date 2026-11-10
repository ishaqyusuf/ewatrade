import type { Prisma } from "../../../generated/prisma/client"
import type { CatalogPhotoActorScope } from "../catalog-photos"

/** Only a delivered AI result/proven ancestor in this actor's context can move
 * out of its private recovery gallery. Ordinary My images still requires copy. */
export async function catalogAiAttachableAssetIds(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
  ids: string[],
  catalogItemId?: string,
) {
  if (!ids.length) return new Set<string>()
  const jobs = await tx.catalogAiImageJob.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.actorUserId,
      state: "DELIVERED",
      AND: [
        {
          OR: [
            { catalogItemId: null },
            ...(catalogItemId ? [{ catalogItemId }] : []),
          ],
        },
        {
          OR: [
            { outputAssetId: { in: ids } },
            { rootAssetId: { in: ids } },
            { sourceAssetId: { in: ids } },
          ],
        },
      ],
    },
    select: { outputAssetId: true, rootAssetId: true, sourceAssetId: true },
  })
  return new Set(
    jobs.flatMap((job) =>
      [job.outputAssetId, job.rootAssetId, job.sourceAssetId].filter(
        (id): id is string => !!id && ids.includes(id),
      ),
    ),
  )
}

export async function markCatalogAiAppliedInTransaction(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope,
  ids: string[],
  catalogItemId: string,
) {
  const selected = ids.length
    ? await tx.catalogAiImageJob.findMany({
        where: {
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          actorUserId: scope.actorUserId,
          outputAssetId: { in: ids },
          state: "DELIVERED",
        },
        select: { contextKey: true },
      })
    : []
  await tx.catalogAiImageJob.updateMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.actorUserId,
      contextKey: {
        in: [catalogItemId, ...selected.map((job) => job.contextKey)],
      },
      state: "DELIVERED",
      appliedAt: null,
    },
    data: { appliedAt: new Date() },
  })
}
