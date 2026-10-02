import { describe, expect, test } from "bun:test"
import {
  collectStockCategoryDraft,
  normalizeStockCategoryName,
  normalizeStockCategorySelectors,
  stockCategorySelectors,
} from "./inventory-categories"

describe("inventory category input", () => {
  test("normalizes Unicode, case and whitespace without losing the display name", () => {
    expect(normalizeStockCategoryName("  Cafe\u0301   Row 1 ")).toEqual({
      name: "Café Row 1",
      normalizedName: "café row 1",
    })
    expect(() => normalizeStockCategoryName("\u200b")).toThrow()
    expect(() => normalizeStockCategoryName("x".repeat(81))).toThrow()
  })
  test("captures pending comma labels, retaining selected numeric IDs and order", () => {
    const draft = collectStockCategoryDraft(
      [{ categoryNameId: 42, name: "Row 1" }],
      "row  1, Morning collection,",
    )
    expect(stockCategorySelectors(draft)).toEqual([
      { categoryNameId: 42 },
      { name: "Morning collection" },
    ])
    expect(() => collectStockCategoryDraft([], " , ")).toThrow()
    expect(() =>
      collectStockCategoryDraft(
        [],
        Array.from({ length: 11 }, (_, i) => `Row ${i}`).join(","),
      ),
    ).toThrow()
  })
  test("canonical retry selectors deduplicate but keep name selectors as names", () => {
    expect(
      normalizeStockCategorySelectors([
        { name: " Row  1" },
        { name: "ROW 1" },
        { categoryNameId: 5 },
        { categoryNameId: 5 },
      ]),
    ).toEqual([{ name: "row 1" }, { categoryNameId: 5 }])
    expect(() =>
      normalizeStockCategorySelectors([{ categoryNameId: 1.5 }]),
    ).toThrow()
  })
})
