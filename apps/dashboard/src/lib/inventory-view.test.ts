import { describe, expect, test } from "bun:test"
import {
  filterInventory,
  formatInventoryQuantity,
  initialInventorySource,
  summarizeInventory,
} from "./inventory-view"
const base = {
  productId: "eggs",
  productName: "Eggs",
  variantName: "Big",
  inventoryUnitName: "Egg",
  custodyType: "STORE",
  onHandQuantity: "9007199254740993.0001",
  reservedQuantity: "0.0001",
  availableQuantity: "9007199254740993",
}

describe("inventory ledger view", () => {
  test("formats quantities without Number conversion or lost precision", () => {
    expect(formatInventoryQuantity("9007199254740993.0001")).toBe(
      "9,007,199,254,740,993.0001",
    )
    expect(formatInventoryQuantity("-12345.50")).toBe("-12,345.50")
  })
  test("counts products and balances without adding unlike quantities", () => {
    expect(
      summarizeInventory([
        base,
        { ...base, variantName: "Small" },
        {
          ...base,
          productId: "birds",
          onHandQuantity: "0",
          reservedQuantity: "0",
          availableQuantity: "0",
        },
      ]),
    ).toEqual({ products: 2, stocked: 1, balances: 3, reserved: 2, out: 1 })
  })
  test("retains exact fractional reservations and nonpositive availability", () => {
    const zero = { ...base, reservedQuantity: "0", availableQuantity: "0" }
    const negative = { ...zero, availableQuantity: "-0.0001" }
    expect(
      filterInventory([base, zero, negative], " egg ", "reserved"),
    ).toEqual([base])
    expect(filterInventory([base, zero, negative], "", "out")).toEqual([
      zero,
      negative,
    ])
    expect(filterInventory([base], "small", "all")).toEqual([])
    expect(filterInventory([base], "store", "all")).toEqual([base])
  })
  test("opens the exact balance and never substitutes for a missing explicit balance", () => {
    const rows = [{ balanceSourceId: "big" }, { balanceSourceId: "small" }]
    expect(initialInventorySource(rows, "small", "eggs")).toBe("small")
    expect(initialInventorySource(rows, null, "eggs")).toBe("")
    expect(
      initialInventorySource([{ balanceSourceId: "big" }], "deleted", "eggs"),
    ).toBe("")
    expect(
      initialInventorySource([{ balanceSourceId: "big" }], null, "eggs"),
    ).toBe("big")
    expect(
      initialInventorySource([{ balanceSourceId: "big" }], null, null),
    ).toBe("")
  })
})
