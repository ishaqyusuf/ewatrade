import { expect, test } from "bun:test"
import { parseReceiptIds, toggleReceiptSelection } from "./receipt-selection"

test("receipt deep links reject duplicates, ambiguous arrays and oversized selections", () => {
  for (const input of [
    undefined,
    "",
    "a,a",
    "a,",
    ["a", "b"],
    "a".repeat(129),
    Array.from({ length: 21 }, (_, index) => String(index)).join(","),
  ]) {
    expect(parseReceiptIds(input)).toEqual([])
  }
  expect(parseReceiptIds("a,b")).toEqual(["a", "b"])
})

test("selection enforces the limit while always permitting deselection", () => {
  const ids = Array.from({ length: 20 }, (_, index) => String(index))
  expect(toggleReceiptSelection(ids, "21")).toBe(ids)
  const fewer = toggleReceiptSelection(ids, "0")
  expect(fewer).toHaveLength(19)
  expect(toggleReceiptSelection(fewer, "21")).toHaveLength(20)
})
