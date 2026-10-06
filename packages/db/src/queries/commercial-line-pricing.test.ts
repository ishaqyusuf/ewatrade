import { describe, expect, test } from "bun:test"
import { resolveCommercialLinePrice } from "./commercial-line-pricing"

const grown = {
  policy: "order_total" as const,
  kind: "product_unit" as const,
  quantity: "5",
  fixedPriceMinor: null,
  enteredTotalMinor: 3_000_000,
}
describe("explicit order-time item totals", () => {
  test("five birds retain the whole amount without multiplying or deriving a unit price", () => {
    expect(resolveCommercialLinePrice(grown)).toEqual({
      unitPriceMinor: null,
      totalMinor: 3_000_000,
    })
    expect(
      resolveCommercialLinePrice({
        ...grown,
        quantity: "3",
        enteredTotalMinor: 10_001,
      }),
    ).toEqual({ unitPriceMinor: null, totalMinor: 10_001 })
  })
  test("missing, zero, negative, fractional and excessive total amounts fail", () => {
    for (const enteredTotalMinor of [
      undefined,
      0,
      -1,
      1.1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      100_000_001,
    ])
      expect(() =>
        resolveCommercialLinePrice({ ...grown, enteredTotalMinor }),
      ).toThrow()
  })
  test("invalid quantities fail regardless of manual pricing", () => {
    for (const quantity of ["", "0", "-1", "1e3", "0.0000001"])
      expect(() => resolveCommercialLinePrice({ ...grown, quantity })).toThrow()
  })
  test("unset fixed prices stay blocked; clients cannot override saved prices with item totals", () => {
    expect(() =>
      resolveCommercialLinePrice({
        ...grown,
        policy: "fixed",
        fixedPriceMinor: null,
        enteredTotalMinor: undefined,
      }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({
        ...grown,
        policy: "fixed",
        fixedPriceMinor: 250_000,
      }),
    ).toThrow()
    expect(
      resolveCommercialLinePrice({
        ...grown,
        policy: "fixed",
        fixedPriceMinor: 250_000,
        enteredTotalMinor: undefined,
      }),
    ).toEqual({ unitPriceMinor: 250_000, totalMinor: 1_250_000 })
  })
  test("manual mode cannot use a dummy/catalog/quote or trusted per-unit price", () => {
    expect(() =>
      resolveCommercialLinePrice({ ...grown, fixedPriceMinor: 0 }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({ ...grown, expectedFixedPriceMinor: 0 }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({ ...grown, trustedUnitPriceMinor: 1 }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({ ...grown, approvedQuotePriceMinor: 1 }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({ ...grown, kind: "service" }),
    ).toThrow()
  })
  test("fixed price freshness, exact fractional totals and approved Service pricing remain enforced", () => {
    const fixed = {
      ...grown,
      policy: "fixed" as const,
      fixedPriceMinor: 150,
      enteredTotalMinor: undefined,
    }
    expect(() =>
      resolveCommercialLinePrice({ ...fixed, expectedFixedPriceMinor: 149 }),
    ).toThrow()
    expect(() =>
      resolveCommercialLinePrice({ ...fixed, quantity: "0.001" }),
    ).toThrow()
    expect(
      resolveCommercialLinePrice({
        ...fixed,
        policy: "quote_required",
        kind: "service",
        fixedPriceMinor: null,
        approvedQuotePriceMinor: 200,
      }),
    ).toEqual({ unitPriceMinor: 200, totalMinor: 1000 })
  })
})
