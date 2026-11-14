import { describe, expect, test } from "bun:test"
import {
  isInternalUseProduct,
  isReturnableProduct,
  isSaleEligibleProduct,
  productUsages,
  selectableProductUsages,
} from "./product-usage"

describe("product usage", () => {
  test("only For sale and Both can be sold", () => {
    expect(productUsages.filter(isSaleEligibleProduct)).toEqual([
      "FOR_SALE",
      "BOTH",
    ])
    expect(isSaleEligibleProduct(undefined)).toBe(true)
  })

  test("Returnable is neither sold nor business-use stock", () => {
    expect(isSaleEligibleProduct("RETURNABLE")).toBe(false)
    expect(isInternalUseProduct("RETURNABLE")).toBe(false)
    expect(isReturnableProduct("RETURNABLE")).toBe(true)
  })

  test("forms do not offer Returnable before its screens ship", () => {
    expect(selectableProductUsages).not.toContain("RETURNABLE")
  })
})
