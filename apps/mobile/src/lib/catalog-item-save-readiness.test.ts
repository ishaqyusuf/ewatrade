import { describe, expect, test } from "bun:test"

import { getCatalogItemSaveReadiness } from "./catalog-item-save-readiness"

describe("catalog item save readiness", () => {
  test("keeps a blank Product visibly incomplete", () => {
    expect(
      getCatalogItemSaveReadiness({
        defaultQuoteRequired: false,
        kind: "product",
        name: "",
        price: "",
        showAdvanced: false,
        unitName: "",
      }),
    ).toEqual({
      canSave: false,
      hint: "Enter a product name to continue.",
    })
  })

  test("requires a stock unit for a simple Product but not an optional price", () => {
    expect(
      getCatalogItemSaveReadiness({
        defaultQuoteRequired: false,
        kind: "product",
        name: "Ankara tote bag",
        price: "",
        showAdvanced: false,
        unitName: "",
      }),
    ).toMatchObject({ canSave: false, hint: "Enter a stock unit to continue." })

    expect(
      getCatalogItemSaveReadiness({
        defaultQuoteRequired: false,
        kind: "product",
        name: "Ankara tote bag",
        price: "",
        showAdvanced: false,
        unitName: "Piece",
      }),
    ).toEqual({ canSave: true })
  })

  test("rejects malformed money before enabling a save attempt", () => {
    expect(
      getCatalogItemSaveReadiness({
        defaultQuoteRequired: false,
        kind: "product",
        name: "Ankara tote bag",
        price: "not-a-price",
        showAdvanced: false,
        unitName: "Piece",
      }),
    ).toEqual({
      canSave: false,
      hint: "Enter a valid price to continue.",
    })
  })

  test("accepts quote-only Services without a fixed price", () => {
    expect(
      getCatalogItemSaveReadiness({
        defaultQuoteRequired: true,
        kind: "service",
        name: "Interior consultation",
        price: "",
        showAdvanced: false,
        unitName: "",
      }),
    ).toEqual({ canSave: true })
  })
})
