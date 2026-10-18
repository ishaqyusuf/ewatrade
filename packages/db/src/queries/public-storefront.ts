import {
  normalizeHostname,
  resolveTenantDomain,
  stripPort,
} from "@ewatrade/utils"
import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { saleEligibleCatalogItem } from "./product-usage"
import {
  findRetailOpsPlan,
  planHasFeature,
} from "./retail-ops-subscription-plans"
import {
  projectDurableReviewerAccess,
  projectDurableStoreAccess,
  resolveRetailOpsPlanId,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

/** Resolve the actual request authority; never consume client x-tenant-slug headers. */
export async function getPublicStorefrontForHost(
  db: DbClient,
  host: string,
  after?: string,
) {
  const hostname = stripPort(normalizeHostname(host))
  const resolution = resolveTenantDomain(hostname, {
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })
  if (resolution.kind !== "tenant" || resolution.surface !== "storefront")
    return null
  let slug = resolution.tenantSlug
  if (resolution.isCustomDomain) {
    const registered = await db.tenantHostname.findFirst({
      where: {
        hostname,
        surface: "STOREFRONT",
        isCustom: true,
        verifiedAt: { not: null },
        tenant: { isActive: true, dataClassification: "LIVE" },
      },
      select: { tenant: { select: { slug: true } } },
    })
    slug = registered?.tenant.slug ?? null
  }
  if (!slug || !isValidStoreLink(slug)) return null
  return getPublicStorefront(db, slug, after)
}

/** Only active sellable entries with explicitly enabled Store availability are public. */
export async function getPublicStorefront(
  db: DbClient,
  slug: string,
  after?: string,
) {
  const tenant = await db.tenant.findFirst({
    where: { slug, isActive: true, dataClassification: "LIVE" },
    select: {
      id: true,
      name: true,
      slug: true,
      metadata: true,
      subscription: {
        select: {
          plan: { select: { key: true } },
          provider: true,
          status: true,
          billingSubscriptionId: true,
          currentPeriodEndsAt: true,
        },
      },
      stores: {
        where: { status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { id: true, description: true, currencyCode: true },
      },
    },
  })
  const store = tenant?.stores[0]
  if (!tenant || !store) return null
  if (
    tenant.subscription &&
    (projectDurableStoreAccess(tenant.subscription) === false ||
      projectDurableReviewerAccess(tenant.subscription) === false)
  )
    return null
  const planId = resolveRetailOpsPlanId({
    metadata: tenant.metadata,
    subscriptionPlanKey: tenant.subscription?.plan.key,
  })
  const plan = findRetailOpsPlan(planId)
  if (!plan) return null
  const offeringWhere = {
    tenantId: tenant.id,
    status: "ACTIVE" as const,
    archivedAt: null,
    variant: { status: "ACTIVE" as const, archivedAt: null },
    storeAvailability: { some: { storeId: store.id, isAvailable: true } },
  }
  const limit = plan.limits.storefrontItems ?? 50
  const cursor =
    plan.limits.storefrontItems === null &&
    after &&
    /^[A-Za-z0-9_-]{1,128}$/.test(after)
      ? after
      : undefined
  // Unknown or foreign cursors must not influence another tenant's listing.
  if (
    cursor &&
    !(await db.catalogItem.findFirst({
      where: { id: cursor, tenantId: tenant.id },
      select: { id: true },
    }))
  )
    return null
  const rows = await db.catalogItem.findMany({
    where: {
      ...saleEligibleCatalogItem,
      tenantId: tenant.id,
      status: "ACTIVE",
      archivedAt: null,
      offerings: { some: offeringWhere },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      kind: true,
      illustrations: {
        where: { tenantId: tenant.id, storeId: store.id },
        take: 1,
        select: { illustrationId: true },
      },
      offerings: {
        where: offeringWhere,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: 1,
        select: {
          fixedPriceMinor: true,
          currencyCode: true,
          pricingPolicy: true,
        },
      },
    },
  })
  const items = rows.slice(0, limit)
  const messagesEnabled = planHasFeature(plan, "customerMessages")
  const entry = messagesEnabled
    ? await db.customerEntryPoint.findFirst({
        where: { tenantId: tenant.id, storeId: store.id, status: "PUBLISHED" },
        select: { publicToken: true },
      })
    : null
  return {
    name: tenant.name,
    slug: tenant.slug,
    description: store.description,
    planId,
    storefrontItems: plan.limits.storefrontItems,
    customerMessages: messagesEnabled,
    chatToken: entry?.publicToken ?? null,
    hasHiddenItems: plan.limits.storefrontItems !== null && rows.length > limit,
    nextCursor:
      plan.limits.storefrontItems === null && rows.length > limit
        ? (items.at(-1)?.id ?? null)
        : null,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      illustrationId:
        item.illustrations[0]?.illustrationId ??
        (item.kind === "SERVICE"
          ? "ill-generic-service"
          : "ill-generic-product"),
      priceMinor:
        item.offerings[0]?.pricingPolicy === "FIXED"
          ? item.offerings[0].fixedPriceMinor
          : null,
      currencyCode: item.offerings[0]?.currencyCode ?? store.currencyCode,
    })),
  }
}

/** Gate only new conversations; existing customer histories remain readable. */
export async function assertStorefrontCustomerMessages(
  db: DbClient,
  tenantId: string,
) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      metadata: true,
      isActive: true,
      subscription: {
        select: {
          plan: { select: { key: true } },
          provider: true,
          status: true,
          currentPeriodEndsAt: true,
          billingSubscriptionId: true,
        },
      },
    },
  })
  const planId = resolveRetailOpsPlanId({
    metadata: tenant?.metadata,
    subscriptionPlanKey: tenant?.subscription?.plan.key,
  })
  const plan = findRetailOpsPlan(planId)
  if (
    !tenant?.isActive ||
    !plan ||
    !planHasFeature(plan, "customerMessages") ||
    (tenant.subscription &&
      (projectDurableStoreAccess(tenant.subscription) === false ||
        projectDurableReviewerAccess(tenant.subscription) === false))
  )
    throw new Error(
      `Upgrade from ${plan?.name ?? "Starter"} to Growth or Pro to receive customer messages.`,
    )
}

/** Owner preview shares public eligibility, but can also preview a private QA Store. */
export async function getOwnerStorefrontPreview(
  db: DbClient,
  input: { tenantId: string; storeId: string },
) {
  return db.catalogItem.findMany({
    where: {
      ...saleEligibleCatalogItem,
      tenantId: input.tenantId,
      status: "ACTIVE",
      archivedAt: null,
      offerings: {
        some: {
          tenantId: input.tenantId,
          status: "ACTIVE",
          archivedAt: null,
          variant: { status: "ACTIVE", archivedAt: null },
          storeAvailability: {
            some: { storeId: input.storeId, isAvailable: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 3,
    select: { id: true, name: true },
  })
}
