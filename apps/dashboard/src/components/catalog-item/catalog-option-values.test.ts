import { describe, expect, test } from "bun:test"
import {
  parseCatalogOptionValues,
  updateCatalogOptionValues,
} from "./catalog-option-values"

describe("catalog option values", () => {
  test("custom comma entries trim and deduplicate without changing display labels", () => {
    expect(
      parseCatalogOptionValues([" Broiler, Layer ", "broiler", "", "Cockerel"]),
    ).toEqual(["Broiler", "Layer", "Cockerel"])
    expect(
      updateCatalogOptionValues([{ values: "Broiler" }], 0, [
        "Broiler",
        "Layer, Cockerel",
      ]),
    ).toBe("Broiler, Layer, Cockerel")
  })

  test("adding checks the combined choice limit atomically, removal remains available", () => {
    const groups = [
      {
        values: Array.from(
          { length: 48 },
          (_, index) => `Choice ${index}`,
        ).join(", "),
      },
      { values: "Small, Large" },
    ]
    expect(
      updateCatalogOptionValues(groups, 1, ["Small", "Large", "Extra large"]),
    ).toBe("Small, Large")
    expect(updateCatalogOptionValues(groups, 1, ["Small"])).toBe("Small")
    expect(
      updateCatalogOptionValues(
        [{ values: "" }],
        0,
        Array.from({ length: 97 }, (_, index) => `Choice ${index}`),
      ),
    ).toBe("")
  })

  test("an existing over-limit draft can be reduced without losing custom values", () => {
    const values = Array.from({ length: 101 }, (_, index) => `Choice ${index}`)
    const groups = [{ values: values.join(", ") }]
    expect(updateCatalogOptionValues(groups, 0, values.slice(0, 99))).toBe(
      values.slice(0, 99).join(", "),
    )
    expect(
      updateCatalogOptionValues(groups, 0, [...values, "New choice"]),
    ).toBe(groups[0]?.values ?? "")
  })
})
