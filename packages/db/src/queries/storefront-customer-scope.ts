import { readStorefrontFeatureConfig } from "@ewatrade/storefront-contracts/features"
import {
  STOREFRONT_RUNTIME_VERSION,
  compositionSchema,
} from "@ewatrade/storefront-contracts/manifest"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import { siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

export type StorefrontCustomerScopeSource = {
  site: {
    siteId: string
    storeId: string
    release: {
      id: string
      tenantId: string
      templateKey: string
      templateVersion: string
      runtimeVersion: number
      contentHash: string
      composition: unknown
    }
  }
  storefront: { name: string; customerRequestsAllowed?: boolean }
}

type CustomerScopeDependencies = {
  loadCurrent(host: string): Promise<StorefrontCustomerScopeSource | null>
  findActiveStore(scope: { tenantId: string; storeId: string }): Promise<{
    countryCode: string | null
  } | null>
}

/** The same scope interface is exercised with real repositories and isolated adapters. */
export function createStorefrontCustomerScopeResolver(
  dependencies: CustomerScopeDependencies,
) {
  return async (host: string) => {
    const current = await dependencies.loadCurrent(host)
    if (!current) return null
    const { site, storefront } = current
    const release = site.release
    const checked = compositionSchema.safeParse(release.composition)
    if (
      release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
      !checked.success ||
      release.contentHash !== siteContentHash(release.composition) ||
      checked.data.template.key !== release.templateKey ||
      checked.data.template.version !== release.templateVersion
    )
      return null
    const config = readStorefrontFeatureConfig(checked.data)
    if (!config) return null
    const store = await dependencies.findActiveStore({
      tenantId: release.tenantId,
      storeId: site.storeId,
    })
    if (!store) return null
    return {
      siteId: site.siteId,
      releaseId: release.id,
      tenantId: release.tenantId,
      storeId: site.storeId,
      businessName: storefront.name,
      countryCode: store.countryCode ?? "NG",
      allowNewLogin:
        config.accounts.enabled &&
        Boolean(
          (storefront as { customerRequestsAllowed?: boolean })
            .customerRequestsAllowed,
        ),
    }
  }
}

/** Customer reads depend on the published business, not its template or new intake. */
export function resolveStorefrontCustomerScope(db: DbClient, host: string) {
  return createStorefrontCustomerScopeResolver({
    loadCurrent: (hostname) =>
      loadLiveStorefrontForHost(db, hostname, undefined, {}),
    findActiveStore: ({ tenantId, storeId }) =>
      db.store.findFirst({
        where: { id: storeId, tenantId, status: "ACTIVE" },
        select: { countryCode: true },
      }),
  })(host)
}
