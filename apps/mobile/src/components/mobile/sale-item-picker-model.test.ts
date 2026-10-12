import { describe, expect, test } from "bun:test"

import {
  addSaleItemPickerLine,
  getSaleOfferingStockLabel,
  getSelectableSaleItemChoices,
  removeSaleItemPickerLine,
  selectInitialCatalogItemLine,
  updateSaleItemPickerLineQuantity,
} from "./sale-item-picker-model"

describe("sale item choices", () => {
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
})

describe("sale item picker lines", () => {
  test("retains the selected Catalog option and never substitutes an unavailable one", () => {
    const choices = [
      { id: "first", catalogItemId: "item" },
      { id: "chosen", catalogItemId: "item" },
      { id: "disabled", catalogItemId: "item", disabledReason: "Out of stock" },
      { id: "other", catalogItemId: "other-item" },
    ]
    const select = (offeringId: string) =>
      selectInitialCatalogItemLine({
        catalogItemId: "item",
        offeringId,
        choices,
        lineId: "line",
        lines: [],
      })
    expect(select("chosen")[0]?.offering.id).toBe("chosen")
    expect(select("missing")).toEqual([])
    expect(select("disabled")).toEqual([])
    expect(select("other")).toEqual([])
  })
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
