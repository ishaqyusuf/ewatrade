import { platformBusinessCatalogPath } from "./platform-business-catalog"
import type { DbClient } from "./types"

type StoreScope = { tenantId: string; storeId: string }

/** Owner opt-in for the platform-hosted catalog; listing itself publishes no product. */
export async function getStorePublicListing(db: DbClient, scope: StoreScope) {
  const store = await db.store.findFirst({
    where: { id: scope.storeId, tenantId: scope.tenantId },
    select: { publicCatalogListedAt: true, tenant: { select: { slug: true } } },
  })
  if (!store) return null
  return {
    listed: store.publicCatalogListedAt !== null,
    listedAt: store.publicCatalogListedAt,
    path: platformBusinessCatalogPath(store.tenant.slug),
  }
}

/** Idempotent: re-listing keeps the original opt-in time; unlisting clears it. */
export async function setStorePublicListing(
  db: DbClient,
  scope: StoreScope,
  listed: boolean,
) {
  await db.store.updateMany({
    where: {
      id: scope.storeId,
      tenantId: scope.tenantId,
      ...(listed ? { publicCatalogListedAt: null } : {}),
    },
    data: { publicCatalogListedAt: listed ? new Date() : null },
  })
  return getStorePublicListing(db, scope)
}
