import { expect, test } from "bun:test"
import { QUICK_SALE_DESCRIPTION_REQUIRED } from "@ewatrade/utils/catalog-free-lines"
import { CatalogError } from "./catalog-errors"
import {
  type CommercialOrderCustomLineInput,
  catalogFreeSnapshotNames,
  normalizeCatalogFreeLine,
} from "./catalog-free-lines"

test("canonical new Quick sale writes reject missing/whitespace words without rewriting input", () => {
  for (const description of [undefined, "", " \t\n\u00a0"]) {
    const input: CommercialOrderCustomLineInput = {
      custom: "quick_sale",
      amountMinor: 500,
      description,
    }
    const before = JSON.stringify(input)
    try {
      normalizeCatalogFreeLine(input)
      throw new Error("Expected canonical Quick sale rejection")
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError)
      if (!(error instanceof CatalogError)) throw error
      expect(error.code).toBe("INVALID_ORDER")
      expect(error.message).toBe(QUICK_SALE_DESCRIPTION_REQUIRED)
    }
    expect(JSON.stringify(input)).toBe(before)
  }
})

test("valid descriptions retain existing normalization, amount and length limits", () => {
  expect(
    normalizeCatalogFreeLine({
      custom: "quick_sale",
      amountMinor: 500,
      description: " Rice ",
    }),
  ).toEqual({ kind: "quick_sale", amountMinor: 500, description: "Rice" })
  expect(() =>
    normalizeCatalogFreeLine({
      custom: "quick_sale",
      amountMinor: 500,
      description: "a".repeat(201),
    }),
  ).toThrow("at most 200")
  expect(() =>
    normalizeCatalogFreeLine({
      custom: "quick_sale",
      amountMinor: 0,
      description: "Rice",
    }),
  ).toThrow("amount above zero")
  expect(
    normalizeCatalogFreeLine({ custom: "additional_cost", amountMinor: 500 }),
  ).toEqual({ kind: "additional_cost", amountMinor: 500, description: null })
})

test("historical blank Quick sale snapshots remain readable without new write validation", () => {
  expect(catalogFreeSnapshotNames("quick_sale", null)).toEqual({
    catalogItemName: "Quick sale",
    offeringName: "Quick sale",
    variantName: "Default",
  })
})
