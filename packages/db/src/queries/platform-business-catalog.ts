import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { resolveStoreSiteHost } from "./catalog-product-share"
import {
  projectStorefrontBusiness,
  readPublicStorefrontFromContext,
  storefrontBusinessStoreSelect,
  storefrontBusinessTenantSelect,
} from "./public-storefront"
import type { PublicStorefrontQuery } from "./public-storefront-listing"
import { getRetailOpsOwnerPlanId } from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

const unavailable = { status: "unavailable" as const }

/**
 * Platform-hosted business catalog (`/b/<slug>`). A Store appears only after its
 * owner opted in to public listing, and only products the owner listed there.
 * A Store with a live published Site is sent to that Site's verified host; this
 * never creates, fakes or publishes a Site/release.
 */
export async function getPlatformBusinessCatalog(
  db: DbClient,
  input: {
    slug: string
    query?: PublicStorefrontQuery
    after?: string
    /** Server-authorized share scope; the listed Store must be exactly this one. */
    trustedStore?: { tenantId: string; storeId: string }
    /**
     * Server-decided local QA preview (see `isLocalPlatformCatalogPreview`):
     * QA test businesses render only on the local marketing host.
     */
    localQaPreview?: boolean
  },
  deps = {
    resolveSiteHost: resolveStoreSiteHost,
    readCatalog: readPublicStorefrontFromContext,
  },
) {
  const { slug, query: options = {}, after, trustedStore } = input
  const localQaPreview = input.localQaPreview === true
  if (!isValidStoreLink(slug) || (slug.endsWith("-qa") && !localQaPreview))
    return unavailable
  const tenant = await db.tenant.findFirst({
    where: {
      slug,
      isActive: true,
      dataClassification: localQaPreview ? { in: ["LIVE", "QA"] } : "LIVE",
      ...(trustedStore ? { id: trustedStore.tenantId } : {}),
    },
    select: {
      ...storefrontBusinessTenantSelect,
      stores: {
        where: {
          status: "ACTIVE",
          publicCatalogListedAt: { not: null },
          ...(trustedStore ? { id: trustedStore.storeId } : {}),
        },
        orderBy: [{ publicCatalogListedAt: "asc" }, { id: "asc" }],
        take: 1,
        select: storefrontBusinessStoreSelect,
      },
    },
  })
  const store = tenant?.stores[0]
  if (!tenant || !store) return unavailable
  const siteHost = await deps.resolveSiteHost(
    db,
    { tenantId: tenant.id, storeId: store.id },
    tenant.slug,
  )
  if (siteHost) return { status: "site" as const, host: siteHost }
  const business = projectStorefrontBusiness(
    tenant,
    store,
    localQaPreview,
    await getRetailOpsOwnerPlanId(db, tenant.id),
  )
  if (!business) return unavailable
  const catalog = await deps.readCatalog(db, business, after, options, {
    platformListed: true,
  })
  if (!catalog || (catalog.isQaPreview && !localQaPreview)) return unavailable
  // Explicit allowlist: no plan, chat, request or messaging internals.
  return {
    status: "available" as const,
    business: {
      name: catalog.name,
      slug: catalog.slug,
      description: catalog.description,
      currencyCode: catalog.currencyCode,
      whatsAppPhone: catalog.whatsAppPhone,
    },
    categories: catalog.categories,
    category: catalog.category,
    subcategory: catalog.subcategory,
    query: catalog.query ?? null,
    items: catalog.items.filter((item) => item.kind === "PRODUCT"),
    highlightedItem:
      catalog.highlightedItem?.kind === "PRODUCT"
        ? catalog.highlightedItem
        : null,
    nextCursor: catalog.nextCursor,
    hasHiddenItems: catalog.hasHiddenItems,
  }
}

/** Platform-hosted paths; the product id is the opaque Catalog item id. */
export function platformBusinessCatalogPath(slug: string, productId?: string) {
  return productId
    ? `/b/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`
    : `/b/${encodeURIComponent(slug)}`
}

/**
 * Platform product link for an authorized Store without a live Site: only when
 * the Store is listed and this product is currently on its platform catalog.
 */
export async function getPlatformProductShare(
  db: DbClient,
  scope: { tenantId: string; storeId: string; itemId: string },
  readCatalog = getPlatformBusinessCatalog,
) {
  const tenant = await db.tenant.findFirst({
    where: { id: scope.tenantId, isActive: true, dataClassification: "LIVE" },
    select: { slug: true },
  })
  if (!tenant) return null
  const catalog = await readCatalog(db, {
    slug: tenant.slug,
    query: { item: scope.itemId },
    trustedStore: { tenantId: scope.tenantId, storeId: scope.storeId },
  })
  if (
    catalog.status !== "available" ||
    catalog.highlightedItem?.id !== scope.itemId
  )
    return null
  return {
    path: platformBusinessCatalogPath(tenant.slug, scope.itemId),
    title: `${catalog.highlightedItem.name} · ${catalog.business.name}`,
  }
}
