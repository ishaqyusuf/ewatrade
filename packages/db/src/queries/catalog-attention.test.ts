import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { listCatalogItemsPage } from "./catalog"
import {
  getCatalogAttentionSummary,
  listCatalogAttentionItemIds,
} from "./catalog-attention"

type Balance = {
  storeId: string
  onHand: string
  reserved?: string
  kind?: "SHARED_POOL" | "PACKAGED_STOCK"
  inventoryUnitId?: string
}

function record(
  id: string,
  options: {
    service?: boolean
    price?: number | null
    policy?: "FIXED" | "QUOTE_REQUIRED" | "ORDER_TOTAL"
    balances?: Balance[]
    packaged?: boolean
  } = {},
) {
  return {
    id,
    kind: options.service ? "SERVICE" : "PRODUCT",
    product: options.service
      ? null
      : {
          currentUnitConfiguration: {
            units: [
              { id: "base", stockBehavior: "CANONICAL_SHARED" },
              { id: "pack", stockBehavior: "PACKAGED_STOCK" },
            ],
          },
          stockBalanceSources: (options.balances ?? []).map((balance) => ({
            inventoryUnitId: balance.inventoryUnitId ?? "base",
            kind: balance.kind ?? "SHARED_POOL",
            onHandQuantity: balance.onHand,
            reservedQuantity: balance.reserved ?? "0",
            storeId: balance.storeId,
            variantId: `${id}-v`,
          })),
        },
    variants: [
      {
        id: `${id}-v`,
        isDefault: true,
        offerings: [
          {
            fixedPriceMinor: options.price === undefined ? 1000 : options.price,
            pricingPolicy: options.policy ?? "FIXED",
            productUnitOffering: options.service
              ? null
              : { inventoryUnitId: options.packaged ? "pack" : "base" },
          },
        ],
      },
    ],
  }
}

/** A catalogItem delegate that honours the scan's id cursor and Store filter. */
function fixture(records: ReturnType<typeof record>[]) {
  const scans: Array<{ where: Record<string, unknown>; select?: unknown }> = []
  const pageQueries: Array<{ where: Record<string, unknown> }> = []
  const db = {
    catalogItem: {
      findMany: async (query: {
        cursor?: { id: string }
        include?: unknown
        select?: {
          product: {
            select: {
              stockBalanceSources: { where: { storeId: string } }
            }
          }
        }
        skip?: number
        take?: number
        where: Record<string, unknown>
      }) => {
        if (!query.select) {
          pageQueries.push(query)
          return []
        }
        scans.push(query)
        const storeId =
          query.select.product.select.stockBalanceSources.where.storeId
        const kind = query.where.kind
        const sorted = records
          .filter((row) => !kind || row.kind === kind)
          .sort((a, b) => a.id.localeCompare(b.id))
        const start = query.cursor
          ? sorted.findIndex((row) => row.id === query.cursor?.id) +
            (query.skip ?? 0)
          : 0
        return sorted
          .slice(start, start + (query.take ?? sorted.length))
          .map((row) => ({
            ...row,
            product: row.product && {
              ...row.product,
              stockBalanceSources: row.product.stockBalanceSources.filter(
                (balance) => balance.storeId === storeId,
              ),
            },
          }))
      },
      count: async () => 0,
      findFirst: async () => null,
    },
  }
  return { db: db as unknown as PrismaClient, pageQueries, scans }
}

test("summary counts every item in the business, past the scan batch size", async () => {
  const many = Array.from({ length: 1203 }, (_, index) =>
    record(`item-${String(index).padStart(4, "0")}`, {
      balances: [{ storeId: "store-a", onHand: "5" }],
    }),
  )
  const state = fixture([
    ...many,
    record("z-no-price", { price: null }),
    record("z-order-total", { policy: "ORDER_TOTAL", price: null }),
    record("z-quote-service", {
      service: true,
      policy: "QUOTE_REQUIRED",
      price: null,
    }),
    record("z-not-counted"),
    record("z-sold-out", {
      balances: [{ storeId: "store-a", onHand: "2", reserved: "2" }],
    }),
  ])
  const summary = await getCatalogAttentionSummary(state.db, {
    storeId: "store-a",
    tenantId: "tenant",
  })
  expect(summary).toEqual({
    all: 1208,
    product: 1207,
    service: 1,
    no_price: 2,
    not_counted: 1,
    out_of_stock: 1,
    storeId: "store-a",
  })
  // 1208 items read in id-ordered batches of 500.
  expect(state.scans).toHaveLength(3)
  for (const scan of state.scans)
    expect(scan.where).toMatchObject({ tenantId: "tenant", systemRole: null })
})

test("stock is judged in the requested Store only", async () => {
  const items = [
    record("only-elsewhere", {
      balances: [{ storeId: "store-b", onHand: "9" }],
    }),
    record("empty-here", {
      balances: [
        { storeId: "store-a", onHand: "0" },
        { storeId: "store-b", onHand: "9" },
      ],
    }),
    record("packaged", {
      packaged: true,
      balances: [
        { storeId: "store-a", onHand: "4" },
        {
          storeId: "store-a",
          onHand: "0",
          kind: "PACKAGED_STOCK",
          inventoryUnitId: "pack",
        },
      ],
    }),
  ]
  const storeA = await getCatalogAttentionSummary(fixture(items).db, {
    storeId: "store-a",
    tenantId: "tenant",
  })
  expect(storeA).toMatchObject({ not_counted: 1, out_of_stock: 2 })
  const storeB = await getCatalogAttentionSummary(fixture(items).db, {
    storeId: "store-b",
    tenantId: "tenant",
  })
  expect(storeB).toMatchObject({ not_counted: 1, out_of_stock: 0 })
})

test("kind narrows the scan and the problem ids", async () => {
  const state = fixture([
    record("goods-no-price", { price: null }),
    record("service-no-price", { service: true, price: null }),
  ])
  expect(
    await listCatalogAttentionItemIds(state.db, {
      attention: "no_price",
      kind: "service",
      storeId: "store-a",
      tenantId: "tenant",
    }),
  ).toEqual(["service-no-price"])
  expect(state.scans[0]?.where).toMatchObject({ kind: "SERVICE" })
})

test("the attention filter limits the page to matching ids", async () => {
  const state = fixture([
    record("a-ok", { balances: [{ storeId: "store-a", onHand: "3" }] }),
    record("b-sold-out", { balances: [{ storeId: "store-a", onHand: "0" }] }),
  ])
  await listCatalogItemsPage(state.db, {
    attention: "out_of_stock",
    attentionStoreId: "store-a",
    limit: 20,
    sort: { field: "name", direction: "asc" },
    tenantId: "tenant",
  })
  expect(state.pageQueries[0]?.where).toMatchObject({
    id: { in: ["b-sold-out"] },
    tenantId: "tenant",
  })
})
