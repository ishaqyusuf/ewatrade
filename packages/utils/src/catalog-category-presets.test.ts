import { describe, expect, test } from "bun:test"
import { BUSINESS_PROFILES } from "./business-profiles"
import {
  CATALOG_CATEGORY_CONFIG,
  findCatalogCategoryPreset,
  getCatalogCategoryPresets,
  validateCatalogCategoryConfig,
} from "./catalog-category-presets"

describe("Catalog category vocabulary", () => {
  test("all current business profiles have a suggestion path, without forcing a selection", () => {
    for (const profile of BUSINESS_PROFILES) {
      const supportedKinds = profile.recommendedItemKinds
      expect(
        supportedKinds.some(
          (kind) =>
            getCatalogCategoryPresets({ businessProfileKey: profile.key, kind })
              .length > 0,
        ),
      ).toBe(true)
    }
    expect(findCatalogCategoryPreset(null)).toBeUndefined()
    expect(
      Object.isFrozen(CATALOG_CATEGORY_CONFIG.categories[0]?.subcategories),
    ).toBe(true)
  })
  test("farming recommends poultry while fashion can still browse poultry", () => {
    expect(
      getCatalogCategoryPresets({
        businessProfileKey: "animal-feed-agricultural-supplies",
        kind: "product",
      }).some((category) => category.key === "poultry"),
    ).toBe(true)
    expect(
      getCatalogCategoryPresets({
        businessProfileKey: "fashion-apparel",
        kind: "product",
      }).some((category) => category.key === "poultry"),
    ).toBe(false)
    expect(
      getCatalogCategoryPresets({
        businessProfileKey: "fashion-apparel",
        kind: "product",
        all: true,
      }).some((category) => category.key === "poultry"),
    ).toBe(true)
  })
  test("unknown and mixed profiles retain the complete kind-specific vocabulary", () => {
    for (const businessProfileKey of [
      null,
      "retired-profile",
      "other-mixed-business",
    ]) {
      expect(
        getCatalogCategoryPresets({ businessProfileKey, kind: "product" }),
      ).toEqual(getCatalogCategoryPresets({ kind: "product", all: true }))
    }
  })
  test("searching a subcategory returns its parent and services remain separate", () => {
    const result = getCatalogCategoryPresets({
      kind: "product",
      all: true,
      query: "  POULTRY feed ",
    })
    expect(result.map((category) => category.key)).toEqual(["animal-feed"])
    expect(
      getCatalogCategoryPresets({ kind: "service", all: true }).every(
        (category) => category.itemKinds.includes("service"),
      ),
    ).toBe(true)
    expect(
      getCatalogCategoryPresets({
        kind: "product",
        all: true,
        query: "dry cleaning",
      }),
    ).toEqual([])
  })
  test("a child cannot be reassigned to a different category key", () => {
    const config = structuredClone(CATALOG_CATEGORY_CONFIG)
    Object.assign(config.categories[0]?.subcategories[0] ?? {}, {
      key: "electronics:eggs",
    })
    expect(() => validateCatalogCategoryConfig(config)).toThrow(
      "under its parent",
    )
  })
  test("unknown business mappings and duplicate root labels are rejected", () => {
    const invalid = structuredClone(CATALOG_CATEGORY_CONFIG)
    Object.assign(invalid.categories[0] ?? {}, {
      businessProfileKeys: ["invented-farmer-profile"],
    })
    expect(() => validateCatalogCategoryConfig(invalid)).toThrow(
      "business mapping",
    )
    const duplicate = structuredClone(CATALOG_CATEGORY_CONFIG)
    Object.assign(duplicate.categories[1] ?? {}, { label: " Poultry " })
    expect(() => validateCatalogCategoryConfig(duplicate)).toThrow("root label")
  })
})
