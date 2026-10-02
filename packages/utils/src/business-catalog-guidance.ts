import guidanceFile from "./business-catalog-guidance.json"
import { BUSINESS_PROFILES, findBusinessProfile } from "./business-profiles"
import {
  type CatalogSetupHelperKind,
  findCatalogSetupHelper,
} from "./catalog-setup-helpers"

export type CatalogOptionSuggestion = {
  readonly key: string
  readonly label: string
  readonly aliases: readonly string[]
  readonly namePlaceholder: string
  readonly helperText: string
  readonly valuePlaceholder: string
  readonly suggestedValues: readonly string[]
}

type CatalogGuidanceFields = {
  readonly name: {
    readonly placeholder: string
    readonly examples: readonly string[]
  }
  readonly description: {
    readonly placeholder: string
    readonly helperText: string
  }
  readonly options: {
    readonly namePlaceholder: string
    readonly helperText: string
    readonly suggestedOptions: readonly CatalogOptionSuggestion[]
  }
}

export type ProductCatalogGuidance = CatalogGuidanceFields & {
  readonly kind: "product"
  readonly stockUnit: {
    readonly placeholder: string
    readonly helperText: string
    readonly suggestions: readonly string[]
  }
}
export type ServiceCatalogGuidance = CatalogGuidanceFields & {
  readonly kind: "service"
  readonly stockUnit?: never
}
export type CatalogFormGuidance =
  | ProductCatalogGuidance
  | ServiceCatalogGuidance
type BusinessCatalogGuidance = {
  readonly product: ProductCatalogGuidance
  readonly service: ServiceCatalogGuidance
}
type CatalogGuidanceFile = {
  readonly schemaVersion: 1
  readonly defaults: BusinessCatalogGuidance
  readonly byBusinessProfile: Readonly<Record<string, BusinessCatalogGuidance>>
  readonly byHelper: Readonly<Record<string, CatalogFormGuidance>>
}

export function normalizeCatalogSuggestion(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
function requireRecord(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error("Catalog guidance contains unsupported fields.")
}
function requireText(value: unknown, max = 240): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Catalog guidance requires bounded, non-empty text.")
}
function requireTexts(
  value: unknown,
  max: number,
  allowEmpty = false,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    (!allowEmpty && !value.length)
  )
    throw new Error("Catalog guidance requires bounded example arrays.")
  const seen = new Set<string>()
  for (const entry of value) {
    requireText(entry, max)
    const normalized = normalizeCatalogSuggestion(entry)
    if (seen.has(normalized))
      throw new Error("Catalog guidance repeats an example.")
    seen.add(normalized)
  }
}

function requireGuidance(
  value: unknown,
  kind: CatalogSetupHelperKind,
): asserts value is CatalogFormGuidance {
  requireRecord(value, [
    "kind",
    "name",
    "description",
    "options",
    ...(kind === "product" ? ["stockUnit"] : []),
  ])
  if (value.kind !== kind)
    throw new Error("Catalog guidance has an incompatible item kind.")
  requireRecord(value.name, ["placeholder", "examples"])
  requireText(value.name.placeholder)
  requireTexts(value.name.examples, 160)
  requireRecord(value.description, ["placeholder", "helperText"])
  requireText(value.description.placeholder)
  requireText(value.description.helperText)
  requireRecord(value.options, [
    "namePlaceholder",
    "helperText",
    "suggestedOptions",
  ])
  requireText(value.options.namePlaceholder)
  requireText(value.options.helperText)
  const options = value.options.suggestedOptions
  if (!Array.isArray(options) || !options.length || options.length > 12)
    throw new Error("Catalog guidance requires option suggestions.")
  const keys = new Set<string>()
  const names = new Set<string>()
  for (const option of options) {
    requireRecord(option, [
      "key",
      "label",
      "aliases",
      "namePlaceholder",
      "helperText",
      "valuePlaceholder",
      "suggestedValues",
    ])
    requireText(option.key, 120)
    requireText(option.label, 80)
    requireTexts(option.aliases, 80, true)
    requireText(option.namePlaceholder)
    requireText(option.helperText)
    requireText(option.valuePlaceholder)
    requireTexts(option.suggestedValues, 80)
    if (option.suggestedValues.some((entry) => entry.includes(",")))
      throw new Error("Catalog value examples cannot contain comma separators.")
    if (keys.has(option.key))
      throw new Error("Catalog guidance repeats an option key.")
    keys.add(option.key)
    for (const name of [option.label, ...option.aliases]) {
      const normalized = normalizeCatalogSuggestion(name)
      if (names.has(normalized))
        throw new Error("Catalog guidance has ambiguous option names.")
      names.add(normalized)
    }
  }
  if (kind === "product") {
    requireRecord(value.stockUnit, ["placeholder", "helperText", "suggestions"])
    requireText(value.stockUnit.placeholder)
    requireText(value.stockUnit.helperText)
    requireTexts(value.stockUnit.suggestions, 80)
  }
}

export function validateBusinessCatalogGuidance(
  value: unknown,
): asserts value is CatalogGuidanceFile {
  requireRecord(value, [
    "schemaVersion",
    "defaults",
    "byBusinessProfile",
    "byHelper",
  ])
  if (value.schemaVersion !== 1)
    throw new Error("Catalog guidance must use schema version 1.")
  requireRecord(value.defaults, ["product", "service"])
  requireGuidance(value.defaults.product, "product")
  requireGuidance(value.defaults.service, "service")
  if (!record(value.byBusinessProfile) || !record(value.byHelper))
    throw new Error("Catalog guidance requires profile and helper maps.")
  for (const key of Object.keys(value.byBusinessProfile)) {
    if (!findBusinessProfile(key))
      throw new Error(`Unknown Catalog guidance business profile: ${key}.`)
  }
  for (const profile of BUSINESS_PROFILES) {
    const entry = value.byBusinessProfile[profile.key]
    requireRecord(entry, ["product", "service"])
    requireGuidance(entry.product, "product")
    requireGuidance(entry.service, "service")
  }
  for (const [key, entry] of Object.entries(value.byHelper)) {
    const helper = findCatalogSetupHelper(key)
    if (!helper) throw new Error(`Unknown Catalog guidance helper: ${key}.`)
    requireGuidance(entry, helper.kind)
  }
}

function freezeGuidance<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeGuidance(child)
    Object.freeze(value)
  }
  return value
}
validateBusinessCatalogGuidance(guidanceFile)
export const BUSINESS_CATALOG_GUIDANCE: CatalogGuidanceFile =
  freezeGuidance(guidanceFile)
export const DEFAULT_CATALOG_GUIDANCE = BUSINESS_CATALOG_GUIDANCE.defaults

export function findCatalogOptionSuggestion(
  guidance: CatalogFormGuidance,
  label: string,
) {
  const normalized = normalizeCatalogSuggestion(label)
  return guidance.options.suggestedOptions.find((option) =>
    [option.label, ...option.aliases].some(
      (name) => normalizeCatalogSuggestion(name) === normalized,
    ),
  )
}

export function resolveCatalogFormGuidance({
  businessProfileKey,
  kind,
  selectedHelperKey,
}: {
  businessProfileKey: string | null | undefined
  kind: CatalogSetupHelperKind
  selectedHelperKey?: string | null
}): CatalogFormGuidance {
  const profile = findBusinessProfile(businessProfileKey)
  const base =
    (profile
      ? BUSINESS_CATALOG_GUIDANCE.byBusinessProfile[profile.key]?.[kind]
      : undefined) ?? DEFAULT_CATALOG_GUIDANCE[kind]
  const helper = selectedHelperKey
    ? findCatalogSetupHelper(selectedHelperKey)
    : undefined
  if (!helper || helper.kind !== kind) return base
  const helperProfileKey = helper.businessProfileKeys?.[0]
  const specific =
    BUSINESS_CATALOG_GUIDANCE.byHelper[helper.key] ??
    (helperProfileKey
      ? BUSINESS_CATALOG_GUIDANCE.byBusinessProfile[helperProfileKey]?.[kind]
      : undefined) ??
    base
  const recipeOptions = helper.setup.optionGroups.map(
    (group, index): CatalogOptionSuggestion => {
      const matching = findCatalogOptionSuggestion(specific, group.name)
      return {
        key: `helper:${helper.key}:${index}`,
        label: group.name,
        aliases:
          matching?.aliases.filter(
            (alias) =>
              normalizeCatalogSuggestion(alias) !==
              normalizeCatalogSuggestion(group.name),
          ) ?? [],
        namePlaceholder: `e.g. ${group.name}`,
        helperText:
          matching?.helperText ?? "Choose the values you actually offer.",
        valuePlaceholder: `e.g. ${group.values.slice(0, 3).join(", ")}`,
        suggestedValues: [...group.values],
      }
    },
  )
  const resolved = {
    ...specific,
    name: helper.suggestedName
      ? {
          placeholder: `e.g. ${helper.suggestedName}`,
          examples: [helper.suggestedName],
        }
      : specific.name,
    options: recipeOptions.length
      ? {
          namePlaceholder: `e.g. ${recipeOptions
            .map((option) => option.label)
            .slice(0, 3)
            .join(", ")}`,
          helperText: "Add the customer choices relevant to this item.",
          suggestedOptions: recipeOptions,
        }
      : specific.options,
  }
  if (helper.kind === "product") {
    return freezeGuidance({
      ...resolved,
      kind: "product",
      stockUnit: {
        placeholder: `e.g. ${helper.setup.units[0]?.name ?? "Piece"}`,
        helperText:
          "Use the main unit configured by this setup. Additional selling units are configured separately.",
        suggestions: [helper.setup.units[0]?.name ?? "Piece"],
      },
    })
  }
  return freezeGuidance({ ...resolved, kind: "service", stockUnit: undefined })
}

export function getCatalogOptionSuggestions(
  guidance: CatalogFormGuidance,
  {
    query = "",
    usedNames = [],
    limit = 5,
  }: { query?: string; usedNames?: readonly string[]; limit?: number } = {},
) {
  const used = new Set(
    usedNames
      .map((name) => findCatalogOptionSuggestion(guidance, name)?.key)
      .filter(Boolean),
  )
  const available = guidance.options.suggestedOptions.filter(
    (option) => !used.has(option.key),
  )
  const search = normalizeCatalogSuggestion(query)
  const matches = search
    ? available.filter((option) =>
        [option.label, ...option.aliases].some((name) =>
          normalizeCatalogSuggestion(name).includes(search),
        ),
      )
    : available
  return matches.slice(0, limit)
}

export function getCatalogOptionValueSuggestions(
  guidance: CatalogFormGuidance,
  label: string,
  {
    query = "",
    selectedValues = [],
    limit = 5,
  }: {
    query?: string
    selectedValues?: readonly string[]
    limit?: number
  } = {},
) {
  const selected = new Set(selectedValues.map(normalizeCatalogSuggestion))
  const search = normalizeCatalogSuggestion(query)
  return (findCatalogOptionSuggestion(guidance, label)?.suggestedValues ?? [])
    .filter(
      (value) =>
        !selected.has(normalizeCatalogSuggestion(value)) &&
        (!search || normalizeCatalogSuggestion(value).includes(search)),
    )
    .slice(0, limit)
}

export function getCatalogOptionValueHint(
  guidance: CatalogFormGuidance,
  label: string,
) {
  const values = getCatalogOptionValueSuggestions(guidance, label, { limit: 3 })
  return values.length
    ? `Try ${values.join(", ")}, or your own value.`
    : "Add your own customer choices for this option."
}

export function appendCatalogOptionValue(current: string, label: string) {
  const values = current
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (
    values.some(
      (value) =>
        normalizeCatalogSuggestion(value) === normalizeCatalogSuggestion(label),
    )
  )
    return current
  return [...values, label].join(", ")
}

export function canAddCatalogOptionValue(
  groups: readonly { values: readonly string[] }[],
  activeIndex: number,
) {
  if (
    groups.length > 12 ||
    !groups[activeIndex] ||
    groups[activeIndex].values.length >= 100
  )
    return false
  return (
    groups.reduce(
      (count, group, index) =>
        count *
        Math.max(1, group.values.length + (index === activeIndex ? 1 : 0)),
      1,
    ) <= 96
  )
}
