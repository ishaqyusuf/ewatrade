import { describe, expect, test } from "bun:test"
import { financeCsvCell } from "./finance-csv"

describe("finance CSV cells", () => {
  test("preserves signed minor-unit integers without numeric conversion", () => {
    for (const amount of ["0", "2500", "-2500", "-9223372036854775807"]) {
      expect(financeCsvCell(amount)).toBe(`"${amount}"`)
    }
  })

  test("neutralizes formula text, including whitespace and numeric expressions", () => {
    for (const value of [
      "=SUM(A1:A2)",
      "+2500",
      "@lookup",
      "-1+2",
      "\t=1",
      " -2500",
    ]) {
      expect(financeCsvCell(value)).toBe(`"'${value}"`)
    }
  })

  test("retains CSV punctuation and line breaks with doubled quotes", () => {
    expect(financeCsvCell('investigated, "cash"\nsurplus')).toBe(
      '"investigated, ""cash""\nsurplus"',
    )
  })
})
