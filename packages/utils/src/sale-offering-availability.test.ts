import { describe, expect, test } from "bun:test"

import { getSaleOfferingDisabledReasons } from "./sale-offering-availability"

describe("sale offering availability", () => {
  test("explains every reason an incomplete product cannot be sold", () => {
    expect(
      getSaleOfferingDisabledReasons({
        fixedPriceMinor: null,
        kind: "product_unit",
      }),
    ).toEqual(["Price not set", "Out of stock"])
  })

  test("disables an in-stock product only when no quantity is available", () => {
    expect(
      getSaleOfferingDisabledReasons({
        fixedPriceMinor: 10_000,
        kind: "product_unit",
        onHandQuantity: "2",
        reservedQuantity: "2",
      }),
    ).toEqual(["Out of stock"])
  })

  test("allows a priced product with unreserved stock", () => {
    expect(
      getSaleOfferingDisabledReasons({
        fixedPriceMinor: 10_000,
        kind: "product_unit",
        onHandQuantity: "2.5",
        reservedQuantity: "1",
      }),
    ).toEqual([])
  })

  test("checks service prices without requiring stock", () => {
    expect(
      getSaleOfferingDisabledReasons({
        fixedPriceMinor: null,
        kind: "service",
      }),
    ).toEqual(["Price not set"])
  })
})
