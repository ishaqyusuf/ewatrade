import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { reviewCatalogPhoto } from "@ewatrade/catalog/photo-review"
import {
  createOpenAiCatalogPhotoReviewProvider,
  isCatalogPhotoReviewConfigured,
} from "@ewatrade/catalog/photo-review-openai"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import { recordCatalogPhotoVerdict } from "@ewatrade/db/catalog-photo-lifecycle"
import {
  claimCatalogPhotoReview,
  releaseCatalogPhotoReview,
} from "@ewatrade/db/catalog-photo-review"
import { prisma } from "@ewatrade/db/client"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type CatalogPhotoReviewPayload = { assetId: string }

export async function catalogPhotoReviewHandler(
  payload: CatalogPhotoReviewPayload,
) {
  if (!isCatalogPhotoReviewConfigured()) return
  const target = await claimCatalogPhotoReview(prisma, payload.assetId)
  if (!target) return
  try {
    await assertQaJobProviderAllowed({
      adapter: "live",
      operation: "media_analysis",
      tenantId: target.scope.tenantId,
    })
    const storage = createVercelCatalogPhotoStorage()
    const packagedWorker = resolve(
      process.cwd(),
      "catalog/src/photo-heic-worker.mjs",
    )
    await reviewCatalogPhoto({
      scope: target.scope,
      photo: target.photo,
      provider: createOpenAiCatalogPhotoReviewProvider(),
      heicWorkerUrl: existsSync(packagedWorker)
        ? new URL(pathToFileURL(packagedWorker).href)
        : undefined,
      read: (signal) =>
        storage.read({
          scope: target.scope,
          photo: target.photo,
          abortSignal: signal,
        }),
      commit: (verdict) =>
        recordCatalogPhotoVerdict(prisma, {
          ...target.actor,
          ...verdict,
          assetId: target.photo.assetId,
          leaseToken: target.leaseToken,
          storageStoreId: target.storageStoreId,
        }),
    })
  } catch {
    await releaseCatalogPhotoReview(prisma, {
      assetId: target.photo.assetId,
      leaseToken: target.leaseToken,
    })
    // Details from storage/model transports are never copied into job telemetry.
    throw new Error(
      "Catalog image review could not complete. Photo remains private.",
    )
  }
}
