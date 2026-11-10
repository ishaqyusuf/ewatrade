import { expect, test } from "bun:test"
import {
  getPlatformBusinessCatalog,
  getPlatformProductShare,
} from "./platform-business-catalog"
import type { readPublicStorefrontFromContext } from "./public-storefront"
import type { DbClient } from "./types"

type Catalog = NonNullable<
  Awaited<ReturnType<typeof readPublicStorefrontFromContext>>
>

function fixture(
  options: { listed?: boolean; siteHost?: string; qa?: boolean } = {},
) {
  const tenantReads: Record<string, unknown>[] = []
  const projections: unknown[] = []
  const db = {
    tenant: {
      findFirst: async (query: Record<string, unknown>) => {
        tenantReads.push(query)
        return {
          id: "tenant",
          name: "Hypnos Man Collection",
          slug: "hypnos",
          dataClassification: "LIVE",
          timezone: "Africa/Lagos",
          metadata: { retailOpsPlanId: "growth" },
          subscription: null,
          stores:
            options.listed === false
              ? []
              : [
                  {
                    id: "store",
                    description: "Perfumes and menswear",
                    currencyCode: "NGN",
                    countryCode: "NG",
                    supportPhone: "08030000000",
                  },
                ],
        }
      },
    },
  } as unknown as DbClient
  const catalog = {
    name: "Hypnos Man Collection",
    slug: "hypnos",
    description: "Perfumes and menswear",
    currencyCode: "NGN",
    whatsAppPhone: "2348030000000",
    isQaPreview: options.qa ?? false,
    planId: "growth",
    chatToken: null,
    customerMessages: true,
    customerRequestsAllowed: true,
    hasBusinessContact: true,
    serviceRequestEntry: { token: "private" },
    categories: [],
    category: null,
    subcategory: null,
    items: [
      { id: "oud", kind: "PRODUCT" },
      { id: "fitting", kind: "SERVICE" },
    ],
    highlightedItem: null,
    nextCursor: null,
    hasHiddenItems: false,
  } as unknown as Catalog
  const siteHostCalls: unknown[][] = []
  const deps = {
    resolveSiteHost: async (...args: unknown[]) => {
      siteHostCalls.push(args)
      return options.siteHost ?? null
    },
    readCatalog: (async (...args: unknown[]) => {
      projections.push(args[4])
      return catalog
    }) as unknown as typeof readPublicStorefrontFromContext,
  }
  return { db, deps, tenantReads, projections, siteHostCalls }
}

test("only an opted-in Store of a LIVE active business is read, with the platform-listed projection", async () => {
  const { db, deps, tenantReads, projections } = fixture()
  const result = await getPlatformBusinessCatalog(db, { slug: "hypnos" }, deps)
  expect(result.status).toBe("available")
  expect(tenantReads[0]).toMatchObject({
    where: { slug: "hypnos", isActive: true, dataClassification: "LIVE" },
    select: {
      stores: {
        where: { status: "ACTIVE", publicCatalogListedAt: { not: null } },
      },
    },
  })
  expect(projections).toEqual([{ platformListed: true }])
})

test("a business that has not opted in is unavailable and no catalog is read", async () => {
  const { db, deps, projections } = fixture({ listed: false })
  expect(
    await getPlatformBusinessCatalog(db, { slug: "hypnos" }, deps),
  ).toEqual({ status: "unavailable" })
  expect(projections).toEqual([])
})

test("a Store with a live published Site is sent to its verified host instead", async () => {
  const { db, deps, projections } = fixture({ siteHost: "shop.hypnos.ng" })
  expect(
    await getPlatformBusinessCatalog(db, { slug: "hypnos" }, deps),
  ).toEqual({ status: "site", host: "shop.hypnos.ng" })
  expect(projections).toEqual([])
})

test("invalid and QA slugs never reach the database", async () => {
  for (const slug of ["", "Hyp nos", "../x", "hypnos-qa"]) {
    const { db, deps, tenantReads } = fixture()
    expect(await getPlatformBusinessCatalog(db, { slug }, deps)).toEqual({
      status: "unavailable",
    })
    expect(tenantReads).toEqual([])
  }
})

test("the public result is an allowlist: products only, no plan, chat or request internals", async () => {
  const { db, deps } = fixture()
  const result = await getPlatformBusinessCatalog(db, { slug: "hypnos" }, deps)
  if (result.status !== "available") throw new Error("expected available")
  expect(result.items.map((item) => item.id)).toEqual(["oud"])
  const text = JSON.stringify(result)
  for (const hidden of [
    "planId",
    "chatToken",
    "customerMessages",
    "customerRequestsAllowed",
    "serviceRequestEntry",
    "hasBusinessContact",
    "private",
  ])
    expect(text).not.toContain(hidden)
})

test("a QA catalog is never served on the platform", async () => {
  const { db, deps } = fixture({ qa: true })
  expect(
    await getPlatformBusinessCatalog(db, { slug: "hypnos" }, deps),
  ).toEqual({ status: "unavailable" })
})

test("a trusted share scope pins both the tenant and the exact listed Store", async () => {
  const { db, deps, tenantReads } = fixture()
  await getPlatformBusinessCatalog(
    db,
    { slug: "hypnos", trustedStore: { tenantId: "tenant", storeId: "store" } },
    deps,
  )
  expect(tenantReads[0]).toMatchObject({
    where: { slug: "hypnos", id: "tenant" },
    select: { stores: { where: { id: "store" } } },
  })
})

test("a platform product link exists only for a listed product of the exact listed Store", async () => {
  const db = {
    tenant: { findFirst: async () => ({ slug: "alhaq" }) },
  } as unknown as DbClient
  const scope = { tenantId: "tenant", storeId: "store", itemId: "case" }
  const reads: unknown[] = []
  const read = (result: unknown) =>
    (async (_db: DbClient, input: unknown) => {
      reads.push(input)
      return result
    }) as unknown as typeof getPlatformBusinessCatalog
  const available = {
    status: "available",
    business: { name: "Alhaq Tech" },
    highlightedItem: { id: "case", name: "Clear case" },
  }
  expect(await getPlatformProductShare(db, scope, read(available))).toEqual({
    path: "/b/alhaq/p/case",
    title: "Clear case · Alhaq Tech",
  })
  expect(reads[0]).toEqual({
    slug: "alhaq",
    query: { item: "case" },
    trustedStore: { tenantId: "tenant", storeId: "store" },
  })
  for (const result of [
    { status: "unavailable" },
    { status: "site", host: "shop.alhaq.ng" },
    { ...available, highlightedItem: null },
    { ...available, highlightedItem: { id: "other", name: "Other" } },
  ])
    expect(await getPlatformProductShare(db, scope, read(result))).toBeNull()
})

test("QA businesses render only under the server-decided local QA preview", async () => {
  const live = fixture({ qa: true })
  expect(
    await getPlatformBusinessCatalog(live.db, { slug: "hypnos-qa" }, live.deps),
  ).toEqual({ status: "unavailable" })
  expect(live.tenantReads).toEqual([])
  const local = fixture({ qa: true })
  const result = await getPlatformBusinessCatalog(
    local.db,
    { slug: "hypnos-qa", localQaPreview: true },
    local.deps,
  )
  expect(result.status).toBe("available")
  expect(local.tenantReads[0]).toMatchObject({
    where: { dataClassification: { in: ["LIVE", "QA"] } },
  })
  // A QA business's local Site still takes precedence in local preview.
  expect(local.siteHostCalls[0]?.[4]).toBe(true)
})
