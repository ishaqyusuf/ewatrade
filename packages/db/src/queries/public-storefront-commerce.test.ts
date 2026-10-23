import { expect, test } from "bun:test"
import { getPublicStorefront } from "./public-storefront"
import type { DbClient } from "./types"

function row(id: string, out = false) {
  return {
    id,
    name: `Item ${id}`,
    kind: "PRODUCT",
    description: "Public description",
    categoryRecord: { id: "category-1", label: "Bags" },
    illustrations: [],
    privateNote: "never public",
    offerings: [
      {
        id: `offer-${id}`,
        name: "Pair",
        fixedPriceMinor: 1850000,
        currencyCode: "NGN",
        pricingPolicy: "FIXED",
        availabilityAttestations: [{ id: "stale-private-source-commitment" }],
        supplierCostMinor: 99,
        variant: {
          id: `variant-${id}`,
          name: "Standard",
          isDefault: true,
          stockBalanceSources: out
            ? [
                {
                  inventoryUnitId: "pair",
                  onHandQuantity: "0",
                  reservedQuantity: "0",
                },
              ]
            : [],
        },
      },
    ],
  }
}
function repository(
  plan: "starter" | "growth",
  pages: ReturnType<typeof row>[][],
  cursor: ReturnType<typeof row> | null = null,
) {
  const reads: unknown[] = []
  let categoryReads = 0
  let stockReads = 0
  const db = {
    tenant: {
      findFirst: async () => ({
        id: "tenant",
        name: "QA merchant",
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
      findMany: async (query: unknown) => {
        reads.push(query)
        return pages.shift() ?? []
      },
      findFirst: async () => cursor,
    },
    stockBalanceSource: {
      groupBy: async () => {
        stockReads++
        return [
          {
            variantId: "variant-out-1",
            inventoryUnitId: "pair",
            _sum: { onHandQuantity: "0", reservedQuantity: "0" },
          },
          {
            variantId: "variant-out-2",
            inventoryUnitId: "pair",
            _sum: { onHandQuantity: "0", reservedQuantity: "0" },
          },
        ]
      },
    },
    catalogCategory: {
      findMany: async () => {
        categoryReads++
        return [{ id: "category-1", label: "Bags" }]
      },
    },
    customerEntryPoint: { findFirst: async () => null },
  } as unknown as DbClient
  return { db, reads, counters: () => ({ categoryReads, stockReads }) }
}

test("Starter detail links cannot expose a fourth item or enable paid filtering", async () => {
  const { db, reads, counters } = repository("starter", [
    [row("one"), row("two"), row("three"), row("four")],
  ])
  const store = await getPublicStorefront(db, "merchant", undefined, {
    category: "category-1",
    item: "four",
  })
  expect(store?.items).toHaveLength(3)
  expect(store?.highlightedItem).toBeNull()
  expect(store?.category).toBeNull()
  expect(store?.categories).toEqual([])
  expect(store?.hasHiddenItems).toBe(true)
  expect(store?.items.every((item) => item.availability === null)).toBe(true)
  expect(counters()).toEqual({ categoryReads: 0, stockReads: 0 })
  expect(reads[0]).toMatchObject({
    take: 4,
    where: {
      tenantId: "tenant",
      systemRole: null,
      status: "ACTIVE",
      archivedAt: null,
      OR: [
        { kind: "SERVICE" },
        {
          kind: "PRODUCT",
          product: { is: { usage: { in: ["FOR_SALE", "BOTH"] } } },
        },
      ],
      offerings: {
        some: {
          tenantId: "tenant",
          status: "ACTIVE",
          archivedAt: null,
          variant: { status: "ACTIVE", archivedAt: null },
          storeAvailability: { some: { storeId: "store", isAvailable: true } },
        },
      },
    },
  })
  const dto = JSON.stringify(store)
  for (const privateField of [
    "onHandQuantity",
    "reservedQuantity",
    "stockBalanceSources",
    "supplierCostMinor",
    "privateNote",
    "stale-private-source-commitment",
    "attestedByUserId",
  ])
    expect(dto).not.toContain(privateField)
  expect(store?.items[0]).toMatchObject({
    availability: null,
    priceMinor: 1850000,
    description: "Public description",
  })
})

test("paid categories constrain the server query before its bounded page", async () => {
  const { db, reads } = repository("growth", [[row("one")], []])
  const store = await getPublicStorefront(db, "merchant", undefined, {
    category: "category-1",
  })
  expect(store?.category).toBe("category-1")
  expect(reads[0]).toMatchObject({
    take: 51,
    where: { AND: [{ tenantId: "tenant", categoryId: "category-1" }, {}] },
  })
})

test("paid pagination crosses into sold-out entries without losing the bucket cursor", async () => {
  const normal = Array.from({ length: 49 }, (_, index) => row(`item-${index}`))
  const first = repository("growth", [
    normal,
    [row("out-1", true), row("out-2", true)],
  ])
  const page = await getPublicStorefront(first.db, "merchant")
  expect(page?.items).toHaveLength(50)
  expect(page?.items.at(-1)?.availability).toBe("OUT_OF_STOCK")
  expect(page?.nextCursor).toBe("o:out-1")
  const next = repository("growth", [[row("out-2", true)]], row("out-1", true))
  const secondPage = await getPublicStorefront(
    next.db,
    "merchant",
    page?.nextCursor ?? undefined,
  )
  expect(secondPage?.items.map((item) => item.id)).toEqual(["out-2"])
  expect(secondPage?.nextCursor).toBeNull()
  expect(next.reads).toHaveLength(1)
  expect(next.reads[0]).toMatchObject({ cursor: { id: "out-1" }, skip: 1 })
})
