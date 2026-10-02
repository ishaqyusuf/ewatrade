import {
  type CatalogPhotoDerivative,
  catalogPhotoDerivativePath,
} from "@ewatrade/catalog/photo-contracts"
import { createVercelCatalogPhotoDerivativeStorage } from "@ewatrade/catalog/photo-derivatives"
import {
  CATALOG_PHOTO_PROCESSING_VERSION,
  CatalogPhotoProcessingError,
  processCatalogPhoto,
} from "@ewatrade/catalog/photo-processing"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import {
  type CatalogPhotoCacheTarget,
  completeCatalogPhotoDerivative,
  readCatalogPhotoDerivativeReceipts,
  reserveCatalogPhotoDerivatives,
} from "@ewatrade/db/catalog-photo-derivatives"
import type { PrismaClient } from "@ewatrade/db"

let active = 0

/** Both routes retain fresh authorization before/after this bounded I/O.
 * Always verify the trusted original byte digest, even on derivative cache hits.
 * Cache failure falls back to verified source processing, never approval. */
export async function loadCatalogPhotoDelivery(
  db: PrismaClient,
  target: CatalogPhotoCacheTarget,
  signal: AbortSignal,
) {
  if (active >= 4)
    throw new CatalogPhotoProcessingError("PHOTO_PROCESSING_BUSY")
  active++
  try {
    const bytes = await createVercelCatalogPhotoStorage().read({
      ...target,
      abortSignal: signal,
    })
    const storage = createVercelCatalogPhotoDerivativeStorage()
    try {
      const receipts = await readCatalogPhotoDerivativeReceipts(
        db,
        target,
        CATALOG_PHOTO_PROCESSING_VERSION,
      )
      if (receipts) {
        const display = await storage.read(
          target.scope,
          receipts.display,
          signal,
        )
        const thumbnail = await storage.read(
          target.scope,
          receipts.thumbnail,
          signal,
        )
        return {
          display: { ...receipts.display, bytes: display },
          thumbnail: { ...receipts.thumbnail, bytes: thumbnail },
        }
      }
    } catch {
      // Missing/corrupt/unknown cache cannot supply bytes; reprocess exact source.
    }
    const processed = await processCatalogPhoto({
      bytes,
      contentType: target.photo.contentType,
      signal,
    })
    const photos = (["display", "thumbnail"] as const).map((variant) => {
      const { bytes: _bytes, ...facts } = processed[variant]
      const photo: CatalogPhotoDerivative = {
        ...facts,
        assetId: target.photo.assetId,
        tenantId: target.scope.tenantId,
        storeId: target.scope.storeId,
        sourceDigest: target.photo.contentDigest,
        processingVersion: CATALOG_PHOTO_PROCESSING_VERSION,
        variant,
        displayDigest: processed.display.contentDigest,
        storageStoreId: target.storageStoreId,
        storagePath: "",
      }
      photo.storagePath = catalogPhotoDerivativePath(photo)
      return photo
    })
    try {
      if (await reserveCatalogPhotoDerivatives(db, target, photos)) {
        for (const photo of photos) {
          await storage.write(
            target.scope,
            photo,
            processed[photo.variant].bytes,
            signal,
          )
          await completeCatalogPhotoDerivative(db, photo)
        }
      }
    } catch {
      // Pending reservations remain durable cleanup ownership after uncertain put.
      // Successfully processed authorized output remains deliverable.
    }
    signal.throwIfAborted()
    return processed
  } finally {
    active--
  }
}
