import { expect, test } from "bun:test"
import {
  stepExactQuantity,
  stockAfter,
  suggestedTargetQuantity,
} from "./stock-preview"
test("stock previews respect each operation and refuse invalid or negative balances", () => {
  expect(stockAfter("40", "10", "receipt", "increase")).toBe("50")
  expect(stockAfter("40", "10", "count", "increase")).toBe("10")
  expect(stockAfter("40", "10", "custody", "increase")).toBe("30")
  expect(stockAfter("40", "10", "adjustment", "decrease")).toBe("30")
  expect(stockAfter("1", "2", "custody", "increase")).toBeNull()
  expect(stockAfter("1", "", "receipt", "increase")).toBeNull()
})
test("steppers preserve fractional quantities without binary rounding", () => {
  expect(stepExactQuantity("0.1", 1)).toBe("1.1")
  expect(stepExactQuantity("0.1", -1)).toBe("0")
  expect(stepExactQuantity("", 1)).toBe("1")
  expect(stepExactQuantity("x", 1)).toBe("x")
})
test("conversion suggestions preserve exact factors and never round", () => {
  expect(suggestedTargetQuantity("2", "25", "1", 0)).toBe("50")
  expect(suggestedTargetQuantity("1", "1", "3", 6)).toBe("")
  expect(suggestedTargetQuantity("1", "1", "2", 0)).toBe("")
  expect(suggestedTargetQuantity("1", "1", "2", 1)).toBe("0.5")
  expect(suggestedTargetQuantity("", "25", "1", 0)).toBe("")
})
