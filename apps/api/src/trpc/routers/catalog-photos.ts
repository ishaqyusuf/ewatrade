import { CatalogPhotoStorageError } from "@ewatrade/catalog/photo-contracts"
import { CatalogPhotoProcessingError } from "@ewatrade/catalog/photo-processing"
import { CatalogPhotoUploadError } from "@ewatrade/catalog/photo-upload"
import { listCatalogPhotoGallery } from "@ewatrade/db/catalog-photo-gallery"
import { removeCatalogPhoto } from "@ewatrade/db/catalog-photo-lifecycle"
import { replaceCatalogItemPhotos } from "@ewatrade/db/catalog-photo-replacement"
import {
  CatalogPhotoError,
  createCatalogPhotoIntent,
  getCatalogPhotoMetadata,
} from "@ewatrade/db/catalog-photos"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import { TRPCError } from "@trpc/server"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import { reuseCatalogPhoto } from "../../catalog/photo-reuse"
import {
  catalogPhotoGallerySchema,
  catalogPhotoIntentSchema,
  catalogPhotoMetadataSchema,
  catalogPhotoReplacementSchema,
  catalogPhotoReuseSchema,
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
  /** My images: approved photos already on Items in Stores the actor manages. */
  gallery: protectedProcedure
    .input(catalogPhotoGallerySchema)
    .query(async ({ ctx, input }) => {
      const scope = catalogPhotoActorScope(ctx, input.storeId)
      const storeIds =
        input.scope === "all"
          ? (ctx.tenantContext?.stores ?? []).flatMap((store) => {
              try {
                return [catalogPhotoActorScope(ctx, store.id).storeId]
              } catch {
                return []
              }
            })
          : [scope.storeId]
      try {
        return await listCatalogPhotoGallery(ctx.db, {
          actorUserId: scope.actorUserId,
          tenantId: scope.tenantId,
          storeIds,
          target: {
            storeId: scope.storeId,
            catalogItemId: input.catalogItemId,
          },
          query: input.query,
        })
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
  /** Copies an approved My images photo into a new draft for this Store. */
  reuse: protectedProcedure
    .input(catalogPhotoReuseSchema)
    .mutation(async ({ ctx, input }) => {
      const target = catalogPhotoActorScope(ctx, input.storeId)
      const source = catalogPhotoActorScope(ctx, input.sourceStoreId)
      try {
        return await reuseCatalogPhoto(ctx.db, {
          target,
          source: { ...source, assetId: input.sourceAssetId },
          clientOperationId: input.clientOperationId,
        })
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        if (
          error instanceof CatalogPhotoStorageError ||
          error instanceof CatalogPhotoUploadError ||
          error instanceof CatalogPhotoProcessingError ||
          error instanceof QaProviderPolicyError
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        throw error
      }
    }),
})
