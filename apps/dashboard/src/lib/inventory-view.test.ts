import { describe, expect, test } from "bun:test"
import {
  filterInventory,
  formatInventoryQuantity,
  formatStockQuantity,
  getInventoryStatus,
  initialInventorySource,
  pluralizeUnitName,
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
  test("counts products, not stock lines, and only stock kept in a store", () => {
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
        { ...base, productId: "feed", custodyType: "TRANSIT" },
      ]),
    ).toEqual({ products: 2, sellable: 1, held: 1, out: 1 })
  })
  test("names each line's status in plain words", () => {
    expect(getInventoryStatus(base)).toBe("in_stock")
    expect(getInventoryStatus({ ...base, availableQuantity: "0" })).toBe("out")
    expect(getInventoryStatus({ ...base, custodyType: "TRANSIT" })).toBe(
      "transit",
    )
    expect(getInventoryStatus({ ...base, custodyType: "STAFF" })).toBe("staff")
  })
  test("puts the unit after the number, in the plural when needed", () => {
    expect(formatStockQuantity("1230", "Egg")).toBe("1,230 eggs")
    expect(formatStockQuantity("1", "Tray")).toBe("1 tray")
    expect(formatStockQuantity("3", "Box of 100")).toBe("3 boxes of 100")
    expect(formatStockQuantity("85.5", "Kilogram")).toBe("85.5 kilograms")
    expect(formatStockQuantity("2", "kg")).toBe("2 kg")
    expect(formatStockQuantity("0", "Bird")).toBe("0 birds")
    expect(pluralizeUnitName("Piece")).toBe("Pieces")
    expect(pluralizeUnitName("Battery")).toBe("Batteries")
    expect(pluralizeUnitName("Bags")).toBe("Bags")
    expect(pluralizeUnitName("KG")).toBe("KG")
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
    expect(filterInventory([base], "store", "all")).toEqual([])
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
