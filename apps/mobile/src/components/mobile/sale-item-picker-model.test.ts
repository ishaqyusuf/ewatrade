import { describe, expect, test } from "bun:test"

import {
  SALE_ITEM_PICKER_COMPACT_LIMIT,
  addSaleItemPickerLine,
  getSaleItemPickerPresentation,
  getSaleOfferingStockLabel,
  getSelectableSaleItemChoices,
  openSaleItemPicker,
  removeSaleItemPickerLine,
  selectInitialCatalogItemLine,
  updateSaleItemPickerLineQuantity,
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

  test("describes the exact stock available for Product choices", () => {
    expect(
      getSaleOfferingStockLabel({
        availableQuantity: "12.5",
        kind: "product_unit",
        unitName: "Bag",
      }),
    ).toBe("12.5 Bag available")
    expect(
      getSaleOfferingStockLabel({
        kind: "service",
        unitName: "Visit",
      }),
    ).toBeNull()
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

describe("sale item picker lines", () => {
  test("adds the same offering as independent quantity lines", () => {
    const offering = { id: "offering-1", name: "Rice" }
    const first = addSaleItemPickerLine({
      lineId: "line-1",
      lines: [],
      offering,
    })
    const second = addSaleItemPickerLine({
      lineId: "line-2",
      lines: first,
      offering,
    })

    const withDifferentQuantities = updateSaleItemPickerLineQuantity(
      updateSaleItemPickerLineQuantity(second, "line-1", "2"),
      "line-2",
      "5",
    )

    expect(withDifferentQuantities).toEqual([
      { id: "line-1", offering, quantity: "2" },
      { id: "line-2", offering, quantity: "5" },
    ])
    expect(removeSaleItemPickerLine(withDifferentQuantities, "line-1")).toEqual(
      [{ id: "line-2", offering, quantity: "5" }],
    )
  })

  test("preselects the first sellable offering for a contextual catalog item once", () => {
    const choices = [
      {
        catalogItemId: "product-1",
        disabledReason: "Out of stock",
        id: "offering-disabled",
      },
      {
        catalogItemId: "product-1",
        id: "offering-ready",
      },
    ]
    const selected = selectInitialCatalogItemLine({
      catalogItemId: "product-1",
      choices,
      lineId: "line-1",
      lines: [],
    })

    expect(selected).toEqual([
      {
        id: "line-1",
        offering: choices[1],
        quantity: "1",
      },
    ])
    expect(
      selectInitialCatalogItemLine({
        catalogItemId: "product-1",
        choices,
        lineId: "line-2",
        lines: selected,
      }),
    ).toBe(selected)
  })
})
