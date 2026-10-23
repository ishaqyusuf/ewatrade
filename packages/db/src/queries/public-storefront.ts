import {
  isLocalStorefrontPreviewHost,
  normalizeHostname,
  resolveTenantDomain,
  stripPort,
} from "@ewatrade/utils"
import { isValidStoreLink } from "@ewatrade/utils/store-link"
import type { Prisma } from "../../generated/prisma/client"
import { saleEligibleCatalogItem } from "./product-usage"
import {
  publicItemAvailability,
  publicOptionPrice,
  publicStockAvailability,
  publicStorefrontOptionName,
  publicStorefrontWhatsAppPhone,
} from "./public-storefront-display"
import { getStorefrontServiceRequestEntry } from "./public-storefront-service-request"
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
  options: { category?: string; item?: string } = {},
) {
  const authority = await resolveStorefrontHostAuthority(db, host)
  if (!authority) return null
  return readStorefront(
    db,
    authority.slug,
    after,
    authority.localQaPreview,
    options,
  )
}

/** Verified request Host → tenant slug (platform subdomain or verified custom hostname). */
export async function resolveStorefrontHostAuthority(
  db: DbClient,
  host: string,
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
  return {
    slug,
    localQaPreview: isLocalStorefrontPreviewHost(hostname, process.env),
  }
}

/** Only active sellable entries with explicitly enabled Store availability are public. */
export async function getPublicStorefront(
  db: DbClient,
  slug: string,
  after?: string,
  options: { category?: string; item?: string } = {},
) {
  return readStorefront(db, slug, after, false, options)
}

/**
 * Factory path: verified Host → tenant → injected trusted Site resolver → that
 * Site's Store. The Store is matched inside the host tenant and never falls back
 * to the oldest active Store; any miss is null.
 */
export async function getPublicStorefrontForSite<T extends { storeId: string }>(
  db: DbClient,
  host: string,
  resolveSite: (tenantId: string) => Promise<T | null>,
  after?: string,
  options: { category?: string; item?: string } = {},
) {
  const authority = await resolveStorefrontHostAuthority(db, host)
  if (!authority) return null
  const tenant = await db.tenant.findFirst({
    where: {
      slug: authority.slug,
      isActive: true,
      dataClassification: authority.localQaPreview
        ? { in: ["LIVE", "QA"] }
        : "LIVE",
    },
    select: { id: true },
  })
  const site = tenant ? await resolveSite(tenant.id) : null
  if (!site) return null
  const storefront = await readStorefront(
    db,
    authority.slug,
    after,
    authority.localQaPreview,
    options,
    site.storeId,
  )
  return storefront ? { site, storefront } : null
}

/**
 * Private design preview only. The authenticated domain command must first lock
 * and authorize this exact Tenant/Store; never expose this as an anonymous API.
 * Uses the public eligibility/pricing projection, including QA for its own owner.
 */
export async function getScopedStorefrontDesignPreview(
  db: DbClient,
  scope: { tenantId: string; storeId: string },
  options: { after?: string; category?: string; item?: string } = {},
) {
  const tenant = await db.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { slug: true },
  })
  return tenant
    ? readStorefront(
        db,
        tenant.slug,
        options.after,
        true,
        options,
        scope.storeId,
      )
    : null
}

async function readStorefront(
  db: DbClient,
  slug: string,
  after: string | undefined,
  localQaPreview: boolean,
  options: { category?: string; item?: string },
  /** Factory loader only: the Site's trusted Store. No oldest-Store fallback. */
  trustedStoreId?: string,
) {
  const tenant = await db.tenant.findFirst({
    where: {
      slug,
      isActive: true,
      dataClassification: localQaPreview ? { in: ["LIVE", "QA"] } : "LIVE",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dataClassification: true,
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
        where: {
          status: "ACTIVE",
          ...(trustedStoreId === undefined ? {} : { id: trustedStoreId }),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: {
          id: true,
          description: true,
          currencyCode: true,
          supportPhone: true,
          countryCode: true,
        },
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
  const paidListing = plan.limits.storefrontItems === null
  const validId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
  const category =
    paidListing && validId(options.category) ? options.category : null
  const baseWhere = {
    ...saleEligibleCatalogItem,
    tenantId: tenant.id,
    status: "ACTIVE" as const,
    archivedAt: null,
    offerings: { some: offeringWhere },
    ...(category ? { categoryId: category } : {}),
  } satisfies Prisma.CatalogItemWhereInput
  const select = {
    id: true,
    name: true,
    kind: true,
    description: true,
    categoryRecord: { select: { id: true, label: true } },
    illustrations: {
      where: { tenantId: tenant.id, storeId: store.id },
      take: 1,
      select: { illustrationId: true },
    },
    offerings: {
      where: offeringWhere,
      orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
      select: {
        id: true,
        name: true,
        fixedPriceMinor: true,
        currencyCode: true,
        pricingPolicy: true,
        variant: {
          select: {
            id: true,
            name: true,
            isDefault: true,
            stockBalanceSources: {
              where: {
                tenantId: tenant.id,
                storeId: store.id,
                custodyType: "STORE" as const,
              },
              select: {
                inventoryUnitId: true,
                onHandQuantity: true,
                reservedQuantity: true,
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.CatalogItemSelect
  type Row = Prisma.CatalogItemGetPayload<{ select: typeof select }>
  const projectItem = (item: Row) => {
    const itemOptions = item.offerings.map((offering) => ({
      id: offering.id,
      name: publicStorefrontOptionName(
        offering.variant.name,
        offering.name,
        offering.variant.isDefault,
      ),
      priceMinor:
        offering.pricingPolicy === "FIXED" ? offering.fixedPriceMinor : null,
      currencyCode: offering.currencyCode,
      availability:
        item.kind === "SERVICE"
          ? null
          : publicStockAvailability(offering.variant.stockBalanceSources),
    }))
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      description: item.description,
      category: item.categoryRecord
        ? { id: item.categoryRecord.id, name: item.categoryRecord.label }
        : null,
      illustrationId:
        item.illustrations[0]?.illustrationId ??
        (item.kind === "SERVICE"
          ? "ill-generic-service"
          : "ill-generic-product"),
      ...publicOptionPrice(itemOptions, store.currencyCode),
      availability: publicItemAvailability(itemOptions),
      options: itemOptions,
    }
  }
  // Paid pagination has two stable buckets, so sold-out items remain last across pages.
  // Aggregate only eligible Store stock, keeping quantities in the repository.
  let outVariantIds: string[] = []
  if (paidListing) {
    const balances = await db.stockBalanceSource.groupBy({
      by: ["variantId", "inventoryUnitId"],
      where: {
        tenantId: tenant.id,
        storeId: store.id,
        custodyType: "STORE",
        variant: { catalogItem: baseWhere },
      },
      _sum: { onHandQuantity: true, reservedQuantity: true },
    })
    const variants = new Map<
      string,
      {
        inventoryUnitId: string
        onHandQuantity: string
        reservedQuantity: string
      }[]
    >()
    for (const balance of balances) {
      const group = variants.get(balance.variantId) ?? []
      group.push({
        inventoryUnitId: balance.inventoryUnitId,
        onHandQuantity: balance._sum.onHandQuantity?.toString() ?? "0",
        reservedQuantity: balance._sum.reservedQuantity?.toString() ?? "0",
      })
      variants.set(balance.variantId, group)
    }
    outVariantIds = [...variants]
      .filter(
        ([, balances]) => publicStockAvailability(balances) === "OUT_OF_STOCK",
      )
      .map(([id]) => id)
  }
  const outWhere = {
    kind: "PRODUCT",
    offerings: {
      none: { ...offeringWhere, variantId: { notIn: outVariantIds } },
    },
  } satisfies Prisma.CatalogItemWhereInput
  const orderBy = [{ createdAt: "asc" as const }, { id: "asc" as const }]
  let cursorId: string | null = null
  let outPage = false
  if (paidListing && after) {
    const raw = after.replace(/^[ao]:/, "")
    if (!validId(raw)) return null
    const cursorItem = await db.catalogItem.findFirst({
      where: { AND: [baseWhere, { id: raw }] },
      select,
    })
    if (!cursorItem) return null
    cursorId = cursorItem.id
    outPage = projectItem(cursorItem).availability === "OUT_OF_STOCK"
    if (
      (after.startsWith("o:") && !outPage) ||
      (after.startsWith("a:") && outPage)
    )
      return null
  }
  let rows: Row[]
  if (!paidListing) {
    // The included plan keeps the first three eligible entries, independent of filters/stock.
    rows = await db.catalogItem.findMany({
      where: baseWhere,
      orderBy,
      take: limit + 1,
      select,
    })
  } else {
    rows = outPage
      ? []
      : await db.catalogItem.findMany({
          where: {
            AND: [
              baseWhere,
              ...(outVariantIds.length ? [{ NOT: outWhere }] : []),
            ],
          },
          orderBy,
          take: limit + 1,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select,
        })
    if (outVariantIds.length && rows.length <= limit) {
      rows.push(
        ...(await db.catalogItem.findMany({
          where: { AND: [baseWhere, outWhere] },
          orderBy,
          take: limit + 1 - rows.length,
          ...(outPage && cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          select,
        })),
      )
    }
  }
  const items = rows.slice(0, limit).map(projectItem)
  if (!paidListing)
    items.sort(
      (a, b) =>
        Number(a.availability === "OUT_OF_STOCK") -
        Number(b.availability === "OUT_OF_STOCK"),
    )
  const requestedItem = validId(options.item) ? options.item : null
  let highlightedItem = items.find((item) => item.id === requestedItem) ?? null
  if (paidListing && requestedItem && !highlightedItem) {
    const row = await db.catalogItem.findFirst({
      where: { AND: [baseWhere, { id: requestedItem }] },
      select,
    })
    highlightedItem = row ? projectItem(row) : null
  }
  const categories = paidListing
    ? await db.catalogCategory.findMany({
        where: {
          tenantId: tenant.id,
          items: {
            some: {
              ...saleEligibleCatalogItem,
              tenantId: tenant.id,
              status: "ACTIVE",
              archivedAt: null,
              offerings: { some: offeringWhere },
            },
          },
        },
        select: { id: true, label: true },
        orderBy: [{ normalizedLabel: "asc" }, { id: "asc" }],
      })
    : []
  const isQaPreview = tenant.dataClassification === "QA"
  const messagesEnabled =
    !isQaPreview && planHasFeature(plan, "customerMessages")
  const serviceItems = [
    ...items,
    ...(highlightedItem ? [highlightedItem] : []),
  ].some((item) => item.kind === "SERVICE")
  const serviceRequestEntry =
    serviceItems &&
    planHasFeature(plan, "customerMessages") &&
    (!isQaPreview || localQaPreview)
      ? await getStorefrontServiceRequestEntry(db, {
          tenantId: tenant.id,
          storeId: store.id,
        })
      : null
  return {
    ...(serviceRequestEntry ? { serviceRequestEntry } : {}),
    name: tenant.name,
    category,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.label,
    })),
    highlightedItem,
    slug: tenant.slug,
    isQaPreview,
    description: store.description,
    currencyCode: store.currencyCode,
    planId,
    storefrontItems: plan.limits.storefrontItems,
    customerMessages: messagesEnabled,
    chatToken: null,
    whatsAppPhone: publicStorefrontWhatsAppPhone({
      supportPhone: store.supportPhone,
      countryCode: store.countryCode,
      messagesEnabled,
      isQaPreview,
    }),
    hasHiddenItems: plan.limits.storefrontItems !== null && rows.length > limit,
    nextCursor:
      paidListing && rows.length > limit && items.length
        ? `${items.at(-1)?.availability === "OUT_OF_STOCK" ? "o" : "a"}:${items.at(-1)?.id}`
        : null,
    items,
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
