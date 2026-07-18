import { describe, expect, test } from "bun:test"
import { calculateWholeUnitConversion } from "./inventory-unit-conversion"

describe("whole-unit inventory conversion", () => {
  test("derives bag fraction and kilogram outputs from unit multipliers", () => {
    expect(
      calculateWholeUnitConversion({
        sourceMultiplier: 1,
        sourceQuantity: 50,
        targetMultiplier: 0.5,
      }),
    ).toEqual({
      sourceBaseQuantity: 50,
      targetQuantity: 100,
    })

    expect(
      calculateWholeUnitConversion({
        sourceMultiplier: 1,
        sourceQuantity: 1,
        targetMultiplier: 1 / 25,
      }),
    ).toEqual({
      sourceBaseQuantity: 1,
      targetQuantity: 25,
    })
  })

  test("fails closed for missing ratios and fractional package outputs", () => {
    expect(
      calculateWholeUnitConversion({
        sourceMultiplier: null,
        sourceQuantity: 1,
        targetMultiplier: 0.5,
      }),
    ).toBeNull()
    expect(
      calculateWholeUnitConversion({
        sourceMultiplier: 0.5,
        sourceQuantity: 1,
        targetMultiplier: 1,
      }),
    ).toBeNull()
  })
})
