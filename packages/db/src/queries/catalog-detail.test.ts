import { describe, expect, test } from "bun:test"
import {
  catalogChangeDirection,
  catalogOrderWhere,
  detailCursorWhere,
  detailPage,
} from "./catalog-detail"
const at = "2026-10-02T10:00:00.000Z"
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
