import { STOREFRONT_RUNTIME_VERSION } from "@ewatrade/storefront-contracts/manifest"
import { publicLowStockCountsEnabled } from "@ewatrade/storefront-contracts/orders"
import {
  type PublicItemProjection,
  projectStorefrontBusiness,
  readPublicStorefrontFromContext,
  resolveStorefrontHostAuthority,
  storefrontBusinessStoreSelect,
  storefrontBusinessTenantSelect,
} from "./public-storefront"
import type { PublicStorefrontQuery } from "./public-storefront-listing"
import { getRetailOpsOwnerPlanId } from "./retail-ops-subscriptions"
import { siteContentHash } from "./storefront-sites"
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
  const authority = await resolveStorefrontHostAuthority(db, host)
  if (!authority) return null
  // relationJoins keeps Tenant, exact Store and active release on one round trip.
  const sites = await db.site.findMany({
    take: 2,
    where: {
      isPrimary: true,
      tenant: {
        slug: authority.slug,
        isActive: true,
        dataClassification: authority.localQaPreview
          ? { in: ["LIVE", "QA"] }
          : "LIVE",
      },
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      status: true,
      tenant: { select: storefrontBusinessTenantSelect },
      store: {
        select: {
          ...storefrontBusinessStoreSelect,
          status: true,
          tenantId: true,
        },
      },
      activeRelease: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          siteId: true,
          composition: true,
          contentHash: true,
          templateKey: true,
          templateVersion: true,
          runtimeVersion: true,
        },
      },
    },
  })
  const row = sites.length === 1 ? sites[0] : null
  const release = row?.activeRelease
  if (
    !row ||
    !release ||
    row.status !== "PUBLISHED" ||
    row.store.status !== "ACTIVE" ||
    row.tenant.id !== row.tenantId ||
    row.store.tenantId !== row.tenantId ||
    release.tenantId !== row.tenantId ||
    release.storeId !== row.storeId ||
    release.siteId !== row.id
  )
    return null
  const business = projectStorefrontBusiness(
    row.tenant,
    row.store,
    authority.localQaPreview,
    await getRetailOpsOwnerPlanId(db, row.tenantId),
  )
  if (!business) return null
  const context = {
    site: { siteId: row.id, storeId: row.storeId, release },
    business,
  }
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
