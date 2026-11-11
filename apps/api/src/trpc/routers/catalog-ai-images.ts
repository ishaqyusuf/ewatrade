import { isCatalogAiProviderConfigured } from "@ewatrade/catalog/image-generation-openai"
import { isCatalogPhotoReviewConfigured } from "@ewatrade/catalog/photo-review-openai"
import {
  CatalogAiError,
  cancelCatalogAiImages,
  deleteCatalogAiRefinement,
  readCatalogAiImages,
  readCatalogAiSources,
  readCatalogAiVersions,
  startCatalogAiImage,
  startCatalogAiImageBatch,
} from "@ewatrade/db/catalog-ai-images"
import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import { enqueueCatalogAiImage } from "@ewatrade/jobs/catalog-ai-images"
import { TRPCError } from "@trpc/server"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import {
  catalogAiCancelSchema,
  catalogAiContextSchema,
  catalogAiDeleteVersionSchema,
  catalogAiStartBatchSchema,
  catalogAiStartSchema,
  catalogAiVersionsSchema,
} from "../../schemas/catalog-ai-images"
import { createTRPCRouter, protectedProcedure } from "../init"
import { catalogPhotoTRPCError } from "./catalog-photos"
async function command<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CatalogPhotoError) throw catalogPhotoTRPCError(error)
    if (error instanceof CatalogAiError) {
      const code = {
        BAD_REQUEST: "BAD_REQUEST",
        FORBIDDEN: "FORBIDDEN",
        CONFLICT: "CONFLICT",
        UNAVAILABLE: "PRECONDITION_FAILED",
        LIMIT: "TOO_MANY_REQUESTS",
        NOT_FOUND: "NOT_FOUND",
      } as const
      throw new TRPCError({ code: code[error.code], message: error.message })
    }
    throw error
  }
}
function configured() {
  return (
    isCatalogAiProviderConfigured() &&
    isCatalogPhotoReviewConfigured() &&
    !!process.env.BLOB_STORE_ID?.trim()
  )
}
export const catalogAiImagesRouter = createTRPCRouter({
  state: protectedProcedure
    .input(catalogAiContextSchema)
    .query(({ ctx, input }) =>
      command(async () => ({
        ...(await readCatalogAiImages(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        })),
        configured: configured(),
      })),
    ),
  start: protectedProcedure
    .input(catalogAiStartSchema)
    .mutation(({ ctx, input }) =>
      command(async () => {
        const scope = catalogPhotoActorScope(ctx, input.storeId)
        if (!configured())
          throw new CatalogAiError(
            "UNAVAILABLE",
            "AI image generation is not configured yet.",
          )
        const job = await startCatalogAiImage(ctx.db, { ...input, ...scope })
        if (job.state === "QUEUED")
          await enqueueCatalogAiImage(job.id).catch(() => undefined)
        return job
      }),
    ),
  startBatch: protectedProcedure
    .input(catalogAiStartBatchSchema)
    .mutation(({ ctx, input }) =>
      command(async () => {
        const scope = catalogPhotoActorScope(ctx, input.storeId)
        if (!configured())
          throw new CatalogAiError(
            "UNAVAILABLE",
            "AI image generation is not configured yet.",
          )
        const jobs = await startCatalogAiImageBatch(ctx.db, {
          ...input,
          ...scope,
        })
        const next = jobs.find((job) => job.state === "QUEUED")
        if (next) await enqueueCatalogAiImage(next.id).catch(() => undefined)
        return jobs
      }),
    ),
  cancel: protectedProcedure
    .input(catalogAiCancelSchema)
    .mutation(({ ctx, input }) =>
      command(() =>
        cancelCatalogAiImages(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        }),
      ),
    ),
  sources: protectedProcedure
    .input(
      catalogAiVersionsSchema.omit({ assetId: true }).extend({
        assetIds:
          catalogAiDeleteVersionSchema.shape.expectedVersionAssetIds.max(8),
      }),
    )
    .query(({ ctx, input }) =>
      command(() =>
        readCatalogAiSources(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        }),
      ),
    ),
  versions: protectedProcedure
    .input(catalogAiVersionsSchema)
    .query(({ ctx, input }) =>
      command(() =>
        readCatalogAiVersions(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        }),
      ),
    ),
  deleteRefinement: protectedProcedure
    .input(catalogAiDeleteVersionSchema)
    .mutation(({ ctx, input }) =>
      command(() =>
        deleteCatalogAiRefinement(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        }),
      ),
    ),
})
