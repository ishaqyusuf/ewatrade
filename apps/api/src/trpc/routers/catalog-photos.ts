import { removeCatalogPhoto } from "@ewatrade/db/catalog-photo-lifecycle"
import { replaceCatalogItemPhotos } from "@ewatrade/db/catalog-photo-replacement"
import {
  CatalogPhotoError,
  createCatalogPhotoIntent,
  getCatalogPhotoMetadata,
} from "@ewatrade/db/catalog-photos"
import { TRPCError } from "@trpc/server"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import {
  catalogPhotoIntentSchema,
  catalogPhotoMetadataSchema,
  catalogPhotoReplacementSchema,
} from "../../schemas/catalog-photos"
import { createTRPCRouter, protectedProcedure } from "../init"

export function catalogPhotoTRPCError(error: CatalogPhotoError) {
  const codes = {
    INVALID_PHOTO: "BAD_REQUEST",
    PHOTO_NOT_FOUND: "NOT_FOUND",
    PHOTO_ACCESS_DENIED: "FORBIDDEN",
    PHOTO_COMMAND_CONFLICT: "CONFLICT",
    PHOTO_NOT_READY: "PRECONDITION_FAILED",
    PHOTO_LIMIT_REACHED: "TOO_MANY_REQUESTS",
  } as const
  return new TRPCError({ code: codes[error.code], message: error.message })
}

// Metadata only: no Blob token, provider URL, client safety verdict or byte commit.
export const catalogPhotosRouter = createTRPCRouter({
  replace: protectedProcedure
    .input(catalogPhotoReplacementSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await replaceCatalogItemPhotos(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        })
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
  remove: protectedProcedure
    .input(catalogPhotoMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      const scope = catalogPhotoActorScope(ctx, input.storeId)
      try {
        const removed = await removeCatalogPhoto(ctx.db, {
          ...scope,
          assetId: input.assetId,
        })
        return {
          assetId: removed.photo.assetId,
          state: "REMOVED" as const,
          cleanupPending: !removed.alreadyDeleted,
        }
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
  createIntent: protectedProcedure
    .input(catalogPhotoIntentSchema)
    .mutation(async ({ ctx, input }) => {
      const scope = catalogPhotoActorScope(ctx, input.storeId)
      try {
        return await createCatalogPhotoIntent(ctx.db, { ...input, ...scope })
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
  getMetadata: protectedProcedure
    .input(catalogPhotoMetadataSchema)
    .query(async ({ ctx, input }) => {
      const scope = catalogPhotoActorScope(ctx, input.storeId)
      try {
        return await getCatalogPhotoMetadata(ctx.db, {
          assetId: input.assetId,
          ...scope,
        })
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
})
