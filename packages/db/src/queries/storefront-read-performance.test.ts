import { expect, test } from "bun:test"
import { resolveStorefrontCustomerScope } from "./storefront-customer-scope"
import { siteContentHash } from "./storefront-sites"
import type { DbClient } from "./types"

function repository() {
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
    metadata: { retailOpsPlanId: "starter" },
    subscription: null,
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
