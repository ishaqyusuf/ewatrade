import { isCatalogPhotoReviewConfigured } from "@ewatrade/catalog/photo-review-openai"
import { listCatalogPhotoReviewCandidates } from "@ewatrade/db/catalog-photo-review"
import { prisma } from "@ewatrade/db/client"
import { schedules, task } from "@trigger.dev/sdk/v3"
import {
  type CatalogPhotoReviewPayload,
  catalogPhotoReviewHandler,
} from "../handlers/catalog-photo-review"
import { automaticJobCron } from "../schedule-policy"

const queue = { name: "catalog-photo-review", concurrencyLimit: 1 }

export const catalogPhotoReview = task({
  id: "catalog.photo.review",
  maxDuration: 120,
  queue,
  retry: { maxAttempts: 1 }, // The DB lease/backoff owns retries, including crashes.
  run: catalogPhotoReviewHandler,
})

export const catalogPhotoReviewRecovery = schedules.task({
  id: "catalog.photo.review-recovery",
  cron: automaticJobCron("* * * * *"),
  maxDuration: 300,
  queue,
  run: async () => {
    if (!isCatalogPhotoReviewConfigured())
      return { enabled: false, attempted: 0 }
    const candidates = await listCatalogPhotoReviewCandidates(prisma)
    for (const candidate of candidates) {
      try {
        await catalogPhotoReviewHandler({
          assetId: candidate.id,
        } satisfies CatalogPhotoReviewPayload)
      } catch {
        // One unavailable photo/provider response cannot starve the bounded batch.
      }
    }
    return { enabled: true, attempted: candidates.length }
  },
})
