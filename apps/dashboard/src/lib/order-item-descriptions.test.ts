import { describe, expect, test } from "bun:test"
import { formatOrderItemGroups } from "./order-item-descriptions"

function line(name: string, variant: string, unit: string, quantity = "2") {
  return {
    quantity,
    snapshot: {
      catalogItemName: name,
      variantName: variant,
      inventoryUnitName: unit,
    },
  }
}

describe("Order item descriptions", () => {
  test("names Eggs once and hides its repeated Egg unit", () => {
    expect(
      formatOrderItemGroups([
        line("Eggs", "Small", "Egg"),
        line("Eggs", "Big", "Egg", "3"),
      ]),
    ).toEqual([{ name: "Eggs", details: "2 × Small, 3 × Big" }])
  })

  test("keeps Crate when single Eggs and Crates share the product", () => {
    expect(
      formatOrderItemGroups([
        line("Eggs", "Small", "Egg"),
        line("Eggs", "Small", "Crate", "1"),
      ]),
    ).toEqual([{ name: "Eggs", details: "2 × Small, 1 × Small · Crate" }])
  })

  test("keeps distinct units and separates products with the same variant", () => {
    expect(
      formatOrderItemGroups([
        line("Eggs", "Small", "Crate"),
        line("Milk", "Small", "Bottle"),
      ]),
    ).toEqual([
      { name: "Eggs", details: "2 × Small · Crate" },
      { name: "Milk", details: "2 × Small · Bottle" },
    ])
  })

  test("hides a repeated variant but keeps Bird as the selling unit", () => {
    expect(formatOrderItemGroups([line("Layers", "Layers", "Bird")])).toEqual([
      { name: "Layers", details: "2 × Bird" },
    ])
  })

  test("preserves historical lines and avoids a dangling multiplication label", () => {
    expect(
      formatOrderItemGroups([
        { quantity: "1", snapshot: null },
        line("Widget", "Default", "", "4"),
      ]),
    ).toEqual([
      { name: "Item", details: "1" },
      { name: "Widget", details: "4" },
    ])
  })
})
