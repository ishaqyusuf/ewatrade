import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import { publicLowStockCountsEnabled } from "@ewatrade/storefront-contracts/orders"
import {
  type PublicItemProjection,
  readPublicStorefrontFromContext,
  resolvePublicStorefrontForSite,
} from "./public-storefront"
import type { PublicStorefrontQuery } from "./public-storefront-listing"
import { getLiveSiteRelease, siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

/** Live only: verified Host → tenant → primary published Site → active release → Site.storeId. */
export async function loadLiveStorefrontForHost(
  db: DbClient,
  host: string,
  after?: string,
  options: PublicStorefrontQuery = {},
  projection: Pick<PublicItemProjection, "catalog"> = {},
) {
  const context = await loadStorefrontContextForHost(db, host)
  return context
    ? loadStorefrontResourcesForContext(db, context, after, options, projection)
    : null
}

/** Current publication/business facts only; never reads listing, stock or categories. */
export async function loadStorefrontContextForHost(db: DbClient, host: string) {
  const context = await resolvePublicStorefrontForSite(db, host, (tenantId) =>
    getLiveSiteRelease(db, tenantId),
  )
  if (!context) return null
  const release = context.site.release
  const pin = release.composition as {
    template?: { key?: unknown; version?: unknown }
  } | null
  if (
    release.runtimeVersion !== STOREFRONT_RUNTIME_VERSION ||
    release.contentHash !== siteContentHash(release.composition) ||
    pin?.template?.key !== release.templateKey ||
    pin?.template?.version !== release.templateVersion
  )
    return null
  const storefront = await readPublicStorefrontFromContext(
    db,
    context.business,
    undefined,
    {},
    { catalog: "none" },
  )
  if (!storefront) return null
  return { ...context, storefront }
}

/** Call only with current, server-resolved context; never reuse across requests or commands. */
export async function loadStorefrontResourcesForContext(
  db: DbClient,
  context: NonNullable<
    Awaited<ReturnType<typeof loadStorefrontContextForHost>>
  >,
  after?: string,
  options: PublicStorefrontQuery = {},
  projection: Pick<PublicItemProjection, "catalog"> = {},
) {
  const storefront = await readPublicStorefrontFromContext(
    db,
    context.business,
    after,
    options,
    {
      ...projection,
      lowStockCounts: publicLowStockCountsEnabled(
        context.site.release.composition,
      ),
    },
  )
  return storefront ? { site: context.site, storefront } : null
}
