import { describe, expect, test } from "bun:test"

import {
  SALE_ITEM_PICKER_COMPACT_LIMIT,
  commitSaleItemPickerDraft,
  getSaleItemPickerPresentation,
  getSelectableSaleItemChoices,
  openSaleItemPicker,
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

  test("counts only selectable choices", () => {
    expect(
      getSelectableSaleItemChoices([
        { id: "available" },
        { disabledReason: "Out of stock", id: "unavailable" },
      ]),
    ).toEqual([{ id: "available" }])
  })

  test("opens from loaded choices immediately and leaves unloaded pages to the picker", () => {
    const choices = [{ id: "loaded" }]
    const opened: string[] = []

    expect(
      openSaleItemPicker({
        choices,
        hasUnloadedChoices: true,
        onOpenScreen: () => opened.push("screen"),
        onOpenSheet: () => opened.push("sheet"),
      }),
    ).toBe("screen")
    expect(opened).toEqual(["screen"])

    expect(
      openSaleItemPicker({
        choices,
        hasUnloadedChoices: false,
        onOpenScreen: () => opened.push("screen"),
        onOpenSheet: (loadedChoices) =>
          opened.push(`sheet:${loadedChoices.length}`),
      }),
    ).toBe("sheet")
    expect(opened).toEqual(["screen", "sheet:1"])
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
