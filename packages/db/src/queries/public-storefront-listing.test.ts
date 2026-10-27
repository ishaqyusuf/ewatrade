import { expect, test } from "bun:test"
import { getPublicStorefront } from "./public-storefront"
import {
  applyCappedListing,
  decodePublicListingCursor,
  encodePublicListingCursor,
  normalizePublicListing,
  publicListingBinding,
  publicListingSearchWhere,
  publicPriceSortedIdsSql,
} from "./public-storefront-listing"
import type { DbClient } from "./types"

type Offer = { price: number | null; currency?: string; policy?: string }

test("literal wildcard characters and every bounded search term are retained", () => {
  const query = normalizePublicListing({
    q: "100% a_b c\\d one two three four five six seven eight nine",
  })
  expect(query.terms).toHaveLength(12)
  expect(query.terms.slice(0, 3)).toEqual(["100%", "a_b", "c\\d"])
  expect(publicListingSearchWhere(query.terms)[0]).toMatchObject({
    OR: [
      { name: { contains: "100\\%" } },
      { description: { contains: "100\\%" } },
    ],
  })
  expect(publicListingSearchWhere(query.terms)[1]).toMatchObject({
    OR: [
      { name: { contains: "a\\_b" } },
      { description: { contains: "a\\_b" } },
    ],
  })
  const listing = normalizePublicListing({ q: "%" })
  expect(
    applyCappedListing(
      [
        {
          id: "one",
          name: "Plain",
          description: null,
          priceMinor: null,
          currencyCode: "NGN",
          availability: null,
        },
      ],
      listing,
      "NGN",
    ),
  ).toEqual([])
})

function row(
  id: string,
  input: { name?: string; out?: boolean; offers?: Offer[] } = {},
) {
  return {
    id,
    name: input.name ?? `Item ${id}`,
    kind: "PRODUCT",
    description: null,
    categoryRecord: null,
    illustrations: [],
    offerings: (input.offers ?? [{ price: 1000 }]).map((offer, index) => ({
      id: `offer-${id}-${index}`,
      name: `Option ${index}`,
      fixedPriceMinor: offer.price,
      currencyCode: offer.currency ?? "NGN",
      pricingPolicy: offer.policy ?? "FIXED",
      variant: {
        id: input.out ? `variant-out-${id}` : `variant-${id}-${index}`,
        name: "Standard",
        isDefault: true,
        stockBalanceSources: input.out
          ? [
              {
                inventoryUnitId: "u",
                onHandQuantity: "0",
                reservedQuantity: "0",
              },
            ]
          : [],
      },
    })),
  }
}
type Row = ReturnType<typeof row>

function repository(
  plan: "starter" | "growth",
  handlers: {
    findMany?: (query: Record<string, unknown>) => Row[]
    findFirst?: (query: Record<string, unknown>) => Row | null
    queryRaw?: (sql: { sql: string; values: unknown[] }) => unknown[]
    outVariants?: string[]
  } = {},
) {
  const reads: Record<string, unknown>[] = []
  const firsts: Record<string, unknown>[] = []
  const raws: { sql: string; values: unknown[] }[] = []
  const groupBys: Record<string, unknown>[] = []
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
        return handlers.findMany?.(query) ?? []
      },
      findFirst: async (query: Record<string, unknown>) => {
        firsts.push(query)
        return handlers.findFirst?.(query) ?? null
      },
    },
    stockBalanceSource: {
      groupBy: async (query: Record<string, unknown>) => {
        groupBys.push(query)
        return (handlers.outVariants ?? []).map((variantId) => ({
          variantId,
          inventoryUnitId: "u",
          _sum: { onHandQuantity: "0", reservedQuantity: "0" },
        }))
      },
    },
    $queryRaw: async (sql: { sql: string; values: unknown[] }) => {
      raws.push(sql)
      return handlers.queryRaw?.(sql) ?? []
    },
    catalogCategory: { findMany: async () => [] },
    customerEntryPoint: { findFirst: async () => null },
  } as unknown as DbClient
  return { db, reads, firsts, raws, groupBys }
}

const searchTerm = (term: string) => ({
  OR: [
    { name: { contains: term, mode: "insensitive" } },
    { description: { contains: term, mode: "insensitive" } },
  ],
})

test("included plans cap the first N entries before search, filter and sort", async () => {
  const capped = [
    row("one"),
    row("two"),
    row("three"),
    row("four", { name: "Hidden gem" }),
  ]
  const hidden = repository("starter", { findMany: () => capped })
  const store = await getPublicStorefront(hidden.db, "merchant", undefined, {
    q: "gem",
    sort: "name_asc",
    item: "four",
  })
  expect(store?.items).toEqual([])
  expect(store?.highlightedItem).toBeNull()
  expect(store?.hasHiddenItems).toBe(true)
  expect(store?.nextCursor).toBeNull()
  expect(store?.categories).toEqual([])
  expect(store?.query).toEqual({ q: "gem", sort: "name_asc" })
  // The capped read carries no listing filter and no cursor.
  expect(hidden.reads).toHaveLength(1)
  expect(hidden.reads[0]?.take).toBe(4)
  expect(JSON.stringify(hidden.reads[0]?.where)).not.toContain("gem")
  expect(hidden.raws).toHaveLength(0)

  const visible = repository("starter", { findMany: () => capped })
  const narrowed = await getPublicStorefront(visible.db, "merchant", "o:four", {
    q: "  TWO ",
    item: "three",
  })
  expect(narrowed?.items.map((item) => item.id)).toEqual(["two"])
  // Deep links stay independent of the active search inside the cap.
  expect(narrowed?.highlightedItem?.id).toBe("three")
})

test("paid search and availability constrain the server query before its bounded page", async () => {
  const { db, reads, groupBys } = repository("growth", {
    findMany: () => [row("bag-1")],
    outVariants: ["variant-out-x"],
  })
  const store = await getPublicStorefront(db, "merchant", undefined, {
    q: "red 50%_bag",
    availability: "available",
    category: "category-1",
  })
  expect(store?.items.map((item) => item.id)).toEqual(["bag-1"])
  expect(store?.query).toEqual({ q: "red 50%_bag", availability: "available" })
  const where = {
    AND: [
      { tenantId: "tenant", categoryId: "category-1", systemRole: null },
      searchTerm("red"),
      searchTerm("50\\%\\_bag"),
    ],
  }
  expect(groupBys[0]).toMatchObject({
    where: { variant: { catalogItem: where } },
  })
  // Available-only reads just the in-stock bucket, filtered, then takes limit + 1.
  expect(reads).toHaveLength(1)
  expect(reads[0]).toMatchObject({
    take: 51,
    where: { AND: [where, { NOT: { kind: "PRODUCT" } }] },
  })
})

test("advanced cursors are query-bound; malformed, stale and legacy cursors refuse", async () => {
  const listing = normalizePublicListing({ q: "bag", sort: "name_asc" })
  const binding = publicListingBinding({
    storeId: "store",
    category: null,
    listing,
  })
  const valid = encodePublicListingCursor(binding, { m: "n", id: "bag-50" })
  expect(valid).toMatch(/^s:[A-Za-z0-9_-]+$/)
  expect(decodePublicListingCursor(valid ?? "", binding, "name_asc")).toEqual({
    m: "n",
    id: "bag-50",
  })
  // Same cursor under a different sort mode, query or Store is stale.
  expect(
    decodePublicListingCursor(valid ?? "", binding, "price_asc"),
  ).toBeNull()
  const other = publicListingBinding({
    storeId: "store",
    category: null,
    listing: normalizePublicListing({ q: "shoe", sort: "name_asc" }),
  })
  expect(decodePublicListingCursor(valid ?? "", other, "name_asc")).toBeNull()
  for (const malformed of [
    "s:",
    "s:!!!",
    `s:${Buffer.from("not json").toString("base64url")}`,
    `s:${Buffer.from(JSON.stringify({ v: 1, h: binding, m: "n", id: "a:b" })).toString("base64url")}`,
    `s:${Buffer.from(JSON.stringify({ v: 1, h: binding, m: "p", p: -1, id: "x" })).toString("base64url")}`,
    `s:${"A".repeat(1537)}`,
  ])
    expect(decodePublicListingCursor(malformed, binding, "name_asc")).toBeNull()

  for (const after of [
    "a:bag-50",
    "bag-50",
    valid?.replace("s:", "s:x") ?? "",
  ]) {
    const { db, reads } = repository("growth")
    expect(
      await getPublicStorefront(db, "merchant", after, {
        q: "bag",
        sort: "name_asc",
      }),
    ).toBeNull()
    expect(reads).toHaveLength(0)
  }
  // An advanced cursor is not accepted by the unchanged default listing.
  const plain = repository("growth")
  expect(
    await getPublicStorefront(plain.db, "merchant", valid ?? ""),
  ).toBeNull()
})

test("name sort pages by name then id with a validated, filtered cursor row", async () => {
  const page = Array.from({ length: 51 }, (_, index) =>
    row(`n${String(index).padStart(2, "0")}`, { name: "Same" }),
  )
  const first = repository("growth", { findMany: () => page })
  const store = await getPublicStorefront(first.db, "merchant", undefined, {
    sort: "name_desc",
  })
  expect(first.groupBys).toHaveLength(0)
  expect(first.reads[0]).toMatchObject({
    orderBy: [{ name: "desc" }, { id: "asc" }],
    take: 51,
  })
  expect(store?.items).toHaveLength(50)
  const next = repository("growth", {
    findFirst: () => row("n49"),
    findMany: () => [page[50] as Row],
  })
  const second = await getPublicStorefront(
    next.db,
    "merchant",
    store?.nextCursor ?? "",
    {
      sort: "name_desc",
    },
  )
  expect(next.firsts[0]).toMatchObject({
    where: { AND: [{ AND: [{ tenantId: "tenant" }] }, { id: "n49" }] },
  })
  expect(next.reads[0]).toMatchObject({ cursor: { id: "n49" }, skip: 1 })
  expect(second?.items.map((item) => item.id)).toEqual(["n50"])
  expect(second?.nextCursor).toBeNull()
  // A cursor row that no longer matches the filtered listing is stale.
  const gone = repository("growth")
  expect(
    await getPublicStorefront(gone.db, "merchant", store?.nextCursor ?? "", {
      sort: "name_desc",
    }),
  ).toBeNull()
})

test("price sort orders in SQL, re-reads through Prisma and keysets on price then id", async () => {
  const sqlPage = [
    ...Array.from({ length: 49 }, (_, index) => ({
      id: `p${index}`,
      price: 100 + index,
    })),
    { id: "tie-a", price: null },
    { id: "tie-b", price: null },
  ]
  const first = repository("growth", {
    queryRaw: () => sqlPage,
    // A row dropped by the exact Prisma re-read is never shown.
    findMany: (query) =>
      (query.where as { AND: [unknown, { id: { in: string[] } }] }).AND[1].id.in
        .filter((id) => id !== "p3")
        .reverse()
        .map((id) => row(id)),
  })
  const store = await getPublicStorefront(first.db, "merchant", undefined, {
    sort: "price_desc",
    q: "bag",
  })
  expect(store?.items.map((item) => item.id).slice(0, 4)).toEqual([
    "p0",
    "p1",
    "p2",
    "p4",
  ])
  expect(store?.items.at(-1)?.id).toBe("tie-a")
  expect(store?.items).toHaveLength(49)
  expect(first.reads[0]).toMatchObject({
    where: {
      AND: [
        { AND: [{ AND: [{ tenantId: "tenant" }, searchTerm("bag")] }] },
        { id: {} },
      ],
    },
  })
  expect(first.raws[0]?.values).toContain("%bag%")
  const next = repository("growth", {
    queryRaw: () => [{ id: "tie-b", price: null }],
    findMany: () => [row("tie-b")],
  })
  const second = await getPublicStorefront(
    next.db,
    "merchant",
    store?.nextCursor ?? "",
    {
      sort: "price_desc",
      q: "bag",
    },
  )
  expect(second?.items.map((item) => item.id)).toEqual(["tie-b"])
  expect(next.raws[0]?.sql).toContain(
    'WHERE price IS NULL AND id COLLATE "C" > ?',
  )
  expect(next.raws[0]?.values).toContain("tie-a")
  // Same cursor under ascending price refuses as stale.
  const stale = repository("growth")
  expect(
    await getPublicStorefront(stale.db, "merchant", store?.nextCursor ?? "", {
      sort: "price_asc",
      q: "bag",
    }),
  ).toBeNull()
  expect(stale.raws).toHaveLength(0)
})

test("price SQL mirrors the public predicate and comparable-price semantics", () => {
  const sql = publicPriceSortedIdsSql({
    tenantId: "tenant",
    storeId: "store",
    currencyCode: "NGN",
    category: "category-1",
    terms: ["bag"],
    availability: "out_of_stock",
    outVariantIds: ["v1"],
    direction: "asc",
    after: { p: 500, id: "item-9" },
    take: 51,
  })
  const text = sql.sql.replace(/\s+/g, " ")
  for (const predicate of [
    `i."tenantId" = ?`,
    `i.status = 'ACTIVE' AND i."archivedAt" IS NULL`,
    `i."systemRole" IS NULL`,
    `p.usage IN ('FOR_SALE', 'BOTH')`,
    `o."tenantId" = ? AND o.status = 'ACTIVE' AND o."archivedAt" IS NULL`,
    `v.status = 'ACTIVE' AND v."archivedAt" IS NULL`,
    `a."storeId" = ? AND a."isAvailable" = true`,
    `i."categoryId" = ?`,
    "(i.name ILIKE ? OR i.description ILIKE ?)",
    `o."pricingPolicy" = 'FIXED' AND o."fixedPriceMinor" IS NOT NULL AND o."currencyCode" = ?`,
    `HAVING (i.kind = 'PRODUCT' AND bool_and(o."variantId" = ANY(?::text[])))`,
    `WHERE price IS NULL OR price > ? OR (price = ? AND id COLLATE "C" > ?)`,
    `ORDER BY price IS NULL, price ASC, id COLLATE "C" LIMIT ?`,
  ])
    expect(text).toContain(predicate)
  expect(sql.values).toEqual([
    "NGN",
    "tenant",
    "tenant",
    "store",
    "category-1",
    "%bag%",
    "%bag%",
    ["v1"],
    500,
    500,
    "item-9",
    51,
  ])
  const descending = publicPriceSortedIdsSql({
    tenantId: "t",
    storeId: "s",
    currencyCode: "NGN",
    category: null,
    terms: [],
    availability: "available",
    outVariantIds: [],
    direction: "desc",
    after: null,
    take: 4,
  }).sql.replace(/\s+/g, " ")
  expect(descending).toContain("HAVING NOT (i.kind = 'PRODUCT'")
  expect(descending).toContain("ORDER BY price IS NULL, price DESC")
  expect(descending).not.toContain("categoryId")
  expect(descending).not.toContain("WHERE price")
})

test("capped sort: ranges use the minimum, unknown or mixed currency last both ways, ties by id", async () => {
  const rows = [
    row("range", { offers: [{ price: 900 }, { price: 250 }] }),
    row("quoted", {
      offers: [{ price: 100 }, { price: null, policy: "QUOTE" }],
    }),
    row("mixed", { offers: [{ price: 50 }, { price: 50, currency: "USD" }] }),
    row("usd", { offers: [{ price: 10, currency: "USD" }] }),
    row("b-tie", { name: "Alpha", offers: [{ price: 300 }] }),
    row("a-tie", { name: "Alpha", offers: [{ price: 300 }] }),
  ]
  const project =
    (
      await getPublicStorefront(
        repository("growth", { findMany: () => rows }).db,
        "merchant",
      )
    )?.items ?? []
  const order = (sort: "price_asc" | "price_desc" | "name_asc" | "name_desc") =>
    applyCappedListing(
      [...project],
      normalizePublicListing({ sort }),
      "NGN",
    ).map((item) => item.id)
  expect(order("price_asc")).toEqual([
    "range",
    "a-tie",
    "b-tie",
    "mixed",
    "quoted",
    "usd",
  ])
  expect(order("price_desc")).toEqual([
    "a-tie",
    "b-tie",
    "range",
    "mixed",
    "quoted",
    "usd",
  ])
  expect(order("name_asc").slice(0, 2)).toEqual(["a-tie", "b-tie"])
  expect(order("name_desc").slice(-2)).toEqual(["a-tie", "b-tie"])
  expect(
    applyCappedListing(
      [
        ...project,
        {
          ...project[0],
          id: "sold",
          availability: "OUT_OF_STOCK",
        } as (typeof project)[number],
      ],
      normalizePublicListing({ availability: "out_of_stock" }),
      "NGN",
    ).map((item) => item.id),
  ).toEqual(["sold"])
})

test("paid deep links ignore search, availability and category but keep public eligibility", async () => {
  const { db, firsts } = repository("growth", {
    findMany: () => [],
    findFirst: () => row("outside"),
  })
  const store = await getPublicStorefront(db, "merchant", undefined, {
    q: "nomatch",
    availability: "out_of_stock",
    category: "category-1",
    item: "outside",
  })
  expect(store?.items).toEqual([])
  expect(store?.highlightedItem?.id).toBe("outside")
  const where = JSON.stringify(firsts.at(-1)?.where)
  expect(where).not.toContain("nomatch")
  expect(where).not.toContain("category-1")
  expect(firsts.at(-1)).toMatchObject({
    where: {
      AND: [
        {
          tenantId: "tenant",
          status: "ACTIVE",
          archivedAt: null,
          systemRole: null,
          offerings: {
            some: {
              storeAvailability: {
                some: { storeId: "store", isAvailable: true },
              },
            },
          },
        },
        { id: "outside" },
      ],
    },
  })
})
