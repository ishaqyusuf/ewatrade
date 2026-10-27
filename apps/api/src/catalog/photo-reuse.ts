import { processCatalogPhoto } from "@ewatrade/catalog/photo-processing"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import { uploadCatalogPhoto } from "@ewatrade/catalog/photo-upload"
import type { PrismaClient } from "@ewatrade/db"
import { getCatalogPhotoReuseSource } from "@ewatrade/db/catalog-photo-gallery"
import { recordCatalogPhotoVerdict } from "@ewatrade/db/catalog-photo-lifecycle"
import {
  createCatalogPhotoIntent,
  getCatalogPhotoUploadTarget,
  recordVerifiedCatalogPhotoUpload,
} from "@ewatrade/db/catalog-photos"
import type { CatalogPhotoActorScope } from "@ewatrade/db/catalog-photos"
import { enqueueCatalogPhotoReview } from "@ewatrade/jobs/catalog-photo-review"

/**
 * Copies an approved photo from one Item onto a new private draft for another
 * Item. The draft goes through the same intent, byte verification and
 * processing as an upload, so the copy has its own lifecycle: removing it
 * later never touches the source Item's photo. When the copy's processed
 * display bytes match the ones the source was approved on, the server carries
 * that verdict over instead of running a second image check.
 */
export async function reuseCatalogPhoto(
  db: PrismaClient,
  input: {
    target: CatalogPhotoActorScope
    source: CatalogPhotoActorScope & { assetId: string }
    clientOperationId: string
    signal?: AbortSignal
  },
) {
  if (input.source.tenantId !== input.target.tenantId)
    throw new Error("Photo reuse must stay inside one business.")
  const source = await getCatalogPhotoReuseSource(db, input.source)
  const intent = await createCatalogPhotoIntent(db, {
    ...input.target,
    clientOperationId: input.clientOperationId,
    contentDigest: source.photo.contentDigest,
    contentType: source.photo.contentType,
    sizeBytes: source.photo.sizeBytes,
  })
  // A replayed command returns the copy it already made.
  if (intent.state !== "UPLOADING") return intent
  const storage = createVercelCatalogPhotoStorage()
  const bytes = await storage.read({
    scope: source.scope,
    photo: source.photo,
    abortSignal: input.signal,
  })
  let displayDigest: string | null = null
  const target = await getCatalogPhotoUploadTarget(db, {
    ...input.target,
    assetId: intent.assetId,
  })
  const result = await uploadCatalogPhoto({
    request: new Request("http://internal.invalid/catalog-photo-reuse", {
      method: "PUT",
      body: new Blob([bytes.slice()]),
      headers: {
        "content-type": source.photo.contentType,
        "content-length": String(bytes.byteLength),
      },
      signal: input.signal,
    }),
    target,
    storage,
    validate: async (photo) => {
      displayDigest = (await processCatalogPhoto(photo)).display.contentDigest
    },
    complete: (photo) =>
      recordVerifiedCatalogPhotoUpload(db, input.target, photo),
  })
  if (
    source.review &&
    displayDigest !== null &&
    displayDigest === source.review.displayDigest
  ) {
    try {
      return await recordCatalogPhotoVerdict(db, {
        ...input.target,
        assetId: intent.assetId,
        sourceDigest: source.photo.contentDigest,
        displayDigest,
        provider: `reuse.${source.photo.assetId}`,
        policyVersion: source.review.policyVersion,
        verdict: "APPROVED",
      })
    } catch {
      // A review worker already leased the copy; let the normal check finish.
    }
  }
  await enqueueCatalogPhotoReview(intent.assetId).catch(() => undefined)
  return result
}
