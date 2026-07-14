import { describe, expect, test } from "bun:test"
import {
  type ProductCatalogItem,
  canManageProductCatalog,
  filterProductCatalogItems,
  formatMinorCurrency,
  getDefaultProductUnit,
  parseMajorCurrencyToMinor,
} from "./product-catalog"

const products: ProductCatalogItem[] = [
  {
    currencyCode: "NGN",
    description: "Long grain",
    id: "product_1",
    imageUrl: null,
    name: "Premium Rice",
    priceHistory: [],
    slug: "premium-rice",
    status: "ACTIVE",
    units: [
      {
        id: "unit_1",
        isDefault: true,
        name: "Bag",
        onHandQuantity: 12,
        priceMinor: 420000,
        sku: "RICE-BAG",
      },
    ],
    updatedAt: "2026-07-14T00:00:00.000Z",
  },
  {
    currencyCode: "NGN",
    description: null,
    id: "product_2",
    imageUrl: null,
    name: "Groundnut Oil",
    priceHistory: [],
    slug: "groundnut-oil",
    status: "DRAFT",
    units: [
      {
        id: "unit_2",
        isDefault: false,
        name: "Bottle",
        onHandQuantity: 8,
        priceMinor: 280000,
        sku: "OIL-BOTTLE",
      },
    ],
    updatedAt: "2026-07-14T00:00:00.000Z",
  },
]

describe("product catalog helpers", () => {
  test("filters by search across product and unit fields", () => {
    expect(
      filterProductCatalogItems(products, { search: "rice" }).map(
        (product) => product.id,
      ),
    ).toEqual(["product_1"])

    expect(
      filterProductCatalogItems(products, { search: "bottle" }).map(
        (product) => product.id,
      ),
    ).toEqual(["product_2"])
  })

  test("filters by status", () => {
    expect(
      filterProductCatalogItems(products, { status: "active" }).map(
        (product) => product.id,
      ),
    ).toEqual(["product_1"])
  })

  test("resolves default unit fallback", () => {
    expect(getDefaultProductUnit(products[0])?.name).toBe("Bag")
    expect(getDefaultProductUnit(products[1])?.name).toBe("Bottle")
  })

  test("formats and parses product prices", () => {
    expect(parseMajorCurrencyToMinor("4,200")).toBe(420000)
    expect(parseMajorCurrencyToMinor("")).toBeNull()
    expect(parseMajorCurrencyToMinor("-1")).toBeNull()
    expect(formatMinorCurrency(420000)).toContain("4,200.00")
  })

  test("allows only manager-level roles to manage catalog", () => {
    expect(canManageProductCatalog("OWNER")).toBe(true)
    expect(canManageProductCatalog("ADMIN")).toBe(true)
    expect(canManageProductCatalog("MANAGER")).toBe(true)
    expect(canManageProductCatalog("CASHIER")).toBe(false)
    expect(canManageProductCatalog("OPERATOR")).toBe(false)
    expect(canManageProductCatalog(null)).toBe(false)
  })
})
