import { expect, test } from "bun:test"
import { saleUnitCount, stepSaleQuantity } from "./sale-unit-count"

test("sale units count quantities, preserving decimal precision and incomplete edits", () => {
  expect(saleUnitCount(["2", "3"])).toBe("5")
  expect(saleUnitCount(["0.1", "0.2"])).toBe("0.3")
  expect(saleUnitCount(["2", ""])).toBe("—")
  expect(saleUnitCount(["2", "invalid"])).toBe("—")
  expect(saleUnitCount([])).toBe("0")
})

test("quantity steps preserve fractions and clamp at zero", () => {
  expect(stepSaleQuantity("1.5", 1)).toBe("2.5")
  expect(stepSaleQuantity("1.5", -1)).toBe("0.5")
  expect(stepSaleQuantity("0.5", -1)).toBe("0")
  expect(stepSaleQuantity("", 1)).toBe("1")
  expect(stepSaleQuantity(undefined, 1)).toBe("1")
  expect(stepSaleQuantity(undefined, -1)).toBe("0")
  expect(saleUnitCount(["0.12345678901234567890123456789"])).toBe("—")
})
