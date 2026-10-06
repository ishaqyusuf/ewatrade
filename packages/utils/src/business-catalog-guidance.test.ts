import { describe, expect, test } from "bun:test"
import {
  BUSINESS_CATALOG_GUIDANCE,
  DEFAULT_CATALOG_GUIDANCE,
  appendCatalogOptionValue,
  canAddCatalogOptionValue,
  findCatalogOptionSuggestion,
  getCatalogOptionSuggestions,
  getCatalogOptionValueSuggestions,
  resolveCatalogFormGuidance,
  validateBusinessCatalogGuidance,
} from "./business-catalog-guidance"
import { BUSINESS_PROFILES } from "./business-profiles"
import { CATALOG_SETUP_HELPERS } from "./catalog-setup-helpers"

const farm = "animal-feed-agricultural-supplies"
const resolve = (
  key: string | null,
  kind: "product" | "service" = "product",
  helper?: string,
) =>
  resolveCatalogFormGuidance({
    businessProfileKey: key,
    kind,
    selectedHelperKey: helper,
  })

describe("business-aware Catalog guidance", () => {
  test("all fifteen business choices have complete Product and Service examples", () => {
    expect(
      Object.keys(BUSINESS_CATALOG_GUIDANCE.byBusinessProfile),
    ).toHaveLength(15)
    for (const profile of BUSINESS_PROFILES) {
      for (const kind of ["product", "service"] as const) {
        const guidance = resolve(profile.key, kind)
        expect(guidance.name.examples.length).toBeGreaterThan(0)
        expect(guidance.name.placeholder).toContain(
          guidance.name.examples[0] ?? "",
        )
        expect(guidance.options.suggestedOptions.length).toBeGreaterThan(0)
        for (const option of guidance.options.suggestedOptions) {
          expect(option.suggestedValues.length).toBeGreaterThan(0)
          expect(option.valuePlaceholder).toContain(
            option.suggestedValues[0] ?? "",
          )
          expect(findCatalogOptionSuggestion(guidance, option.label)?.key).toBe(
            option.key,
          )
        }
        if (kind === "service") expect(guidance.stockUnit).toBeUndefined()
      }
    }
  })

  test("farm form separates bird choices, egg sizes and apparel sizes", () => {
    const guidance = resolve(farm)
    expect(guidance.name.placeholder).toBe(
      "e.g. Fresh eggs, Live broiler, Fresh tomatoes",
    )
    expect(guidance.stockUnit?.suggestions).toContain("Bird")
    expect(getCatalogOptionValueSuggestions(guidance, "Bird type")).toEqual([
      "Broiler",
      "Layer",
      "Cockerel",
    ])
    expect(getCatalogOptionValueSuggestions(guidance, "  SIZE  ")).toEqual([
      "Small",
      "Medium",
      "Large",
    ])
    expect(
      getCatalogOptionValueSuggestions(resolve("fashion-apparel"), "Size"),
    ).toEqual(["XS", "S", "M", "L", "XL"])
    expect(
      getCatalogOptionSuggestions(guidance).map((option) => option.label),
    ).not.toContain("Colour")
  })

  test("helper narrows farm guidance without mutating recipes or adding values", () => {
    const eggs = resolve(farm, "product", "farm-eggs-tray")
    expect(eggs.stockUnit?.suggestions).toEqual(["Egg"])
    expect(eggs.options.suggestedOptions.map((option) => option.label)).toEqual(
      ["Egg size", "Grade"],
    )
    expect(
      eggs.options.suggestedOptions.some(
        (option) => option.label === "Bird type",
      ),
    ).toBe(false)
    const eggRecipe = CATALOG_SETUP_HELPERS.find(
      (helper) => helper.key === "farm-eggs-tray",
    )
    expect(eggRecipe?.setup.optionGroups).toEqual([])
    const poultry = resolve(farm, "product", "farm-live-poultry")
    expect(poultry.stockUnit?.suggestions).toEqual(["Bird"])
    expect(poultry.options.suggestedOptions).toHaveLength(1)
  })

  test("every helper resolves its own configured options and example values", () => {
    for (const helper of CATALOG_SETUP_HELPERS) {
      const guidance = resolve(farm, helper.kind, helper.key)
      for (const group of helper.setup.optionGroups) {
        expect(
          findCatalogOptionSuggestion(guidance, group.name)?.suggestedValues,
        ).toEqual(group.values)
      }
      if (helper.kind === "service") expect(guidance.stockUnit).toBeUndefined()
      if (helper.suggestedName)
        expect(guidance.name.placeholder).toBe(`e.g. ${helper.suggestedName}`)
    }
  })

  test("explicit cross-business helper overrides display, not business profile", () => {
    const clothing = resolve(farm, "product", "apparel-size-colour")
    expect(getCatalogOptionValueSuggestions(clothing, "Size")).toEqual([
      "S",
      "M",
      "L",
      "XL",
    ])
    expect(clothing.name.placeholder).toBe("e.g. Clothing Item")
    expect(resolve(farm).name.placeholder).toBe(
      "e.g. Fresh eggs, Live broiler, Fresh tomatoes",
    )
  })

  test("missing or retired profile and mismatched helpers fall back safely", () => {
    for (const key of [null, "retired-profile", "__proto__"]) {
      expect(resolve(key)).toBe(DEFAULT_CATALOG_GUIDANCE.product)
      expect(resolve(key, "service")).toBe(DEFAULT_CATALOG_GUIDANCE.service)
    }
    expect(resolve(farm, "product", "device-repair")).toBe(resolve(farm))
    expect(resolve(farm, "product", "unknown")).toBe(resolve(farm))
  })

  test("search and selected-value exclusion normalize spacing, aliases and case", () => {
    const guidance = resolve("fashion-apparel")
    expect(
      getCatalogOptionSuggestions(guidance, { query: "color" }).map(
        (option) => option.label,
      ),
    ).toEqual(["Colour"])
    expect(
      getCatalogOptionSuggestions(guidance, { usedNames: [" COLOR "] }).map(
        (option) => option.label,
      ),
    ).not.toContain("Colour")
    expect(
      getCatalogOptionValueSuggestions(guidance, "color", {
        selectedValues: [" black ", "WHITE"],
        query: "blue",
      }),
    ).toEqual(["Blue"])
    expect(
      getCatalogOptionValueSuggestions(guidance, "My custom option"),
    ).toEqual([])
  })

  test("web value append preserves custom entries and ignores duplicate clicks", () => {
    expect(appendCatalogOptionValue(" Custom, blue, ", "Blue")).toBe(
      " Custom, blue, ",
    )
    expect(appendCatalogOptionValue("Custom, Blue, ", "Red")).toBe(
      "Custom, Blue, Red",
    )
  })

  test("value additions remain within existing combination limits", () => {
    const values = (count: number) =>
      Array.from({ length: count }, (_, index) => String(index))
    expect(
      canAddCatalogOptionValue(
        [{ values: values(12) }, { values: values(7) }],
        1,
      ),
    ).toBe(true)
    expect(
      canAddCatalogOptionValue(
        [{ values: values(12) }, { values: values(8) }],
        1,
      ),
    ).toBe(false)
    expect(canAddCatalogOptionValue([{ values: values(100) }], 0)).toBe(false)
    expect(canAddCatalogOptionValue([], -1)).toBe(false)
  })

  test("published guidance and resolved helper arrays are immutable", () => {
    expect(Object.isFrozen(BUSINESS_CATALOG_GUIDANCE.byBusinessProfile)).toBe(
      true,
    )
    expect(
      Object.isFrozen(
        resolve(farm).options.suggestedOptions[0]?.suggestedValues,
      ),
    ).toBe(true)
    expect(
      Object.isFrozen(
        resolve(farm, "product", "farm-live-poultry").options.suggestedOptions,
      ),
    ).toBe(true)
  })

  test("validator rejects missing profiles, empty values and runtime fields", () => {
    const missing = structuredClone(BUSINESS_CATALOG_GUIDANCE)
    const mutable = JSON.parse(JSON.stringify(missing))
    delete mutable.byBusinessProfile[farm]
    expect(() => validateBusinessCatalogGuidance(mutable)).toThrow()
    const invalid = JSON.parse(JSON.stringify(BUSINESS_CATALOG_GUIDANCE))
    invalid.byBusinessProfile[
      farm
    ].product.options.suggestedOptions[0].suggestedValues = []
    expect(() => validateBusinessCatalogGuidance(invalid)).toThrow()
    const runtime = JSON.parse(JSON.stringify(BUSINESS_CATALOG_GUIDANCE))
    runtime.defaults.service.stockUnit = { placeholder: "Bag" }
    expect(() => validateBusinessCatalogGuidance(runtime)).toThrow()
    const price = JSON.parse(JSON.stringify(BUSINESS_CATALOG_GUIDANCE))
    price.byBusinessProfile[farm].product.price = 100
    expect(() => validateBusinessCatalogGuidance(price)).toThrow()
  })

  test("validator rejects ambiguous aliases and comma-containing values", () => {
    const aliases = JSON.parse(JSON.stringify(BUSINESS_CATALOG_GUIDANCE))
    aliases.byBusinessProfile[
      farm
    ].product.options.suggestedOptions[1].aliases.push("Bird type")
    expect(() => validateBusinessCatalogGuidance(aliases)).toThrow()
    const comma = JSON.parse(JSON.stringify(BUSINESS_CATALOG_GUIDANCE))
    comma.byBusinessProfile[
      farm
    ].product.options.suggestedOptions[0].suggestedValues.push("One, Two")
    expect(() => validateBusinessCatalogGuidance(comma)).toThrow()
  })
})
