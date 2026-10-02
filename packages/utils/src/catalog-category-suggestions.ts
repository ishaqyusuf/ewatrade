/** Shared, public configuration vocabulary. Provider credentials remain server-only. */
export const CATEGORY_SUGGESTION_CONFIG_KEY = "catalog.categorySuggestions"
export const CATEGORY_SUGGESTION_MODELS = {
  DEEPSEEK: [
    { id: "deepseek-flash", label: "Flash" },
    { id: "deepseek-v4-pro", label: "V4 Pro" },
  ],
  OPENAI: [
    { id: "gpt-4.1", label: "4.1" },
    { id: "gpt-4.1-mini", label: "4.1 Mini" },
  ],
} as const

export type CategorySuggestionProvider = keyof typeof CATEGORY_SUGGESTION_MODELS
export type CategorySuggestionConfiguration = {
  schemaVersion: 1
  enabled: boolean
  provider: CategorySuggestionProvider
  model: string
}
export const DEFAULT_CATEGORY_SUGGESTION_CONFIGURATION: CategorySuggestionConfiguration =
  {
    schemaVersion: 1,
    enabled: true,
    provider: "DEEPSEEK",
    model: "deepseek-flash",
  }

/** Missing/invalid persisted configuration fails closed rather than enabling a provider. */
export function readCategorySuggestionConfiguration(
  value: unknown,
): CategorySuggestionConfiguration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1 ||
    typeof record.enabled !== "boolean" ||
    (record.provider !== "DEEPSEEK" && record.provider !== "OPENAI") ||
    typeof record.model !== "string" ||
    !CATEGORY_SUGGESTION_MODELS[record.provider].some(
      (model) => model.id === record.model,
    )
  )
    return null
  return {
    schemaVersion: 1,
    enabled: record.enabled,
    provider: record.provider,
    model: record.model,
  }
}

export type CatalogCategorySuggestion = {
  key: string
  rootKey: string
  childKey: string | null
  rootLabel: string
  childLabel: string | null
  category: string
  categoryId?: string
  subcategoryId?: string
  emoji: string
}
export type CatalogCategorySuggestionResult = {
  status: "ready" | "disabled" | "unavailable"
  suggestions: CatalogCategorySuggestion[]
}
