import { describe, expect, test } from "bun:test"
import { catalogChoiceDraftIdentity } from "./catalog-choice-drafts"
import {
  type SavedCatalogItem,
  savedItemToFormState,
} from "./catalog-item-edit"

const offering = (
  id: string,
  unitId: string,
  fixedPriceMinor: number | null,
  sku: string | null = null,
) => ({
  currencyCode: "NGN",
  fixedPriceMinor,
  revision: 1,
  id,
  key: id,
  kind: "product_unit",
  name: id,
  pricingPolicy: "fixed",
  productUnit: { barcode: null, inventoryUnitId: unitId, sku },
  service: null,
  serviceWorkPolicy: null,
  status: "active",
  stores: [{ isAvailable: true, storeId: "store-1" }],
})

const eggs = {
  id: "item-1",
  kind: "product",
  name: "Fresh eggs",
  description: null,
  category: "Eggs",
  updatedAt: "2026-10-19T10:00:00.000Z",
  illustrations: [],
  photos: [],
  optionGroups: [
    {
      id: "g-size",
      key: "group-1",
      name: "Size",
      values: [
        { id: "v-medium", key: "value-1", label: "Medium" },
        { id: "v-large", key: "value-2", label: "Large" },
      ],
    },
  ],
  product: {
    id: "p-1",
    usage: "FOR_SALE",
    updatedAt: "2026-10-19T10:00:00.000Z",
    currentUnitConfiguration: {
      canonicalBalanceScale: 18,
      id: "c-1",
      version: 1,
      units: [
        {
          factor: "1.000000000000",
          id: "u-egg",
          key: "canonical",
          name: "Egg",
          stockBehavior: "canonical_shared",
          symbol: null,
          transactionScale: 0,
        },
        {
          factor: "30.000000000000",
          id: "u-tray",
          key: "unit-2",
          name: "Tray",
          stockBehavior: "alternate_transaction",
          symbol: null,
          transactionScale: 0,
        },
      ],
    },
    stockBalances: [{ onHandQuantity: "600", reservedQuantity: "0" }],
  },
  service: null,
  status: "active",
  variants: [
    {
      id: "var-medium",
      key: "variant-1",
      isDefault: true,
      name: "Medium",
      status: "active",
      selections: [
        {
          groupId: "g-size",
          groupKey: "group-1",
          valueId: "v-medium",
          valueKey: "value-1",
        },
      ],
      offerings: [
        offering("o-1", "u-egg", 15000, "EGG-M"),
        offering("o-2", "u-tray", 450000),
      ],
    },
    {
      id: "var-large",
      key: "variant-2",
      isDefault: false,
      name: "Large",
      status: "draft",
      selections: [
        {
          groupId: "g-size",
          groupKey: "group-1",
          valueId: "v-large",
          valueKey: "value-2",
        },
      ],
      offerings: [offering("o-3", "u-egg", 18000)],
    },
  ],
} as unknown as SavedCatalogItem

describe("savedItemToFormState", () => {
  test("rebuilds option groups, units and per-choice drafts keyed by choice identity", () => {
    const state = savedItemToFormState(eggs)
    expect(state.unitName).toBe("Egg")
    expect(state.optionGroups).toEqual([
      { id: "g-size", name: "Size", values: "Medium, Large" },
    ])
    expect(state.additionalUnits).toMatchObject([
      { id: "u-tray", name: "Tray", referenceId: "canonical", price: "4500" },
    ])
    const groups = [
      {
        id: "g-size",
        key: "group-1",
        values: [
          { key: "value-1", label: "Medium" },
          { key: "value-2", label: "Large" },
        ],
      },
    ]
    const medium =
      state.variantDrafts[
        catalogChoiceDraftIdentity(
          [{ groupKey: "group-1", valueKey: "value-1" }],
          groups,
        )
      ]
    const large =
      state.variantDrafts[
        catalogChoiceDraftIdentity(
          [{ groupKey: "group-1", valueKey: "value-2" }],
          groups,
        )
      ]
    expect(medium).toMatchObject({
      enabled: true,
      price: "150",
      sku: "EGG-M",
      unitPrices: { "u-tray": "4500" },
      storeIds: ["store-1"],
    })
    expect(large).toMatchObject({ enabled: false, price: "180" })
    expect(state.onHandQuantity).toBe("600")
  })

  test("an item without options keeps its single draft under the default key", () => {
    const simple = {
      ...eggs,
      optionGroups: [],
      variants: [{ ...eggs.variants[0], selections: [] }],
    } as unknown as SavedCatalogItem
    const state = savedItemToFormState(simple)
    expect(state.showAdvanced).toBe(false)
    expect(Object.keys(state.variantDrafts)).toEqual(["default"])
    expect(state.price).toBe("150")
    expect(state.sku).toBe("EGG-M")
  })
})
