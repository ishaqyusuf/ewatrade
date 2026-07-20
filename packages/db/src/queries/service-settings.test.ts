import { describe, expect, test } from "bun:test"

import { calculateServiceChargeMinor } from "./service-settings"

describe("calculateServiceChargeMinor", () => {
  test("calculates an express percentage in basis points", () => {
    expect(
      calculateServiceChargeMinor({
        subtotalMinor: 75_000,
        surchargeType: "percentage",
        surchargeValue: 3_000,
      }),
    ).toBe(22_500)
  })

  test("uses an exact fixed express charge", () => {
    expect(
      calculateServiceChargeMinor({
        subtotalMinor: 75_000,
        surchargeType: "fixed",
        surchargeValue: 10_000,
      }),
    ).toBe(10_000)
  })
})
