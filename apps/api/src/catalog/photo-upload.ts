import { CatalogPhotoStorageError } from "@ewatrade/catalog/photo-contracts"
import {
  CatalogPhotoProcessingError,
  processCatalogPhoto,
} from "@ewatrade/catalog/photo-processing"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import {
  CatalogPhotoUploadError,
  uploadCatalogPhoto,
} from "@ewatrade/catalog/photo-upload"
import {
  CatalogPhotoError,
  getCatalogPhotoUploadTarget,
  recordVerifiedCatalogPhotoUpload,
} from "@ewatrade/db/catalog-photos"
import { QaProviderPolicyError } from "@ewatrade/utils/qa-provider-policy"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import { catalogPhotoMetadataSchema } from "../schemas/catalog-photos"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { catalogPhotoTRPCError } from "../trpc/routers/catalog-photos"
import { catalogPhotoActorScope } from "./photo-access"

export function registerCatalogPhotoUploadRoutes(app: OpenAPIHono) {
  app.put("/api/catalog/photos/:assetId/upload", async (context) => {
    context.header("Cache-Control", "private, no-store")
    try {
      const parsed = catalogPhotoMetadataSchema.safeParse({
        assetId: context.req.param("assetId"),
        storeId: context.req.query("storeId"),
      })
      if (!parsed.success)
        return context.json({ error: "Invalid photo upload details." }, 400)
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      const scope = catalogPhotoActorScope(ctx, parsed.data.storeId)
      const target = await getCatalogPhotoUploadTarget(ctx.db, {
        ...scope,
        assetId: parsed.data.assetId,
      })
      const result = await uploadCatalogPhoto({
        request: context.req.raw,
        target,
        storage: createVercelCatalogPhotoStorage(),
        validate: async (photo) => {
          await processCatalogPhoto(photo)
        },
        complete: (photo) =>
          recordVerifiedCatalogPhotoUpload(ctx.db, scope, photo),
      })
      return context.json(result, 200)
    } catch (error) {
      if (context.req.raw.body && !context.req.raw.body.locked) {
        void context.req.raw.body.cancel().catch(() => undefined)
      }
      if (error instanceof CatalogPhotoUploadError)
        return context.json({ error: error.message }, error.status)
      if (error instanceof QaProviderPolicyError)
        return context.json({ error: error.message }, 412)
      if (error instanceof CatalogPhotoProcessingError)
        return context.json(
          { error: error.message },
          error.code === "PHOTO_PROCESSING_BUSY" ? 429 : 400,
        )
      if (error instanceof CatalogPhotoStorageError)
        return context.json(
          { error: error.message },
          error.code === "INVALID_PHOTO" ? 400 : 503,
        )
      const authError =
        error instanceof CatalogPhotoError
          ? catalogPhotoTRPCError(error)
          : error
      if (authError instanceof TRPCError)
        return Response.json(
          { error: authError.message },
          {
            status: getHTTPStatusCodeFromError(authError),
            headers: { "Cache-Control": "private, no-store" },
          },
        )
      throw error
    }
  })
}
