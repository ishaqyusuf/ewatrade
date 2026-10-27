import {
  getCatalogProductShareSource,
  siteContentHash,
} from "@ewatrade/db/queries"
import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import { storefrontItemHref } from "@ewatrade/storefront-runtime/links"
import { publicStorefrontResources } from "@ewatrade/storefront-runtime/projection"
import { loadStorefront } from "@ewatrade/storefront-runtime/server"
import { templateRegistry } from "@ewatrade/storefront-templates"

type Scope = { tenantId: string; storeId: string; itemId: string }
type Db = Parameters<typeof getCatalogProductShareSource>[0]

/** Sharing is a read of a currently renderable public product, never publication. */
export async function readCatalogProductShare(
  db: Db,
  scope: Scope,
  loadSource = getCatalogProductShareSource,
) {
  const unavailable = {
    status: "unavailable" as const,
    reason:
      "This product is not available on this Store's published storefront.",
  }
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
