import { publicLowStockCountsEnabled } from "@ewatrade/storefront-contracts/orders"
import {
  type PublicItemProjection,
  getPublicStorefrontForSite,
} from "./public-storefront"
import type { PublicStorefrontQuery } from "./public-storefront-listing"
import { getLiveSiteRelease } from "./storefront-sites"
import type { DbClient } from "./types"

/** Live only: verified Host → tenant → primary published Site → active release → Site.storeId. */
export function loadLiveStorefrontForHost(
  db: DbClient,
  host: string,
  after?: string,
  options: PublicStorefrontQuery = {},
  projection: Pick<PublicItemProjection, "catalog"> = {},
) {
  return getPublicStorefrontForSite(
    db,
    host,
    (tenantId) => getLiveSiteRelease(db, tenantId),
    after,
    options,
    // Opt-in extras come from the active published release only.
    (site) => ({
      ...projection,
      lowStockCounts: publicLowStockCountsEnabled(site.release.composition),
    }),
  )
}

/** Current publication/business facts only; never reads listing, stock or categories. */
export function loadStorefrontContextForHost(db: DbClient, host: string) {
  return loadLiveStorefrontForHost(db, host, undefined, {}, { catalog: "none" })
}
