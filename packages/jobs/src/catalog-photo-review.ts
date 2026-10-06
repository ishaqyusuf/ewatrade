import { isCatalogPhotoReviewConfigured } from "@ewatrade/catalog/photo-review-openai"
import { catalogPhotoReviewHandler } from "./handlers/catalog-photo-review"
import { triggerJob } from "./trigger"

/** Best effort dispatch; the persisted pending row is the recovery queue. */
export async function enqueueCatalogPhotoReview(assetId: string) {
  if (!isCatalogPhotoReviewConfigured()) return
  await triggerJob(
    "catalog.photo.review",
    catalogPhotoReviewHandler,
    { assetId },
    { maxAttempts: 1 },
  )
}
