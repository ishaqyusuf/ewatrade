import { getPublicStorefrontForSite } from "./public-storefront"
import { getLiveSiteRelease } from "./storefront-sites"
import type { DbClient } from "./types"

/** Live only: verified Host → tenant → primary published Site → active release → Site.storeId. */
export function loadLiveStorefrontForHost(
  db: DbClient,
  host: string,
  after?: string,
  options: { category?: string; item?: string } = {},
) {
  return getPublicStorefrontForSite(
    db,
    host,
    (tenantId) => getLiveSiteRelease(db, tenantId),
    after,
    options,
  )
}
