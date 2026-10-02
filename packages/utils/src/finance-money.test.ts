import { describe, expect, test } from "bun:test"
import {
  formatFinanceMoney,
  parseFinanceCashCount,
  parseFinanceMoney,
} from "./finance-money"

describe("finance money", () => {
  test("cash counts accept zero and exact large balances, but never negative cash", () => {
    expect(parseFinanceCashCount("0.00")).toBe("0")
    expect(parseFinanceCashCount("92233720368547758.07")).toBe(
      "9223372036854775807",
    )
    for (const value of ["-0.01", "92233720368547758.08", "1.001", "1e4"])
      expect(() => parseFinanceCashCount(value)).toThrow()
  })
  test("parses exact minor units and enforces the transaction boundary", () => {
    expect(parseFinanceMoney(" 12.3 ")).toBe("1230")
    expect(parseFinanceMoney("0.01")).toBe("1")
    expect(parseFinanceMoney("1000000000000.00")).toBe("100000000000000")
    for (const invalid of [
      "0",
      "-1",
      "1.001",
      "1e3",
      "1,000",
      "NaN",
      "1000000000000.01",
    ])
      expect(() => parseFinanceMoney(invalid)).toThrow()
  })

  test("formats large balances without converting them to imprecise numbers", () => {
    expect(formatFinanceMoney("900719925474099301", "NGN")).toContain(
      "9,007,199,254,740,993.01",
    )
    expect(formatFinanceMoney("-1", "NGN")).toContain("-₦0.01")
    expect(formatFinanceMoney("-12345", "NGN")).toContain("-₦123.45")
  })
})
