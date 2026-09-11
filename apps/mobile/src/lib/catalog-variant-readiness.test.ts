import { describe, expect, test } from "bun:test"

import {
  isCatalogVariantPriceReady,
  isCatalogVariantQuantityReady,
} from "./catalog-variant-readiness"

describe("catalog variant readiness", () => {
  test("requires a parseable price instead of any nonblank string", () => {
    expect(isCatalogVariantPriceReady("")).toBe(false)
    expect(isCatalogVariantPriceReady(".")).toBe(false)
    expect(isCatalogVariantPriceReady("2500.50")).toBe(true)
  })

  test("requires exact quantity syntax within the stock-unit scale", () => {
    expect(isCatalogVariantQuantityReady("", 2)).toBe(false)
    expect(isCatalogVariantQuantityReady(".", 2)).toBe(false)
    expect(isCatalogVariantQuantityReady("1.234", 2)).toBe(false)
    expect(isCatalogVariantQuantityReady("1.25", 2)).toBe(true)
  })
})
