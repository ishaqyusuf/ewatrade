import { getStorefrontDomain } from "@ewatrade/utils"
import {
  loadLiveStorefrontForHost,
  loadStorefrontContextForHost,
} from "./storefront-factory-loader"
import type { DbClient } from "./types"

/**
 * Store hosts in preference order: the Store's active verified custom hosts
 * (primary first), then the platform subdomain. Each candidate is re-verified
 * by the public host loader, so a stale or unverified host never wins.
 */
async function storeShareHosts(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
  slug: string,
) {
  const custom = await db.domainConnection.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      status: "ACTIVE",
      verifiedAt: { not: null },
      disconnectedAt: null,
    },
    orderBy: [{ isPrimary: "desc" }, { activeAt: "desc" }],
    take: 2,
    select: { hostname: true },
  })
  const domain = getStorefrontDomain(
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  )
  return [...custom.map((row) => row.hostname), `${slug}.${domain}`]
}

/** Actor/Store are authorized by the protected Catalog read; public gates still apply. */
export async function getCatalogProductShareSource(
  db: DbClient,
  scope: { tenantId: string; storeId: string; itemId: string },
  loadForHost = loadLiveStorefrontForHost,
) {
  const tenant = await db.tenant.findFirst({
    where: { id: scope.tenantId, isActive: true, dataClassification: "LIVE" },
    select: { slug: true },
  })
  if (!tenant) return null
  for (const host of await storeShareHosts(db, scope, tenant.slug)) {
    const current = await loadForHost(db, host, undefined, {
      item: scope.itemId,
    })
    if (
      current &&
      !current.storefront.isQaPreview &&
      current.site.release.tenantId === scope.tenantId &&
      current.site.storeId === scope.storeId
    )
      return { host, ...current }
  }
  return null
}

/**
 * The verified host currently serving this Store's live published Site, or
 * null when the Store has none (the platform catalog then applies).
 */
export async function resolveStoreSiteHost(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
  slug: string,
  loadContext = loadStorefrontContextForHost,
  /** Local QA preview only: a QA test business's local Site counts too. */
  allowQaPreview = false,
) {
  for (const host of await storeShareHosts(db, scope, slug)) {
    const current = await loadContext(db, host)
    if (
      current &&
      (allowQaPreview || !current.storefront.isQaPreview) &&
      current.site.release.tenantId === scope.tenantId &&
      current.site.storeId === scope.storeId
    )
      return host
  }
  return null
}
