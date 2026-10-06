import { describe, expect, test } from "bun:test"
import {
  type OrderCatalogItem,
  availableOrderOfferings,
  buildOrderLines,
  changeOrderOption,
  makeOrderDraftLine,
  orderCatalogChoices,
  parseOrderItemTotal,
} from "./order-draft"

function eggs(): OrderCatalogItem {
  const units = [
    {
      id: "egg",
      key: "egg",
      name: "Egg",
      factor: "1",
      stockBehavior: "canonical_shared" as const,
      symbol: null,
      transactionScale: 0,
    },
    {
      id: "crate",
      key: "crate",
      name: "Crate",
      factor: "30",
      stockBehavior: "alternate_transaction" as const,
      symbol: null,
      transactionScale: 0,
    },
  ]
  return {
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    id: "eggs",
    name: "Eggs",
    slug: "eggs",
    kind: "product",
    status: "active",
    category: null,
    categoryId: null,
    subcategoryId: null,
    description: null,
    illustrations: [],
    photos: [],
    imageLinks: [],
    imageUrl: null,
    service: null,
    optionGroups: [
      {
        id: "size",
        key: "size",
        name: "Size",
        values: [
          { id: "small", key: "small", label: "Small" },
          { id: "big", key: "big", label: "Big" },
        ],
      },
    ],
    product: {
      id: "product",
      usage: "FOR_SALE",
      updatedAt: "2026-10-06T00:00:00.000Z",
      currentUnitConfiguration: {
        id: "config",
        version: 1,
        canonicalBalanceScale: 0,
        units,
      },
      stockBalances: ["small", "big"].map((id) => ({
        id: `balance-${id}`,
        inventoryUnitId: "egg",
        inventoryUnitName: "Egg",
        kind: "shared_pool",
        onHandQuantity: "300",
        reservedQuantity: "0",
        revision: 7,
        storeId: "store",
        variantId: id,
        variantName: id,
      })),
    },
    variants: ["small", "big"].map((id) => ({
      id,
      key: id,
      name: id,
      description: null,
      imageUrl: null,
      isDefault: false,
      status: "active",
      selections: [
        { groupId: "size", groupKey: "size", valueId: id, valueKey: id },
      ],
      offerings: units.map((unit) => ({
        id: `${id}-${unit.id}`,
        key: unit.key,
        name: `${id} ${unit.name}`,
        status: "active",
        currencyCode: "NGN",
        fixedPriceMinor: unit.id === "crate" ? 450000 : 15000,
        kind: "product_unit",
        pricingPolicy: "fixed",
        productUnit: { inventoryUnitId: unit.id, barcode: null, sku: null },
        service: null,
        serviceWorkPolicy: null,
        stores: [{ storeId: "store", isAvailable: true }],
      })),
    })),
  }
}

describe("catalog-first order drafts", () => {
  test("manual totals retain exact money, require explicit mode, and reset with choice", () => {
    const item = eggs()
    const manual = item.variants[0]?.offerings[0]
    const unset = item.variants[1]?.offerings[0]
    if (!manual || !unset) throw new Error("Fixture choices missing")
    manual.pricingPolicy = "order_total"
    manual.fixedPriceMinor = null
    unset.fixedPriceMinor = null
    const offerings = availableOrderOfferings([item], "store")
    const chosen = offerings.find((row) => row.id === manual.id)
    if (!chosen) throw new Error("Manual choice missing")
    expect(chosen.disabledReason).toBeUndefined()
    expect(
      offerings.find((row) => row.id === unset.id)?.disabledReason,
    ).toContain("Price")
    const draft = {
      ...makeOrderDraftLine(item, chosen),
      quantity: "3",
      totalPrice: "100.01",
      note: "  Live weight 12.4 kg  ",
    }
    expect(buildOrderLines([draft], offerings)[0]).toMatchObject({
      quantity: "3",
      enteredTotalMinor: 10001,
      expectedFixedPriceMinor: undefined,
      note: "Live weight 12.4 kg",
    })
    const changed = changeOrderOption(item, offerings, draft, "size", "big")
    expect(changed).toMatchObject({ totalPrice: "", note: "" })
    expect(
      buildOrderLines([changed], offerings)[0]?.enteredTotalMinor,
    ).toBeUndefined()
    for (const totalPrice of [
      "",
      "0",
      "-1",
      "1.001",
      "1e3",
      "1,000",
      "1000000.01",
    ])
      expect(() =>
        buildOrderLines([{ ...draft, totalPrice }], offerings),
      ).toThrow()
    expect(parseOrderItemTotal(" 30000 ")).toBe(3000000)
    expect(() =>
      buildOrderLines([{ ...draft, note: "x".repeat(2001) }], offerings),
    ).toThrow()
  })
  test("out-of-stock and fully reserved items stay searchable but disabled", () => {
    const item = eggs()
    for (const balance of item.product?.stockBalances ?? [])
      balance.reservedQuantity = "300"
    const unavailable = availableOrderOfferings([item], "store")
    expect(orderCatalogChoices([item], unavailable)[0]).toMatchObject({
      disabled: true,
    })
    expect(
      orderCatalogChoices([item], unavailable)[0]?.disabledReason,
    ).toContain("Out of stock")
    const big = item.product?.stockBalances.find(
      (row) => row.variantId === "big",
    )
    if (!big) throw new Error("Fixture balance missing")
    big.reservedQuantity = "0"
    expect(
      orderCatalogChoices([item], availableOrderOfferings([item], "store"))[0]
        ?.disabled,
    ).toBe(false)
  })
  test("switching size preserves the crate unit and exact quantity", () => {
    const item = eggs()
    const offerings = availableOrderOfferings([item], "store")
    const first = offerings.find((row) => row.id === "small-crate")
    if (!first) throw new Error("Fixture crate missing")
    const draft = { ...makeOrderDraftLine(item, first), quantity: "2" }
    const changed = changeOrderOption(item, offerings, draft, "size", "big")
    expect(changed.offeringId).toBe("big-crate")
    expect(buildOrderLines([changed], offerings)[0]).toEqual({
      offeringId: "big-crate",
      quantity: "2",
      expectedBalanceRevision: 7,
      expectedConfigurationVersionId: "config",
      expectedFixedPriceMinor: 450000,
      enteredTotalMinor: undefined,
      note: undefined,
    })
  })

  test("multiple selections retain distinct units without float rounding", () => {
    const item = eggs()
    const offerings = availableOrderOfferings([item], "store")
    const drafts = offerings.slice(0, 2).map((row) => ({
      ...makeOrderDraftLine(item, row),
      quantity: "0.123456",
    }))
    expect(
      buildOrderLines(drafts, offerings).map((line) => line.quantity),
    ).toEqual(["0.123456", "0.123456"])
    expect(new Set(drafts.map((line) => line.id)).size).toBe(2)
  })

  test("empty, invalid, removed and unavailable choices cannot silently submit", () => {
    const item = eggs()
    const offerings = availableOrderOfferings([item], "store")
    const first = offerings[0]
    if (!first) throw new Error("Fixture offering missing")
    const draft = makeOrderDraftLine(item, first)
    expect(() => buildOrderLines([], offerings)).toThrow()
    for (const quantity of ["", "0", "-1", "1e3", "0.1234567"])
      expect(() =>
        buildOrderLines([{ ...draft, quantity }], offerings),
      ).toThrow()
    expect(() =>
      buildOrderLines([{ ...draft, offeringId: "removed" }], offerings),
    ).toThrow()
    expect(() =>
      buildOrderLines(
        [draft],
        offerings.map((row) => ({ ...row, disabledReason: "Out of stock" })),
      ),
    ).toThrow()
    const changed = changeOrderOption(item, offerings, draft, "size", "missing")
    expect(() => buildOrderLines([changed], offerings)).toThrow()
  })

  test("other Stores, archived definitions and quote-required choices are excluded", () => {
    const item = eggs()
    expect(availableOrderOfferings([item], "other-store")).toEqual([])
    expect(
      availableOrderOfferings([{ ...item, status: "archived" }], "store"),
    ).toEqual([])
    const small = item.variants[0]
    const bigEgg = item.variants[1]?.offerings[0]
    if (!small || !bigEgg) throw new Error("Fixture variants missing")
    small.status = "archived"
    bigEgg.pricingPolicy = "quote_required"
    expect(
      availableOrderOfferings([item], "store").map((row) => row.id),
    ).toEqual(["big-crate"])
  })

  test("internal supplies are excluded while for-sale and dual-use Products remain selectable", () => {
    const item = eggs()
    if (!item.product) throw new Error("Product fixture missing")
    for (const usage of ["FOR_SALE", "BOTH"] as const) {
      item.product.usage = usage
      expect(availableOrderOfferings([item], "store")).toHaveLength(4)
    }
    item.product.usage = "INTERNAL_USE"
    expect(availableOrderOfferings([item], "store")).toEqual([])
    expect(
      orderCatalogChoices([item], availableOrderOfferings([item], "store")),
    ).toEqual([])
  })
})
