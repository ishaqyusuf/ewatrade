import { loadCatalogPhotoDelivery } from "./photo-delivery"
import {
  CatalogPhotoError,
  getCatalogPublicPhotoTarget,
} from "@ewatrade/db/catalog-photos"
import { prisma } from "@ewatrade/db/client"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { catalogPhotoHttpError } from "./photo-http-errors"

export function registerCatalogPublicPhotoRoutes(app: OpenAPIHono) {
  app.get(
    "/api/catalog/public/stores/:storeId/photos/:assetId",
    async (context) => {
      context.header("Cache-Control", "no-store")
      try {
        const lookup = {
          assetId: context.req.param("assetId"),
          storeId: context.req.param("storeId"),
        }
        const variant = context.req.query("variant") ?? "display"
        if (
          !Object.values(lookup).every((value) =>
            /^[a-zA-Z0-9_-]{1,128}$/.test(value),
          ) ||
          (variant !== "display" && variant !== "thumbnail")
        )
          return context.json({ error: "Photo not found." }, 404)
        const target = await getCatalogPublicPhotoTarget(prisma, lookup)
        const processed = await loadCatalogPhotoDelivery(
          prisma,
          target,
          context.req.raw.signal,
        )
        const current = await getCatalogPublicPhotoTarget(prisma, lookup)
        if (
          processed.display.contentDigest !== target.displayDigest ||
          current.displayDigest !== target.displayDigest ||
          current.photo.contentDigest !== target.photo.contentDigest ||
          current.storageStoreId !== target.storageStoreId ||
          current.photo.storagePath !== target.photo.storagePath
        )
          throw new CatalogPhotoError("PHOTO_NOT_FOUND", "Photo not found.")
        const photo = processed[variant]
        const headers = {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=0, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          ETag: `"${photo.contentDigest}"`,
        }
        // Every 304 still passes the complete publication/verdict gates.
        if (context.req.header("If-None-Match") === headers.ETag)
          return new Response(null, { status: 304, headers })
        return new Response(Buffer.from(photo.bytes), {
          headers: { ...headers, "Content-Length": String(photo.sizeBytes) },
        })
      } catch (error) {
        return catalogPhotoHttpError(error)
      }
    },
  )
}
