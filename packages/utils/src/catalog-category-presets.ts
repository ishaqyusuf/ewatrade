import { BUSINESS_PROFILES } from "./business-profiles"
import categoryFile from "./catalog-category-presets.json"
import type { CatalogSetupHelperKind } from "./catalog-setup-helpers"

export type CatalogSubcategoryPreset = {
  readonly key: string
  readonly label: string
}
export type CatalogCategoryPreset = {
  readonly key: string
  readonly label: string
  readonly itemKinds: readonly CatalogSetupHelperKind[]
  readonly businessProfileKeys: readonly string[]
  readonly subcategories: readonly CatalogSubcategoryPreset[]
}
export type CatalogCategoryConfig = {
  readonly schemaVersion: 1
  readonly categories: readonly CatalogCategoryPreset[]
}

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase()

// Suggestions are vocabulary, never permissions, publication or stock rules.
export function validateCatalogCategoryConfig(
  value: unknown,
): asserts value is CatalogCategoryConfig {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("categories" in value) ||
    !Array.isArray(value.categories)
  )
    throw new Error(
      "Catalog category config requires schema version 1 and categories.",
    )
  const profileKeys = new Set(BUSINESS_PROFILES.map((profile) => profile.key))
  const keys = new Set<string>()
  const labels = new Set<string>()
  const validText = (text: unknown): text is string =>
    typeof text === "string" && Boolean(text.trim()) && text.length <= 80
  for (const category of value.categories) {
    if (
      !category ||
      !validText(category.key) ||
      !/^[a-z0-9-]+$/.test(category.key) ||
      !validText(category.label) ||
      !Array.isArray(category.itemKinds) ||
      !category.itemKinds.length ||
      category.itemKinds.some(
        (kind: unknown) => kind !== "product" && kind !== "service",
      ) ||
      !Array.isArray(category.businessProfileKeys) ||
      category.businessProfileKeys.some(
        (key: unknown) => typeof key !== "string" || !profileKeys.has(key),
      ) ||
      !Array.isArray(category.subcategories)
    )
      throw new Error(
        "Catalog category preset has invalid identity, kind or business mapping.",
      )
    if (keys.has(category.key) || labels.has(normalize(category.label)))
      throw new Error(
        "Catalog category preset repeats an identity or root label.",
      )
    keys.add(category.key)
    labels.add(normalize(category.label))
    const childLabels = new Set<string>()
    for (const child of category.subcategories) {
      if (
        !child ||
        !validText(child.key) ||
        !child.key.startsWith(`${category.key}:`) ||
        !validText(child.label) ||
        keys.has(child.key) ||
        childLabels.has(normalize(child.label))
      )
        throw new Error(
          "Catalog subcategory requires a unique identity under its parent.",
        )
      keys.add(child.key)
      childLabels.add(normalize(child.label))
    }
  }
  for (const profile of BUSINESS_PROFILES) {
    // Other/Mixed intentionally suggests all vocabulary; it adds no restrictions.
    if (profile.key === "other-mixed-business") continue
    if (
      !value.categories.some((category) =>
        category.businessProfileKeys.includes(profile.key),
      )
    )
      throw new Error(
        `Catalog category config misses business profile ${profile.key}.`,
      )
  }
}

function freezeConfig<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeConfig(child)
    Object.freeze(value)
  }
  return value
}
validateCatalogCategoryConfig(categoryFile)
export const CATALOG_CATEGORY_CONFIG: CatalogCategoryConfig =
  freezeConfig(categoryFile)
export const CATALOG_CATEGORY_PRESETS = CATALOG_CATEGORY_CONFIG.categories

export function getCatalogCategoryPresets({
  businessProfileKey,
  kind,
  query = "",
  all = false,
}: {
  businessProfileKey?: string | null
  kind: CatalogSetupHelperKind
  query?: string
  all?: boolean
}) {
  const search = normalize(query)
  const knownProfile = BUSINESS_PROFILES.some(
    (profile) => profile.key === businessProfileKey,
  )
  return CATALOG_CATEGORY_PRESETS.filter(
    (category) =>
      category.itemKinds.includes(kind) &&
      (all ||
        !knownProfile ||
        businessProfileKey === "other-mixed-business" ||
        category.businessProfileKeys.includes(businessProfileKey ?? "")) &&
      (!search ||
        [
          category.label,
          ...category.subcategories.map((child) => child.label),
        ].some((label) => normalize(label).includes(search))),
  )
}

export function findCatalogCategoryPreset(key: string | null | undefined) {
  return CATALOG_CATEGORY_PRESETS.find((category) => category.key === key)
}
