import { describe, expect, test } from "bun:test"

import { buildCatalogVariantCombinations } from "./catalog-options"
import {
  CATALOG_SETUP_HELPERS,
  CATALOG_SETUP_HELPER_SCHEMA_VERSION,
  buildCatalogSetupHelperApplication,
  findCatalogSetupHelper,
  getCatalogSetupReplacementAction,
  isCatalogFixedPriceMissing,
  listCatalogSetupHelpers,
} from "./catalog-setup-helpers"
import { parseExactDecimal } from "./exact-decimal"

const FORBIDDEN_RECIPE_KEYS = new Set([
  "barcode",
  "clientOperationId",
  "fixedPriceMinor",
  "imageUrl",
  "openingStock",
  "openingStockQuantity",
  "price",
  "priceMinor",
  "sku",
  "storeId",
  "tenantId",
])

function collectObjectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectKeys(entry, keys)
    return keys
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key)
      collectObjectKeys(entry, keys)
    }
  }

  return keys
}

describe("catalog setup helpers", () => {
  test("publishes a versioned library with unique searchable helpers", () => {
    expect(CATALOG_SETUP_HELPER_SCHEMA_VERSION).toBe(1)
    expect(CATALOG_SETUP_HELPERS.length).toBeGreaterThanOrEqual(15)

    const keys = CATALOG_SETUP_HELPERS.map((helper) => helper.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(
      CATALOG_SETUP_HELPERS.every(
        (helper) =>
          helper.tags.length > 0 &&
          helper.tags.every((tag) => typeof tag === "string" && tag.length > 0),
      ),
    ).toBe(true)

    expect(listCatalogSetupHelpers({ kind: "product", query: "feed" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "feed-bag-25kg" }),
        expect.objectContaining({ key: "feed-bag-50kg" }),
      ]),
    )
    expect(
      listCatalogSetupHelpers({ kind: "service", query: "laundry" }),
    ).toEqual([expect.objectContaining({ key: "dry-cleaning-laundry" })])
    expect(listCatalogSetupHelpers({ kind: "service" })).toSatisfy((helpers) =>
      helpers.every((helper) => helper.kind === "service"),
    )
  })

  test("keeps every Product recipe exact and within Catalog limits", () => {
    const productHelpers = listCatalogSetupHelpers({ kind: "product" })

    for (const helper of productHelpers) {
      expect(helper.setup.units.length).toBeGreaterThan(0)
      expect(helper.setup.units.length).toBeLessThanOrEqual(48)

      const canonicalUnits = helper.setup.units.filter(
        (unit) => unit.stockBehavior === "canonical_shared",
      )
      expect(canonicalUnits).toHaveLength(1)
      expect(canonicalUnits[0]?.factor).toBe("1")
      expect(helper.setup.units[0]?.stockBehavior).toBe("canonical_shared")

      for (const unit of helper.setup.units) {
        expect(
          String(
            parseExactDecimal(unit.factor, {
              allowZero: false,
              maxScale: 12,
            }),
          ),
        ).toBe(unit.factor)
        expect(unit.transactionScale).toBeGreaterThanOrEqual(0)
        expect(unit.transactionScale).toBeLessThanOrEqual(6)
      }

      const combinations = buildCatalogVariantCombinations(
        helper.setup.optionGroups.map((group, groupIndex) => ({
          key: `group-${groupIndex + 1}`,
          name: group.name,
          values: group.values.map((label, valueIndex) => ({
            key: `value-${valueIndex + 1}`,
            label,
          })),
        })),
      )
      const combinationCount =
        helper.setup.optionGroups.length === 0 ? 1 : combinations.length

      expect(combinationCount).toBeLessThanOrEqual(96)
      expect(helper.setup.units.length).toBeLessThanOrEqual(48)
    }
  })

  test("models feed as explicit prepared stock without silent bag consumption", () => {
    const helper = findCatalogSetupHelper("feed-bag-50kg")
    expect(helper?.kind).toBe("product")
    if (!helper || helper.kind !== "product") return

    expect(helper.suggestedName).toBe("Chicken Feed")
    expect(helper.setup.optionGroups).toEqual([
      {
        name: "Feed type",
        values: ["Starter", "Grower", "Layer"],
      },
    ])
    expect(helper.setup.units).toEqual([
      {
        factor: "1",
        name: "Bag",
        stockBehavior: "canonical_shared",
        symbol: "bag",
        transactionScale: 0,
      },
      {
        factor: "0.5",
        name: "Half bag",
        stockBehavior: "packaged_stock",
        transactionScale: 0,
      },
      {
        factor: "0.25",
        name: "Quarter bag",
        stockBehavior: "packaged_stock",
        transactionScale: 0,
      },
      {
        factor: "0.02",
        name: "Kilogram",
        stockBehavior: "packaged_stock",
        symbol: "kg",
        transactionScale: 2,
      },
    ])
  })

  test("creates independent dry-cleaning garment, treatment, and size choices", () => {
    const helper = findCatalogSetupHelper("dry-cleaning-laundry")
    expect(helper?.kind).toBe("service")
    if (!helper || helper.kind !== "service") return

    const combinations = helper.setup.optionGroups.reduce(
      (total, group) => total * group.values.length,
      1,
    )

    expect(combinations).toBe(28)
    expect(helper.setup).toMatchObject({
      authorizationPolicy: "on_order_confirmation",
      pricingPolicy: "fixed",
      quantityScale: 0,
      workPolicy: "tracked",
    })
    expect(helper.setup.optionGroups[0]?.values).toEqual([
      "Shirt",
      "Trousers",
      "Suit",
      "Caftan",
      "Agbada",
      "Jalabia",
      "Iro & Buba",
    ])
  })

  test("keeps every Service recipe free of inventory configuration", () => {
    for (const helper of listCatalogSetupHelpers({ kind: "service" })) {
      expect("units" in helper.setup).toBe(false)
      expect("stockBehavior" in helper.setup).toBe(false)
    }
  })

  test("builds the same platform-neutral prefill and replacement decisions", () => {
    const feed = findCatalogSetupHelper("feed-bag-50kg")
    const laundry = findCatalogSetupHelper("dry-cleaning-laundry")
    expect(feed).toBeDefined()
    expect(laundry).toBeDefined()
    if (!feed || !laundry) return

    expect(buildCatalogSetupHelperApplication(feed)).toMatchObject({
      additionalUnits: [
        { name: "Half bag" },
        { name: "Quarter bag" },
        { name: "Kilogram" },
      ],
      canonicalUnit: { name: "Bag", transactionScale: 0 },
      kind: "product",
      suggestedName: "Chicken Feed",
    })
    expect(buildCatalogSetupHelperApplication(laundry)).toMatchObject({
      authorizationPolicy: "on_order_confirmation",
      kind: "service",
      pricingPolicy: "fixed",
      quantityScale: 0,
      suggestedName: "Dry Cleaning",
      workPolicy: "tracked",
    })

    expect(
      getCatalogSetupReplacementAction({
        currentKey: null,
        hasStructuralDraft: false,
        nextKey: "counted-item",
      }),
    ).toBe("apply")
    expect(
      getCatalogSetupReplacementAction({
        currentKey: "counted-item",
        hasStructuralDraft: true,
        nextKey: "counted-item",
      }),
    ).toBe("close")
    expect(
      getCatalogSetupReplacementAction({
        currentKey: null,
        hasStructuralDraft: true,
        nextKey: "counted-item",
      }),
    ).toBe("confirm")
    expect(
      getCatalogSetupReplacementAction({
        currentKey: null,
        hasStructuralDraft: true,
        nextKey: null,
      }),
    ).toBe("confirm")
  })

  test("requires a price only when an enabled Service row becomes fixed", () => {
    expect(
      isCatalogFixedPriceMissing({
        enabled: true,
        hasBasePrice: false,
        hasOverridePrice: false,
        quoteRequired: false,
      }),
    ).toBe(true)
    expect(
      isCatalogFixedPriceMissing({
        enabled: true,
        hasBasePrice: false,
        hasOverridePrice: false,
        quoteRequired: true,
      }),
    ).toBe(false)
    expect(
      isCatalogFixedPriceMissing({
        enabled: true,
        hasBasePrice: true,
        hasOverridePrice: false,
        quoteRequired: false,
      }),
    ).toBe(false)
  })

  test("contains no tenant, identifier, price, image, or stock values", () => {
    const keys = collectObjectKeys(CATALOG_SETUP_HELPERS)

    for (const forbiddenKey of FORBIDDEN_RECIPE_KEYS) {
      expect(keys.has(forbiddenKey)).toBe(false)
    }
  })
})
