import { getStorefrontDomain } from "@ewatrade/utils"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import type { DbClient } from "./types"

/** Actor/Store are authorized by the protected Catalog read; public gates still apply. */
export async function getCatalogProductShareSource(
  db: DbClient,
  scope: { tenantId: string; storeId: string; itemId: string },
) {
  const tenant = await db.tenant.findFirst({
    where: { id: scope.tenantId, isActive: true, dataClassification: "LIVE" },
    select: { slug: true },
  })
  if (!tenant) return null
  const domain = getStorefrontDomain(
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  )
  const host = `${tenant.slug}.${domain}`
  const current = await loadLiveStorefrontForHost(db, host, undefined, {
    item: scope.itemId,
  })
  if (
    !current ||
    current.storefront.isQaPreview ||
    current.site.release.tenantId !== scope.tenantId ||
    current.site.storeId !== scope.storeId
  )
    return null
  return { host, ...current }
}
