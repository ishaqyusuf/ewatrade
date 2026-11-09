import {
  getCatalogProductShareSource,
  getPlatformProductShare,
  siteContentHash,
} from "@ewatrade/db/queries"
import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import { storefrontItemHref } from "@ewatrade/storefront-runtime/links"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import { loadStorefront } from "@ewatrade/storefront-runtime/server"
import { templateRegistry } from "@ewatrade/storefront-templates"

type Scope = { tenantId: string; storeId: string; itemId: string }
type Db = Parameters<typeof getCatalogProductShareSource>[0]

/** Platform-hosted pages live on the marketing origin (`ewatrade.com/b/...`). */
function platformOrigin(env: Record<string, string | undefined>) {
  return new URL(
    env.MARKETING_URL ??
      env.NEXT_PUBLIC_MARKETING_URL ??
      "https://ewatrade.com",
  ).origin
}

/**
 * Sharing is a read of a currently renderable public product, never publication.
 * A live Site wins; otherwise a product listed on the platform catalog shares its
 * platform page. Neither path creates a Site or lists anything.
 */
export async function readCatalogProductShare(
  db: Db,
  scope: Scope,
  loadSource = getCatalogProductShareSource,
  loadPlatform = getPlatformProductShare,
  env: Record<string, string | undefined> = process.env,
) {
  const siteShare = await readSiteProductShare(db, scope, loadSource)
  if (siteShare) return siteShare
  const platform = await loadPlatform(db, scope)
  if (platform)
    return {
      status: "available" as const,
      url: `${platformOrigin(env)}${platform.path}`,
      title: platform.title,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    }
  return {
    status: "unavailable" as const,
    reason:
      "This product is not on a published storefront or the public catalog.",
  }
}

async function readSiteProductShare(
  db: Db,
  scope: Scope,
  loadSource: typeof getCatalogProductShareSource,
) {
  const unavailable = null
  const current = await loadSource(db, scope)
  if (!current) return unavailable
  const { site, storefront: store } = current
  const release = site.release
  if (
    release.tenantId !== scope.tenantId ||
    site.storeId !== scope.storeId ||
    store.isQaPreview ||
    release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
    release.contentHash !== siteContentHash(release.composition)
  )
    return unavailable
  const projection = publicStorefrontResources(store)
  const load = await loadStorefront(
    {
      registry: templateRegistry,
      resolveSite: async () => ({
        scope: {
          tenantId: scope.tenantId,
          siteId: site.siteId,
          storeId: scope.storeId,
          releaseId: release.id,
          mode: "live",
          locale: "en-NG",
          currencyCode: store.currencyCode,
        },
        composition: release.composition,
      }),
      loadResources: async () => projection,
    },
    { item: scope.itemId },
  )
  if (load.status !== "ready" || !load.snapshot.capabilities.catalog.available)
    return unavailable
  if (
    load.manifest.key !== release.templateKey ||
    load.manifest.version !== release.templateVersion
  )
    return unavailable
  const catalog = load.snapshot.resources.catalog
  const item =
    catalog.highlightedItem?.id === scope.itemId
      ? catalog.highlightedItem
      : catalog.items.find((entry) => entry.id === scope.itemId)
  if (!item || item.kind !== "PRODUCT") return unavailable
  return {
    status: "available" as const,
    url: `https://${current.host}${storefrontItemHref(item.id)}`,
    title: `${item.name} · ${store.name}`,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
  }
}
