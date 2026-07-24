import { describe, expect, test } from "bun:test"

import {
  SALE_ITEM_PICKER_COMPACT_LIMIT,
  commitSaleItemPickerDraft,
  getSaleItemPickerPresentation,
  getSelectableSaleItemChoices,
  shouldFetchNextSaleItemPickerPage,
} from "./sale-item-picker-model"

describe("sale item picker presentation", () => {
  test("uses the floating sheet through five complete choices and the full screen at six", () => {
    expect(SALE_ITEM_PICKER_COMPACT_LIMIT).toBe(5)
    expect(
      getSaleItemPickerPresentation({
        choiceCount: 5,
        hasUnloadedChoices: false,
      }),
    ).toBe("sheet")
    expect(
      getSaleItemPickerPresentation({
        choiceCount: 6,
        hasUnloadedChoices: false,
      }),
    ).toBe("screen")
  })

  test("counts only selectable choices and stops page resolution without progress", () => {
    expect(
      getSelectableSaleItemChoices([
        { id: "available" },
        { disabledReason: "Out of stock", id: "unavailable" },
      ]),
    ).toEqual([{ id: "available" }])

    expect(
      shouldFetchNextSaleItemPickerPage({
        attemptedCursors: new Set(),
        choiceCount: 5,
        isOffline: false,
        nextCursor: "next",
      }),
    ).toBe(true)
    expect(
      shouldFetchNextSaleItemPickerPage({
        attemptedCursors: new Set(["next"]),
        choiceCount: 5,
        isOffline: false,
        nextCursor: "next",
      }),
    ).toBe(false)
  })
})

describe("sale item picker draft", () => {
  test("preserves existing quantities, starts new choices at one, and removes omitted lines", () => {
    const existing = { id: "existing", name: "Existing" }
    const removed = { id: "removed", name: "Removed" }
    const added = { id: "added", name: "Added" }

    expect(
      commitSaleItemPickerDraft({
        currentQuantities: {
          [existing.id]: "3",
          [removed.id]: "2",
        },
        draft: {
          [added.id]: added,
          [existing.id]: existing,
        },
      }),
    ).toEqual({
      quantities: {
        [added.id]: "1",
        [existing.id]: "3",
      },
      selectedChoices: {
        [added.id]: added,
        [existing.id]: existing,
      },
    })
  })
})
