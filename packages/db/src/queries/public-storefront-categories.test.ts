import { expect, test } from "bun:test"
import { getPublicStorefront } from "./public-storefront"
import {
  decodePublicListingCursor,
  normalizePublicListing,
  publicListingBinding,
  publicPriceSortedIdsSql,
} from "./public-storefront-listing"
import type { DbClient } from "./types"

function row(id: string) {
  return {
    id,
    name: `Item ${id}`,
    kind: "PRODUCT",
    description: null,
    categoryRecord: { id: "root-1", label: "Clothing" },
    illustrations: [],
    offerings: [
      {
        id: `offer-${id}`,
        name: "Standard",
        fixedPriceMinor: 1000,
        currencyCode: "NGN",
        pricingPolicy: "FIXED",
        variant: {
          id: `variant-${id}`,
          name: "Standard",
          isDefault: true,
          stockBalanceSources: [],
        },
      },
    ],
  }
}
type Row = ReturnType<typeof row>

function repository(
  plan: "starter" | "growth",
  input: {
    rows?: Row[]
    categories?: unknown[]
    findFirst?: (query: Record<string, unknown>) => Row | null
  } = {},
) {
  const reads: Record<string, unknown>[] = []
  const firsts: Record<string, unknown>[] = []
  const categoryReads: Record<string, unknown>[] = []
  const raws: { sql: string; values: unknown[] }[] = []
  const db = {
    tenant: {
      findFirst: async () => ({
        id: "tenant",
        name: "Merchant",
        slug: "merchant",
        dataClassification: "LIVE",
        metadata: { retailOpsPlanId: plan },
        subscription: {
          plan: { key: plan },
          provider: "MANUAL",
          status: "ACTIVE",
          billingSubscriptionId: null,
          currentPeriodEndsAt: null,
        },
        stores: [{ id: "store", description: null, currencyCode: "NGN" }],
      }),
    },
    catalogItem: {
      findMany: async (query: Record<string, unknown>) => {
        reads.push(query)
        // Only the first (available) bucket holds rows; the sold-out bucket is empty.
        return reads.length === 1 ? (input.rows ?? []) : []
      },
      findFirst: async (query: Record<string, unknown>) => {
        firsts.push(query)
        return input.findFirst?.(query) ?? null
      },
    },
    stockBalanceSource: { groupBy: async () => [] },
    $queryRaw: async (sql: { sql: string; values: unknown[] }) => {
      raws.push(sql)
      return (input.rows ?? []).map((entry) => ({ id: entry.id, out: false }))
    },
    catalogCategory: {
      findMany: async (query: Record<string, unknown>) => {
        categoryReads.push(query)
        return input.categories ?? []
      },
    },
    customerEntryPoint: { findFirst: async () => null },
  } as unknown as DbClient
  return { db, reads, firsts, categoryReads, raws }
}

/** The exact public item predicate every navigation group must hold. */
const eligible = {
  systemRole: null,
  tenantId: "tenant",
  status: "ACTIVE",
  archivedAt: null,
  offerings: {
    some: {
      tenantId: "tenant",
      status: "ACTIVE",
      archivedAt: null,
      variant: { status: "ACTIVE", archivedAt: null },
      storeAvailability: { some: { storeId: "store", isAvailable: true } },
    },
  },
}

test("paid storefronts expose root categories with their public subcategories", async () => {
  const { db, categoryReads } = repository("growth", {
    categories: [
      {
        id: "root-1",
        label: "Clothing",
        children: [
          { id: "sub-1", label: "Shirts" },
          { id: "sub-2", label: "Trousers" },
        ],
      },
      { id: "root-2", label: "Shoes", children: [] },
    ],
  })
  const store = await getPublicStorefront(db, "merchant")
  expect(store?.categories).toEqual([
    {
      id: "root-1",
      name: "Clothing",
      subcategories: [
        { id: "sub-1", name: "Shirts" },
        { id: "sub-2", name: "Trousers" },
      ],
    },
    { id: "root-2", name: "Shoes", subcategories: [] },
  ])
  expect(store?.subcategory).toBeNull()
  // Empty groups are hidden by the database read itself: roots and children each
  // need a currently public item in this Store, and children stay bounded.
  expect(categoryReads).toHaveLength(1)
  expect(categoryReads[0]).toMatchObject({
    where: { tenantId: "tenant", parentId: null, items: { some: eligible } },
    select: {
      children: {
        where: { subcategoryItems: { some: eligible } },
        take: 50,
      },
    },
  })
})

test("included plans and catalog-less projections never read or apply categories", async () => {
  const starter = repository("starter", { rows: [row("one")] })
  const store = await getPublicStorefront(starter.db, "merchant", undefined, {
    category: "root-1",
    subcategory: "sub-1",
  })
  expect(store?.categories).toEqual([])
  expect(store?.category).toBeNull()
  expect(store?.subcategory).toBeNull()
  expect(starter.categoryReads).toHaveLength(0)
  expect(JSON.stringify(starter.reads[0]?.where)).not.toContain("sub-1")
})

test("subcategory filters narrow the paid listing only inside their root category", async () => {
  const scoped = repository("growth", { rows: [row("shirt")] })
  const store = await getPublicStorefront(scoped.db, "merchant", undefined, {
    category: "root-1",
    subcategory: "sub-1",
  })
  expect(store?.category).toBe("root-1")
  expect(store?.subcategory).toBe("sub-1")
  expect(store?.items.map((item) => item.id)).toEqual(["shirt"])
  for (const read of scoped.reads)
    expect(JSON.stringify(read.where)).toContain(
      '"categoryId":"root-1","subcategoryId":"sub-1"',
    )
  expect(scoped.raws[0]?.sql.replace(/\s+/g, " ")).toContain(
    `AND i."categoryId" = ? AND i."subcategoryId" = ?`,
  )
  expect(scoped.raws[0]?.values).toContain("sub-1")

  // Without its root, or with an invalid id, a subcategory is ignored entirely.
  for (const options of [
    { subcategory: "sub-1" },
    { category: "root-1", subcategory: "bad/id" },
  ]) {
    const loose = repository("growth", { rows: [row("any")] })
    const result = await getPublicStorefront(
      loose.db,
      "merchant",
      undefined,
      options,
    )
    expect(result?.subcategory).toBeNull()
    for (const read of loose.reads)
      expect(JSON.stringify(read.where)).not.toContain("subcategoryId")
    for (const raw of loose.raws) expect(raw.sql).not.toContain("subcategoryId")
  }
})

test("default bucket cursors resolve and continue inside the same subcategory", async () => {
  const { db, reads, firsts, raws } = repository("growth", {
    rows: [row("shirt-2")],
    findFirst: () => row("shirt-1"),
  })
  const store = await getPublicStorefront(db, "merchant", "a:shirt-1", {
    category: "root-1",
    subcategory: "sub-1",
  })
  expect(store?.items.map((item) => item.id)).toEqual(["shirt-2"])
  // The cursor item must itself belong to the subcategory listing.
  expect(JSON.stringify(firsts[0]?.where)).toContain('"subcategoryId":"sub-1"')
  expect(raws[0]?.values).toContain("shirt-1")
  expect(raws[0]?.values).toContain("sub-1")
  expect(JSON.stringify(reads[0]?.where)).toContain('"subcategoryId":"sub-1"')

  // A cursor whose item is outside the subcategory is refused, not widened.
  const outside = repository("growth", { findFirst: () => null })
  expect(
    await getPublicStorefront(outside.db, "merchant", "a:shoe-1", {
      category: "root-1",
      subcategory: "sub-1",
    }),
  ).toBeNull()
})

test("advanced cursors bind to the subcategory and stay valid without one", () => {
  const listing = normalizePublicListing({ q: "shirt", sort: "name_asc" })
  const root = { storeId: "store", category: "root-1", listing }
  // Cursors issued before subcategories existed keep their exact binding.
  expect(publicListingBinding({ ...root, subcategory: null })).toBe(
    publicListingBinding(root),
  )
  const shirts = publicListingBinding({ ...root, subcategory: "sub-1" })
  const trousers = publicListingBinding({ ...root, subcategory: "sub-2" })
  expect(new Set([publicListingBinding(root), shirts, trousers]).size).toBe(3)
  const cursor = `s:${Buffer.from(JSON.stringify({ v: 1, h: shirts, m: "n", id: "shirt-50" })).toString("base64url")}`
  expect(decodePublicListingCursor(cursor, shirts, "name_asc")).toEqual({
    m: "n",
    id: "shirt-50",
  })
  expect(decodePublicListingCursor(cursor, trousers, "name_asc")).toBeNull()
})

test("price-sorted ids apply the subcategory inside the database order", () => {
  const sql = publicPriceSortedIdsSql({
    tenantId: "tenant",
    storeId: "store",
    currencyCode: "NGN",
    category: "root-1",
    subcategory: "sub-1",
    terms: [],
    availability: undefined,
    outVariantIds: [],
    direction: "asc",
    after: null,
    take: 51,
  })
  expect(sql.sql).toContain(`i."categoryId" = ?`)
  expect(sql.sql).toContain(`i."subcategoryId" = ?`)
  expect(sql.values).toContain("sub-1")
  const root = publicPriceSortedIdsSql({
    tenantId: "tenant",
    storeId: "store",
    currencyCode: "NGN",
    category: "root-1",
    terms: [],
    availability: undefined,
    outVariantIds: [],
    direction: "asc",
    after: null,
    take: 51,
  })
  expect(root.sql).not.toContain("subcategoryId")
})
