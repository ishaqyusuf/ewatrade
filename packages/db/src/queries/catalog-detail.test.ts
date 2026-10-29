import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  catalogChangeDirection,
  catalogOrderWhere,
  detailCursorWhere,
  detailPage,
  getCatalogItemDetail,
  getCatalogItemOverview,
} from "./catalog-detail"
const at = "2026-10-02T10:00:00.000Z"
test("overview overlaps a bounded authorized preview and preserves details when only that preview fails", async () => {
  for (const previewFails of [false, true]) {
    const graph = Promise.withResolvers<unknown>()
    let previewStarted = false
    const db = {
      catalogItem: {
        findFirst: async (args: { include?: unknown; where: unknown }) => {
          expect(args.where).toEqual({
            id: "item",
            tenantId: "tenant",
            systemRole: null,
          })
          return args.include ? graph.promise : null
        },
      },
      commercialOrderLine: {
        findFirst: async () => null,
        findMany: async (args: { take: number; where: { order: unknown } }) => {
          expect(args.take).toBe(3)
          expect(args.where.order).toEqual({
            tenantId: "tenant",
            storeId: "store",
            createdByUserId: "actor",
          })
          return []
        },
      },
      catalogPriceChange: {
        findMany: async (args: { take: number; where: unknown }) => {
          previewStarted = true
          expect(args.take).toBe(3)
          expect(args.where).toEqual({
            tenantId: "tenant",
            offering: { catalogItemId: "item" },
          })
          if (previewFails) throw new Error("preview unavailable")
          return []
        },
      },
      productFulfillment: { findMany: async () => [] },
      commercialServiceFulfillment: { findMany: async () => [] },
      stockOperation: {
        findMany: () => {
          throw new Error("Stock must not be read without Inventory access")
        },
      },
    } as unknown as PrismaClient
    const read = getCatalogItemOverview(db, {
      tenantId: "tenant",
      storeId: "store",
      itemId: "item",
      inventory: false,
      createdByUserId: "actor",
    })
    expect(previewStarted).toBe(true)
    graph.resolve({
      id: "item",
      name: "Service",
      kind: "SERVICE",
      status: "ACTIVE",
      createdAt: new Date(at),
      updatedAt: new Date(at),
      photoAssets: [],
      illustrations: [],
      optionGroups: [],
      product: null,
      service: { id: "service" },
      variants: [],
    })
    const result = await read
    expect(result?.item.id).toBe("item")
    expect(result?.inventoryAllowed).toBe(false)
    expect(result?.recentActivity).toEqual(
      previewFails
        ? null
        : { items: [], nextCursor: null, inventoryAllowed: false },
    )
  }
})
test("detail starts independent scoped order read before the item graph resolves, and still refuses a missing item", async () => {
  const item = Promise.withResolvers<null>()
  let lastOrderStarted = false
  const db = {
    catalogItem: { findFirst: () => item.promise },
    commercialOrderLine: {
      findFirst: async (args: { where: { order: unknown } }) => {
        lastOrderStarted = true
        expect(args.where.order).toEqual({
          tenantId: "tenant",
          storeId: "store",
          createdByUserId: "actor",
          status: { not: "CANCELLED" },
        })
        return null
      },
    },
  } as unknown as PrismaClient
  const read = getCatalogItemDetail(db, {
    tenantId: "tenant",
    storeId: "store",
    itemId: "missing",
    createdByUserId: "actor",
    inventory: false,
  })
  try {
    await Promise.resolve()
    expect(lastOrderStarted).toBe(true)
  } finally {
    item.resolve(null)
    expect(await read).toBeNull()
  }
})
describe("Catalog detail history", () => {
  test("Tenant/Store and immutable item snapshot constrain every order read", () => {
    expect(
      catalogOrderWhere({
        tenantId: "tenant",
        storeId: "store",
        itemId: "eggs",
        inventory: false,
      }),
    ).toEqual({
      order: { tenantId: "tenant", storeId: "store" },
      snapshot: { catalogItemId: "eggs" },
    })
  })
  test("same-time events page by source and id without loss", () => {
    const records = [
      "created:c",
      "orders:a",
      "stock:a",
      "price:a",
      "orders:z",
    ].map((key) => ({ at, key }))
    const first = detailPage(records, 2)
    expect(first.items.map((item) => item.key)).toEqual(["stock:a", "price:a"])
    const cursor = first.nextCursor
    expect(cursor).toEqual({ at, key: "price:a" })
    const rest = records.filter((record) => record.key < (cursor?.key ?? ""))
    const second = detailPage(rest, 2)
    expect(second.items.map((item) => item.key)).toEqual([
      "orders:z",
      "orders:a",
    ])
    expect(
      detailPage(
        rest.filter((record) => record.key < (second.nextCursor?.key ?? "")),
        2,
      ).items.map((item) => item.key),
    ).toEqual(["created:c"])
  })
  test("cursor constraints bound each source before database take", () => {
    const cursor = { at, key: "price:m" }
    expect<Record<string, unknown>>(
      detailCursorWhere("price", "effectiveAt", cursor),
    ).toEqual({
      OR: [
        { effectiveAt: { lt: new Date(at) } },
        { effectiveAt: new Date(at), id: { lt: "m" } },
      ],
    })
    expect<Record<string, unknown>>(
      detailCursorWhere("stock", "effectiveAt", cursor),
    ).toEqual({
      OR: [{ effectiveAt: { lt: new Date(at) } }],
    })
    expect<Record<string, unknown>>(
      detailCursorWhere("orders", "createdAt", cursor),
    ).toEqual({
      OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at) }],
    })
  })
  test("newer events precede IDs and final pages have no next cursor", () => {
    expect(
      detailPage(
        [
          { at, key: "stock:z" },
          { at: "2026-10-03T10:00:00.000Z", key: "created:a" },
        ],
        2,
      ),
    ).toEqual({
      items: [
        { at: "2026-10-03T10:00:00.000Z", key: "created:a" },
        { at, key: "stock:z" },
      ],
      nextCursor: null,
    })
  })
})

test("order facts use original snapshot pricing and exact quantity", async () => {
  const { serializeCatalogOrderLine } = await import("./catalog-detail")
  const fact = serializeCatalogOrderLine({
    id: "line",
    orderId: "order",
    createdAt: new Date(at),
    quantity: "9",
    unitPriceMinor: 99999,
    totalMinor: 899991,
    order: {
      orderNumber: "ORD-1",
      customerName: "Customer",
      status: "CANCELLED",
      currencyCode: "NGN",
      createdByUserId: "actor",
    },
    snapshot: {
      currencyCode: "NGN",
      variantName: "Small",
      inventoryUnitName: "Crate",
      offeringName: "Small Crate",
      quantity: "2.000001",
      unitPriceMinor: 480000,
      totalMinor: 960000,
    },
  })
  expect(fact).toMatchObject({
    quantity: "2.000001",
    unitPriceMinor: 480000,
    totalMinor: 960000,
    variantName: "Small",
    unitName: "Crate",
    status: "CANCELLED",
  })
})

test("direction preserves fractional stock comparisons and mixed movements", async () => {
  const { Prisma } = await import("../../generated/prisma/client")
  const before = new Prisma.Decimal("9007199254740992.000001")
  const more = new Prisma.Decimal("9007199254740992.000002")
  const less = new Prisma.Decimal("9007199254740992.000000")
  expect(catalogChangeDirection([more.comparedTo(before)])).toBe("increase")
  expect(catalogChangeDirection([less.comparedTo(before)])).toBe("decrease")
  expect(
    catalogChangeDirection([more.comparedTo(before), less.comparedTo(before)]),
  ).toBe("mixed")
  expect(catalogChangeDirection([before.comparedTo(before)])).toBeNull()
  expect(catalogChangeDirection([])).toBeNull()
})
