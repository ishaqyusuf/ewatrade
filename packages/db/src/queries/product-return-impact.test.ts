import { expect, test } from "bun:test"
import { productReturnQuantityImpact, productReturnStockImpact } from "./product-return-impact"

test("partial return uses all fulfillments and prior returns exactly", () => {
  expect(productReturnQuantityImpact({ quantity: "0.25", fulfilledQuantities: ["1", "0.5"], returnedQuantities: ["0.2", "0.05"] })).toEqual({
    quantity: "0.25", fulfilledQuantity: "1.5", returnedQuantity: "0.25", returnableBefore: "1.25", returnableAfter: "1",
  })
})

test("exact final return exhausts remaining quantity", () => {
  expect(productReturnQuantityImpact({ quantity: "0.000001", fulfilledQuantities: ["9007199254740993.000001"], returnedQuantities: ["9007199254740993"] }).returnableAfter).toBe("0")
})

test("over-return and invalid quantities cannot create an impact", () => {
  for (const quantity of ["1.000001", "0", "-1", "0.0000001"]) {
    expect(() => productReturnQuantityImpact({ quantity, fulfilledQuantities: ["2"], returnedQuantities: ["1"] })).toThrow()
  }
  expect(() => productReturnQuantityImpact({ quantity: "1", fulfilledQuantities: [], returnedQuantities: [] })).toThrow()
})

test("restock preserves sold conversion while packaged balance remains in cases", () => {
  const input = { quantity: "0.5", unitFactor: "12", onHandQuantity: "2" }
  expect(productReturnStockImpact({ ...input, balanceKind: "PACKAGED_STOCK" })).toEqual({ canonicalQuantity: "6", balanceQuantity: "0.5", onHandBefore: "2", onHandAfter: "2.5" })
  expect(productReturnStockImpact({ ...input, balanceKind: "SHARED_POOL" })).toEqual({ canonicalQuantity: "6", balanceQuantity: "6", onHandBefore: "2", onHandAfter: "8" })
})

test("restock never loses large decimal precision or accepts a nonpositive factor", () => {
  expect(productReturnStockImpact({ quantity: "0.000001", unitFactor: "1", balanceKind: "SHARED_POOL", onHandQuantity: "9007199254740993" }).onHandAfter).toBe("9007199254740993.000001")
  for (const unitFactor of ["0", "-1"]) expect(() => productReturnStockImpact({ quantity: "1", unitFactor, balanceKind: "SHARED_POOL", onHandQuantity: "0" })).toThrow()
})
