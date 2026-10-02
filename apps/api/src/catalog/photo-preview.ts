import { loadCatalogPhotoDelivery } from "./photo-delivery"
import {
  CatalogPhotoError,
  getCatalogPhotoReadTarget,
} from "@ewatrade/db/catalog-photos"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { catalogPhotoMetadataSchema } from "../schemas/catalog-photos"
import { createTRPCContext, resolveProtectedTenantContext } from "../trpc/init"
import { catalogPhotoActorScope } from "./photo-access"
import { catalogPhotoHttpError } from "./photo-http-errors"

export function registerCatalogPhotoPreviewRoutes(app: OpenAPIHono) {
  app.get("/api/catalog/photos/:assetId/preview", async (context) => {
    context.header("Cache-Control", "private, no-store")
    try {
      const parsed = catalogPhotoMetadataSchema.safeParse({
        assetId: context.req.param("assetId"),
        storeId: context.req.query("storeId"),
      })
      const variant = context.req.query("variant") ?? "display"
      if (!parsed.success || (variant !== "display" && variant !== "thumbnail"))
        return context.json({ error: "Invalid photo preview." }, 400)
      const ctx = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      const scope = catalogPhotoActorScope(ctx, parsed.data.storeId)
      const lookup = { ...scope, assetId: parsed.data.assetId }
      const target = await getCatalogPhotoReadTarget(ctx.db, lookup)
      const processed = await loadCatalogPhotoDelivery(
        ctx.db,
        target,
        context.req.raw.signal,
      )
      // Revocation/removal during provider/decoder work must not release bytes.
      const freshContext = await resolveProtectedTenantContext(
        await createTRPCContext(undefined, context),
      )
      const freshScope = catalogPhotoActorScope(
        freshContext,
        parsed.data.storeId,
      )
      if (
        freshScope.actorUserId !== scope.actorUserId ||
        freshScope.tenantId !== scope.tenantId ||
        freshScope.storeId !== scope.storeId
      )
        throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
      const current = await getCatalogPhotoReadTarget(freshContext.db, {
        ...freshScope,
        assetId: parsed.data.assetId,
      })
      if (
        current.storageStoreId !== target.storageStoreId ||
        current.photo.contentDigest !== target.photo.contentDigest ||
        current.photo.storagePath !== target.photo.storagePath
      )
        throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
      const photo = processed[variant]
      return new Response(Buffer.from(photo.bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(photo.sizeBytes),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
          Vary: "Cookie, Authorization",
        },
      })
    } catch (error) {
      return catalogPhotoHttpError(error)
    }
  })
}
