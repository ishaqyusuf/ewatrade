import type { Prisma } from "../../../generated/prisma/client"
import type { CatalogPhotoActorScope } from "../catalog-photos"

/** A draft choice is provisional until the same draft creates its variants. */
export async function attachGeneratedDraftChoices(
  tx: Prisma.TransactionClient,
  scope: CatalogPhotoActorScope & {
    catalogItemId: string
    contextKey: string
    assetIds: string[]
  },
) {
  const jobs = await tx.catalogAiImageJob.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.actorUserId,
      contextKey: scope.contextKey,
      catalogItemId: null,
      outputAssetId: { in: scope.assetIds },
      state: "DELIVERED",
    },
    select: { facts: true, outputAssetId: true },
  })
  const choices = jobs.flatMap((job) => {
    const choice = catalogAiJobFactsSchema.safeParse(job.facts).data?.choice
    return choice && job.outputAssetId
      ? [{ ...choice, assetId: job.outputAssetId }]
      : []
  })
  if (!choices.length) return
  const variants = await tx.sellableVariant.findMany({
    where: {
      catalogItemId: scope.catalogItemId,
      key: { in: choices.map((choice) => choice.id) },
      status: "ACTIVE",
    },
    select: { id: true, key: true, name: true },
  })
  for (const choice of choices) {
    const variant = variants.find(
      ({ key, name }) => key === choice.id && name === choice.name,
    )
    if (!variant) continue
    await tx.catalogPhotoAsset.update({
      where: {
        id: choice.assetId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        catalogItemId: scope.catalogItemId,
      },
      data: { optionVariantId: variant.id },
    })
  }
}

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
  const pending = await tx.catalogAiImageJob.findMany({
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
    select: { id: true, facts: true, outputAssetId: true },
  })
  const applied = pending.filter((job) => {
    // A sibling can finish between a state read and the photo save. It still
    // needs to appear in Images unless this command actually selected it.
    const choice = catalogAiJobFactsSchema.safeParse(job.facts).data?.choice
    return (
      !choice || (job.outputAssetId !== null && ids.includes(job.outputAssetId))
    )
  })
  if (!applied.length) return
  await tx.catalogAiImageJob.updateMany({
    where: { id: { in: applied.map((job) => job.id) }, appliedAt: null },
    data: { appliedAt: new Date() },
  })
}
import { catalogAiJobFactsSchema } from "@ewatrade/utils/catalog-ai-images"
