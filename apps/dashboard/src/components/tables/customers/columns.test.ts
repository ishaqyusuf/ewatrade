import { describe, expect, test } from "bun:test"
import { compareCustomerTotals } from "./columns"

describe("customer total sorting", () => {
  test("compares exact minor-unit strings beyond Number safe integer range", () => {
    expect(compareCustomerTotals("9007199254740993", "9007199254740992")).toBe(
      1,
    )
    expect(compareCustomerTotals("9007199254740992", "9007199254740993")).toBe(
      -1,
    )
    expect(compareCustomerTotals("9007199254740993", "9007199254740993")).toBe(
      0,
    )
  })
})
