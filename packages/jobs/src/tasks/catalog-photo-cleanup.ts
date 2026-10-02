import { createVercelCatalogPhotoDerivativeStorage } from "@ewatrade/catalog/photo-derivatives"
import {
  claimCatalogPhotoDerivativeCleanup,
  finishCatalogPhotoDerivativeCleanup,
} from "@ewatrade/db/catalog-photo-derivatives"
import { createVercelCatalogPhotoStorage } from "@ewatrade/catalog/photo-storage"
import {
  claimDeletedTenantCatalogPhoto,
  finishDeletedTenantCatalogPhoto,
} from "@ewatrade/db/catalog-photo-deletion"
import {
  claimCatalogPhotoCleanup,
  finishCatalogPhotoCleanup,
  listCatalogPhotoCleanupCandidates,
} from "@ewatrade/db/catalog-photo-lifecycle"
import { prisma } from "@ewatrade/db/client"
import { schedules } from "@trigger.dev/sdk/v3"

export const catalogPhotoCleanup = schedules.task({
  id: "catalog.photo.cleanup",
  cron: "*/5 * * * *",
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  run: async () => {
    // Rollout is explicit in each jobs environment. No credential/profile
    // fallback and no LIVE provider access for QA assets.
    if (process.env.CATALOG_PHOTO_CLEANUP_ENABLED !== "true")
      return { enabled: false, removed: 0 }
    const storage = createVercelCatalogPhotoStorage()
    let derivativesRemoved = 0
    const derivatives = createVercelCatalogPhotoDerivativeStorage()
    for (let index = 0; index < 4; index++) {
      try {
        const target = await claimCatalogPhotoDerivativeCleanup(prisma)
        if (!target) break
        if (target.photo.storageStoreId !== process.env.BLOB_STORE_ID?.trim())
          continue
        await derivatives.remove(target.scope, target.photo)
        if (
          (await finishCatalogPhotoDerivativeCleanup(prisma, target)).count ===
          1
        )
          derivativesRemoved++
      } catch {
        // Exact immutable receipt survives failures and in-flight/process crashes.
      }
    }
    let removed = 0
    for (const candidate of await listCatalogPhotoCleanupCandidates(prisma)) {
      const target = await claimCatalogPhotoCleanup(prisma, candidate.id)
      if (
        !target ||
        !target.storageStoreId ||
        target.storageStoreId !== process.env.BLOB_STORE_ID?.trim()
      )
        continue
      await storage.remove(target)
      if (await finishCatalogPhotoCleanup(prisma, target.photo)) removed++
    }
    let tenantRemoved = 0
    for (let index = 0; index < 4; index++) {
      const target = await claimDeletedTenantCatalogPhoto(prisma)
      if (!target) break
      // Exact original provider store pin; configuration changes never redirect del.
      if (target.storageStoreId !== process.env.BLOB_STORE_ID?.trim()) continue
      try {
        await storage.remove(target)
        if (await finishDeletedTenantCatalogPhoto(prisma, target))
          tenantRemoved++
      } catch {
        // Safe durable backoff/lease recovery; never log provider exception details.
      }
    }
    return { enabled: true, removed, tenantRemoved, derivativesRemoved }
  },
})
