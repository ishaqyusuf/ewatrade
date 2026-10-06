import { describe, expect, test } from "bun:test"
import {
  catalogCategoryEmoji,
  catalogCategoryLabelEmoji,
} from "./catalog-category-emojis"
import { CATALOG_CATEGORY_PRESETS } from "./catalog-category-presets"
import {
  DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
  readCategorySuggestionConfiguration,
} from "./catalog-category-suggestions"

describe("category suggestion configuration and vocabulary", () => {
  test("seed enables DeepSeek Flash and persisted OFF is respected", () => {
    expect(
      readCategorySuggestionConfiguration(
        DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
      ),
    ).toEqual({
      schemaVersion: 1,
      enabled: true,
      provider: "DEEPSEEK",
      model: "deepseek-flash",
    })
    expect(
      readCategorySuggestionConfiguration({
        ...DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION,
        enabled: false,
      })?.enabled,
    ).toBe(false)
  })
  test.each(
    [
      null,
      {},
      [],
      "enabled",
      {
        schemaVersion: 2,
        enabled: true,
        provider: "DEEPSEEK",
        model: "deepseek-flash",
      },
      {
        schemaVersion: 1,
        enabled: "true",
        provider: "DEEPSEEK",
        model: "deepseek-flash",
      },
      {
        schemaVersion: 1,
        enabled: true,
        provider: "OTHER",
        model: "deepseek-flash",
      },
      {
        schemaVersion: 1,
        enabled: true,
        provider: "OPENAI",
        model: "deepseek-flash",
      },
    ].map((value) => ({ value })),
  )("malformed or unsupported config fails closed: %j", ({ value }) => {
    expect(readCategorySuggestionConfiguration(value)).toBeNull()
  })
  test("OpenAI 4.1 is an allowed provider/model pair", () => {
    expect(
      readCategorySuggestionConfiguration({
        schemaVersion: 1,
        enabled: true,
        provider: "OPENAI",
        model: "gpt-4.1",
      })?.model,
    ).toBe("gpt-4.1")
  })
  test("all 22 roots and 88 children have stable-key emojis", () => {
    let children = 0
    for (const root of CATALOG_CATEGORY_PRESETS) {
      expect(catalogCategoryEmoji(root.key)).not.toBe("🏷️")
      expect(catalogCategoryLabelEmoji(root.label)).toBe(
        catalogCategoryEmoji(root.key),
      )
      for (const child of root.subcategories) {
        children += 1
        expect(catalogCategoryEmoji(child.key)).not.toBe("🏷️")
        expect(catalogCategoryEmoji(`preset:${child.key}`)).toBe(
          catalogCategoryEmoji(child.key),
        )
        expect(
          catalogCategoryLabelEmoji(`${root.label} / ${child.label}`),
        ).toBe(catalogCategoryEmoji(child.key))
      }
    }
    expect(CATALOG_CATEGORY_PRESETS).toHaveLength(22)
    expect(children).toBe(88)
    expect(catalogCategoryEmoji("custom:label")).toBe("🏷️")
  })
})
