import { expect, test } from "bun:test"
import {
  resolveStorefrontCustomerScope,
  storefrontCustomerScopeFromContext,
} from "./storefront-customer-scope"
import { getStorefrontCustomerSession } from "./storefront-customers"
import {
  loadStorefrontContextForHost,
  loadStorefrontResourcesForContext,
} from "./storefront-factory-loader"
import { siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

function repository(plan: "starter" | "growth" = "starter") {
  const reads: string[] = []
  const composition = {
    schemaVersion: 1,
    template: { key: "commerce-studio", version: "1.0.0" },
    theme: {
      font: "system",
      accent: "#171717",
      background: "#ffffff",
      radius: "small",
    },
    pages: [{ key: "home", sections: [] }],
  }
  const tenant = {
    id: "tenant-a",
    name: "Merchant",
    slug: "merchant",
    timezone: "Africa/Lagos",
    dataClassification: "LIVE",
    metadata: { retailOpsPlanId: plan },
    subscription: {
      plan: { key: plan },
      provider: "MANUAL",
      status: "ACTIVE",
      billingSubscriptionId: null,
      currentPeriodEndsAt: null,
    },
    stores: [
      {
        id: "store-a",
        description: null,
        currencyCode: "NGN",
        countryCode: "NG",
        supportPhone: null,
      },
    ],
  }
  const site = {
    id: "site-a",
    tenantId: tenant.id,
    storeId: "store-a",
    status: "PUBLISHED",
    store: { status: "ACTIVE" },
    activeRelease: {
      id: "release-a",
      tenantId: tenant.id,
      storeId: "store-a",
      siteId: "site-a",
      composition,
      contentHash: siteContentHash(composition),
      templateKey: "commerce-studio",
      templateVersion: "1.0.0",
      runtimeVersion: 1,
    },
  }
  const db = {
    tenant: {
      findFirst: async () => {
        reads.push("tenant")
        return tenant
      },
    },
    site: {
      findMany: async () => {
        reads.push("site")
        return [site]
      },
    },
    store: {
      findFirst: async () => {
        reads.push("store")
        return { countryCode: "NG" }
      },
    },
    catalogItem: {
      findMany: async () => {
        reads.push("catalog")
        return []
      },
    },
    catalogCategory: {
      findMany: async () => {
        reads.push("categories")
        return []
      },
    },
    stockBalanceSource: {
      groupBy: async () => {
        reads.push("stock")
        return []
      },
    },
  } as unknown as DbClient
  return { db, reads, site }
}

test("customer scope resolves the real published repository path without a catalog read", async () => {
  const { db, reads } = repository()
  const scope = await resolveStorefrontCustomerScope(
    db,
    "merchant.ewatrade.com",
  )
  expect(scope).toMatchObject({
    tenantId: "tenant-a",
    storeId: "store-a",
    businessName: "Merchant",
  })
  expect(
    reads.filter((read) => ["catalog", "categories", "stock"].includes(read)),
  ).toEqual([])
})

test("shell projections reuse authority without listing, categories or stock for both plans", async () => {
  for (const plan of ["starter", "growth"] as const) {
    const { db, reads } = repository(plan)
    const context = await loadStorefrontContextForHost(
      db,
      "merchant.ewatrade.com",
    )
    expect(context).not.toBeNull()
    if (!context) throw new Error("Expected a current publication")
    const authorityReads = [...reads]
    for (let page = 0; page < 2; page++) {
      const result = await loadStorefrontResourcesForContext(
        db,
        context,
        undefined,
        {},
        { catalog: "none" },
      )
      expect(result?.storefront).toMatchObject({
        name: "Merchant",
        items: [],
        categories: [],
        highlightedItem: null,
      })
    }
    expect(reads).toEqual(authorityReads)
  }
})

test("paid detail reads one eligible item without a listing, stock aggregation or categories", async () => {
  const { db, reads } = repository("growth")
  Object.assign(db.catalogItem, {
    findFirst: async () => {
      reads.push("detail")
      return {
        id: "item-a",
        name: "Item A",
        kind: "PRODUCT",
        description: null,
        categoryRecord: null,
        illustrations: [],
        offerings: [],
      }
    },
  })
  const context = await loadStorefrontContextForHost(
    db,
    "merchant.ewatrade.com",
  )
  if (!context) throw new Error("Expected a current publication")
  const result = await loadStorefrontResourcesForContext(
    db,
    context,
    undefined,
    { item: "item-a", q: "unrelated" },
    { catalog: "detail" },
  )
  expect(result?.storefront.highlightedItem?.id).toBe("item-a")
  expect(result?.storefront.items).toEqual([])
  expect(
    reads.filter((read) =>
      ["catalog", "categories", "stock", "detail"].includes(read),
    ),
  ).toEqual(["detail"])
})

test("capped detail checks bounded ID membership and cannot reveal an over-cap item", async () => {
  const { db, reads } = repository()
  const selections: unknown[] = []
  Object.assign(db.catalogItem, {
    findMany: async (query: unknown) => {
      selections.push(query)
      return [{ id: "one" }, { id: "two" }, { id: "three" }]
    },
    findFirst: async () => {
      reads.push("detail")
      return null
    },
  })
  const context = await loadStorefrontContextForHost(
    db,
    "merchant.ewatrade.com",
  )
  if (!context) throw new Error("Expected a current publication")
  const result = await loadStorefrontResourcesForContext(
    db,
    context,
    undefined,
    { item: "four" },
    { catalog: "detail" },
  )
  expect(result?.storefront.highlightedItem).toBeNull()
  expect(selections).toHaveLength(1)
  expect(selections[0]).toMatchObject({ take: 3, select: { id: true } })
  expect(reads).not.toContain("detail")
})

test("lightweight scope still refuses an unpublished or mismatched release", async () => {
  for (const kind of ["unpublished", "foreign", "tampered"] as const) {
    const { db, site, reads } = repository()
    if (kind === "unpublished") site.status = "DRAFT"
    if (kind === "foreign") site.activeRelease.tenantId = "foreign"
    if (kind === "tampered") site.activeRelease.contentHash = "tampered"
    expect(
      await resolveStorefrontCustomerScope(db, "merchant.ewatrade.com"),
    ).toBeNull()
    expect(reads).not.toContain("catalog")
  }
})

test("a valid render session reuses current authority and expired/foreign sessions still fail", async () => {
  const { db, reads } = repository()
  const context = await loadStorefrontContextForHost(
    db,
    "merchant.ewatrade.com",
  )
  const session = {
    id: "session-a",
    tenantId: "tenant-a",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastSeenAt: new Date(),
    customer: {
      id: "customer-a",
      tenantId: "tenant-a",
      emailNormalized: "customer@example.test",
      phoneE164: null,
      displayName: "Customer",
    },
  }
  Object.assign(db, {
    storefrontCustomerSession: { findUnique: async () => session },
  })
  let scopeReads = 0
  const resolve = async () => {
    scopeReads++
    return storefrontCustomerScopeFromContext(context)
  }
  const input = { host: "merchant.ewatrade.com", token: "a".repeat(40) }
  expect(await getStorefrontCustomerSession(db, input, resolve)).toMatchObject({
    tenantId: "tenant-a",
    storeId: "store-a",
  })
  expect(reads).toEqual(["tenant", "site", "tenant"])
  expect(scopeReads).toBe(1)
  session.expiresAt = new Date(0)
  expect(await getStorefrontCustomerSession(db, input, resolve)).toBeNull()
  expect(scopeReads).toBe(1)
  session.expiresAt = new Date(Date.now() + 60_000)
  session.tenantId = "foreign"
  session.customer.tenantId = "foreign"
  expect(await getStorefrontCustomerSession(db, input, resolve)).toBeNull()
})
