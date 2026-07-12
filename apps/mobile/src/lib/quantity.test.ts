// @ts-expect-error Bun test runtime types are outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test"
import {
  formatWholeQuantity,
  isWholeNumberInput,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "./quantity"

describe("quantity helpers", () => {
  test("normalizes pasted numeric input to the whole-number portion", () => {
    expect(normalizeWholeNumberInput("1,234")).toBe("1234")
    expect(normalizeWholeNumberInput("12.75")).toBe("12")
    expect(normalizeWholeNumberInput("bags: 09.5")).toBe("09")
    expect(normalizeWholeNumberInput("abc")).toBe("")
  })

  test("parses whole quantities from user input", () => {
    expect(parseWholeQuantity("1,234")).toBe(1234)
    expect(parseWholeQuantity("12.75")).toBe(12)
    expect(parseWholeQuantity("bags: 09.5")).toBe(9)
    expect(parseWholeQuantity("")).toBe(0)
  })

  test("formats numeric stepper values as non-negative whole strings", () => {
    expect(formatWholeQuantity(4.9)).toBe("4")
    expect(formatWholeQuantity(-2)).toBe("0")
    expect(formatWholeQuantity(Number.NaN)).toBe("0")
    expect(formatWholeQuantity(Number.POSITIVE_INFINITY)).toBe("0")
  })

  test("validates input after normalization", () => {
    expect(isWholeNumberInput("12.75")).toBe(true)
    expect(isWholeNumberInput("bags: 09.5")).toBe(true)
    expect(isWholeNumberInput("abc")).toBe(false)
    expect(isWholeNumberInput("")).toBe(false)
  })
})
