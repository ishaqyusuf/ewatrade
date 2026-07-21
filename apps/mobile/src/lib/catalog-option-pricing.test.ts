import { describe, expect, test } from "bun:test"

import {
  resolveCatalogOptionUnitPrice,
  resolveCatalogOptionUnitPriceMinor,
} from "./catalog-option-pricing"

describe("catalog option unit pricing", () => {
  test("does not copy the main option price into blank unit combinations", () => {
    expect(
      resolveCatalogOptionUnitPrice({
        optionPrice: "30000",
        optionPricingOnly: true,
        unitDefaultPrice: "25000",
        unitOverridePrice: "",
      }),
    ).toBe("")
  })

  test("keeps an explicit unit combination price independent", () => {
    expect(
      resolveCatalogOptionUnitPrice({
        optionPrice: "30000",
        optionPricingOnly: true,
        unitDefaultPrice: "25000",
        unitOverridePrice: "18000",
      }),
    ).toBe("18000")
  })

  test("retains defaults when option-only pricing is off", () => {
    expect(
      resolveCatalogOptionUnitPrice({
        optionPrice: "30000",
        optionPricingOnly: false,
        unitDefaultPrice: "25000",
        unitOverridePrice: "",
      }),
    ).toBe("25000")
  })

  test("keeps a blank option-unit payload unpriced in option-only mode", () => {
    expect(
      resolveCatalogOptionUnitPriceMinor({
        basePriceMinor: 3_000_000,
        optionPrice: "30000",
        optionPricingOnly: true,
        unitDefaultPrice: "25000",
        unitOverridePrice: "",
      }),
    ).toBeUndefined()
  })
})
