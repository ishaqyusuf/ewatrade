import { describe, expect, test } from "bun:test"
import { saleReturnableLines } from "./sale-returnables"

describe("sale returnables", () => {
  test("turns typed counts into order lines", () => {
    expect(
      saleReturnableLines([
        { catalogItemId: "crate", name: "Egg crate", quantity: " 58 " },
      ]),
    ).toEqual([{ catalogItemId: "crate", quantity: 58 }])
    expect(saleReturnableLines([])).toEqual([])
  })

  test("refuses empty, zero, fractional and huge counts", () => {
    for (const quantity of ["", "0", "1.5", "abc", "100001"])
      expect(
        saleReturnableLines([{ catalogItemId: "c", name: "Crate", quantity }]),
      ).toBeNull()
  })
})
