import { describe, expect, test } from "bun:test"
import {
  type InventoryProductForRows,
  canOperateInventory,
  filterInventoryRows,
  formatMovementType,
  formatSignedQuantity,
  getUnitConversionPreview,
  getStockState,
  mapInventoryRows,
} from "./inventory-operations"

const products: InventoryProductForRows[] = [
  {
    currencyCode: "NGN",
    id: "product_1",
    name: "Premium Rice",
    slug: "premium-rice",
    status: "ACTIVE",
    variants: [
      {
        conversionRatioDenominator: 1,
        conversionRatioNumerator: 1,
        id: "unit_1",
        inventoryItem: {
          onHandQuantity: 20,
          reorderPoint: 6,
          reservedQuantity: 2,
        },
        isDefault: true,
        name: "Bag",
        priceMinor: 420000,
        sku: "RICE-BAG",
      },
      {
        conversionRatioDenominator: 2,
        conversionRatioNumerator: 1,
        id: "unit_2",
        inventoryItem: {
          onHandQuantity: 4,
          reorderPoint: 6,
          reservedQuantity: 0,
        },
        isDefault: false,
        name: "Paint bucket",
        priceMinor: 75000,
        sku: "RICE-BUCKET",
      },
    ],
  },
  {
    currencyCode: "NGN",
    id: "product_2",
    name: "Groundnut Oil",
    slug: "groundnut-oil",
    status: "ACTIVE",
    variants: [
      {
        conversionRatioDenominator: 1,
        conversionRatioNumerator: 1,
        id: "unit_3",
        inventoryItem: null,
        isDefault: true,
        name: "Bottle",
        priceMinor: 280000,
        sku: "OIL-BOTTLE",
      },
    ],
  },
]

describe("inventory operation helpers", () => {
  test("allows POS operator roles to use inventory operations", () => {
    expect(canOperateInventory("OWNER")).toBe(true)
    expect(canOperateInventory("ADMIN")).toBe(true)
    expect(canOperateInventory("MANAGER")).toBe(true)
    expect(canOperateInventory("CASHIER")).toBe(true)
    expect(canOperateInventory("OPERATOR")).toBe(true)
    expect(canOperateInventory("MEMBER")).toBe(false)
    expect(canOperateInventory(null)).toBe(false)
  })

  test("maps product variants into inventory unit rows", () => {
    expect(mapInventoryRows(products)).toMatchObject([
      {
        availableQuantity: 18,
        baseEquivalentQuantity: 20,
        baseUnitName: "Bag",
        productName: "Premium Rice",
        state: "available",
        unitName: "Bag",
      },
      {
        availableQuantity: 4,
        baseEquivalentQuantity: 2,
        baseUnitName: "Bag",
        productName: "Premium Rice",
        state: "low",
        unitName: "Paint bucket",
      },
      {
        availableQuantity: 0,
        baseEquivalentQuantity: 0,
        baseUnitName: "Bottle",
        productName: "Groundnut Oil",
        state: "out",
        unitName: "Bottle",
      },
    ])
  })

  test("classifies stock state with reserved quantity and fallback threshold", () => {
    expect(
      getStockState({
        onHandQuantity: 6,
        reorderPoint: null,
        reservedQuantity: 1,
      }),
    ).toBe("low")
    expect(
      getStockState({
        onHandQuantity: 6,
        reorderPoint: null,
        reservedQuantity: 6,
      }),
    ).toBe("out")
  })

  test("filters inventory rows by search and stock state", () => {
    const rows = mapInventoryRows(products)

    expect(
      filterInventoryRows(rows, { search: "bucket" }).map((row) => row.unitId),
    ).toEqual(["unit_2"])

    expect(
      filterInventoryRows(rows, { state: "out" }).map((row) => row.unitId),
    ).toEqual(["unit_3"])
  })

  test("formats movement labels and signed quantities", () => {
    expect(formatMovementType("stock_intake")).toBe("Stock intake")
    expect(formatMovementType("conversion_out")).toBe("Conversion out")
    expect(formatSignedQuantity(4)).toBe("+4")
    expect(formatSignedQuantity(-3)).toBe("-3")
  })

  test("derives a same-product whole-unit conversion preview", () => {
    const rows = mapInventoryRows(products)

    expect(
      getUnitConversionPreview({
        sourceQuantity: 50,
        sourceUnit: rows[0],
        targetUnit: rows[1],
      }),
    ).toMatchObject({
      sourceBaseQuantity: 50,
      targetQuantity: 100,
    })
    expect(
      getUnitConversionPreview({
        sourceQuantity: 1,
        sourceUnit: rows[0],
        targetUnit: rows[2],
      }),
    ).toBeNull()
  })
})
