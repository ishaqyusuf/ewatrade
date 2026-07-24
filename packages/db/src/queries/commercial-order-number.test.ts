import { describe, expect, test } from "bun:test"

import { formatCommercialOrderNumber } from "./commercial-order-number"

describe("formatCommercialOrderNumber", () => {
  test("formats the first order with the standard prefix and padding", () => {
    expect(formatCommercialOrderNumber(1)).toBe("ORD-001")
  })

  test("keeps three-digit padding through order 999", () => {
    expect(formatCommercialOrderNumber(10)).toBe("ORD-010")
    expect(formatCommercialOrderNumber(999)).toBe("ORD-999")
  })

  test("grows naturally beyond three digits", () => {
    expect(formatCommercialOrderNumber(1_000)).toBe("ORD-1000")
  })
})
