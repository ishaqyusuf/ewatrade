import { getPublicStorefrontForSite } from "./public-storefront"
import type { PublicStorefrontQuery } from "./public-storefront-listing"
import { getLiveSiteRelease } from "./storefront-sites"
import type { DbClient } from "./types"

/** Live only: verified Host → tenant → primary published Site → active release → Site.storeId. */
export function loadLiveStorefrontForHost(
  db: DbClient,
  host: string,
  after?: string,
  options: PublicStorefrontQuery = {},
) {
  return getPublicStorefrontForSite(
    db,
    host,
    (tenantId) => getLiveSiteRelease(db, tenantId),
    after,
    options,
  )
}
