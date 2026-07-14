import { describe, expect, test } from "bun:test"
import {
  type InventoryProductForRows,
  canOperateInventory,
  filterInventoryRows,
  formatMovementType,
  formatSignedQuantity,
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
        productName: "Premium Rice",
        state: "available",
        unitName: "Bag",
      },
      {
        availableQuantity: 4,
        productName: "Premium Rice",
        state: "low",
        unitName: "Paint bucket",
      },
      {
        availableQuantity: 0,
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
})
