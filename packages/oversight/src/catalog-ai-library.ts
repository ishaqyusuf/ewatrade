import { createVercelCatalogPhotoDerivativeStorage } from "@ewatrade/catalog/photo-derivatives"
import {
  CATALOG_PHOTO_PROCESSING_VERSION,
  processCatalogPhoto,
} from "@ewatrade/catalog/photo-processing"
import { createCatalogPhotoStorageForScope } from "@ewatrade/catalog/photo-storage"
import type { PrismaClient } from "@ewatrade/db"
import {
  CatalogAiError,
  readCatalogAiLibrary,
  readCatalogAiLibraryImageTarget,
} from "@ewatrade/db/catalog-ai-images"
import { readCatalogPhotoDerivativeReceipts } from "@ewatrade/db/catalog-photo-derivatives"
import { Hono } from "hono"
import { z } from "zod"
import { validOversightKey } from "./verify-key"

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const query = z.object({ cursor: id.optional() }).strict()
const variant = z.enum(["thumbnail", "display"]).default("thumbnail")

export function createCatalogAiLibraryRoutes(getDb: () => PrismaClient) {
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store")
    const key = process.env.OVERSIGHT_WRITE_KEY
    if (
      key === process.env.OVERSIGHT_READ_KEY ||
      !validOversightKey(
        c.req.header("Authorization")?.replace(/^Bearer /, ""),
        key,
      )
    )
      return c.json({ error: "Unauthorized" }, 401)
    await next()
  })
  app.get("/", async (c) => {
    const parsed = query.safeParse(c.req.query())
    if (!parsed.success)
      return c.json({ error: "Invalid library cursor." }, 400)
    return c.json(await readCatalogAiLibrary(getDb(), parsed.data.cursor))
  })
  app.get("/:id/image", async (c) => {
    const requestId = id.safeParse(c.req.param("id"))
    const size = variant.safeParse(c.req.query("size"))
    if (!requestId.success || !size.success)
      return c.json({ error: "Invalid image selection." }, 400)
    const bytes = await loadLibraryImage(
      getDb(),
      requestId.data,
      size.data,
      c.req.raw.signal,
    )
    c.header("Content-Type", "image/webp")
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(new Uint8Array(bytes).buffer)
  })
  return app
}

let activeReads = 0

async function loadLibraryImage(
  db: PrismaClient,
  id: string,
  size: "thumbnail" | "display",
  requestSignal: AbortSignal,
) {
  if (activeReads >= 8)
    throw new CatalogAiError("UNAVAILABLE", "Image review is busy. Try again.")
  activeReads++
  try {
    const target = await readCatalogAiLibraryImageTarget(db, id)
    const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(15_000)])
    const receipts = await readCatalogPhotoDerivativeReceipts(
      db,
      target,
      CATALOG_PHOTO_PROCESSING_VERSION,
    ).catch(() => null)
    let bytes: Uint8Array<ArrayBufferLike> | null =
      receipts?.display.contentDigest === target.reviewDisplayDigest
        ? await createVercelCatalogPhotoDerivativeStorage()
            .read(target.scope, receipts[size], signal)
            .catch(() => null)
        : null
    if (!bytes) {
      const source = await createCatalogPhotoStorageForScope(target.scope).read(
        {
          ...target,
          abortSignal: signal,
        },
      )
      const processed = await processCatalogPhoto({
        bytes: source,
        contentType: target.photo.contentType,
        signal,
      })
      if (processed.display.contentDigest !== target.reviewDisplayDigest)
        throw new CatalogAiError("NOT_FOUND", "Image unavailable.")
      bytes = processed[size].bytes
    }
    const current = await readCatalogAiLibraryImageTarget(db, id)
    if (
      current.photo.assetId !== target.photo.assetId ||
      current.photo.contentDigest !== target.photo.contentDigest ||
      current.reviewDisplayDigest !== target.reviewDisplayDigest
    )
      throw new CatalogAiError("NOT_FOUND", "Image unavailable.")
    signal.throwIfAborted()
    return bytes
  } finally {
    activeReads--
  }
}
