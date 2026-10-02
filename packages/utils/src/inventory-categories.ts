export const MAX_STOCK_CATEGORIES = 10
export const MAX_STOCK_CATEGORY_LENGTH = 80

export type StockCategorySelector =
  | { categoryNameId: number }
  | { name: string }

export type StockCategoryDraft = { categoryNameId?: number; name: string }

export function normalizeStockCategoryName(value: string) {
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ")
  const normalizedName = name.toLowerCase()
  if (
    !name ||
    name.length > MAX_STOCK_CATEGORY_LENGTH ||
    normalizedName.length > MAX_STOCK_CATEGORY_LENGTH ||
    /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    throw new Error("Category names must contain 1–80 visible characters.")
  }
  return { name, normalizedName }
}

// Keep name selectors as names on retries, even after the first request creates them.
export function normalizeStockCategorySelectors(
  categories: StockCategorySelector[],
): StockCategorySelector[] {
  if (!categories.length || categories.length > MAX_STOCK_CATEGORIES) {
    throw new Error("Choose 1–10 categories.")
  }
  const seen = new Set<string>()
  return categories.flatMap<StockCategorySelector>((category) => {
    if ("categoryNameId" in category) {
      if (
        !Number.isSafeInteger(category.categoryNameId) ||
        category.categoryNameId < 1 ||
        category.categoryNameId > 2_147_483_647
      ) {
        throw new Error("Category name IDs must be positive integers.")
      }
      const key = `id:${category.categoryNameId}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ categoryNameId: category.categoryNameId }]
    }
    const { normalizedName } = normalizeStockCategoryName(category.name)
    const key = `name:${normalizedName}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ name: normalizedName }]
  })
}

export function collectStockCategoryDraft(
  categories: StockCategoryDraft[],
  pending = "",
) {
  const seen = new Set<string>()
  const result = [
    ...categories,
    ...pending
      .split(",")
      .filter((name) => name.trim())
      .map((name) => ({ name })),
  ].flatMap((category) => {
    const { name, normalizedName } = normalizeStockCategoryName(category.name)
    if (seen.has(normalizedName)) return []
    seen.add(normalizedName)
    return [{ ...category, name }]
  })
  if (!result.length || result.length > MAX_STOCK_CATEGORIES) {
    throw new Error("Choose 1–10 categories.")
  }
  return result
}

export function stockCategorySelectors(
  categories: StockCategoryDraft[],
): StockCategorySelector[] {
  return categories.map((category) =>
    category.categoryNameId === undefined
      ? { name: category.name }
      : { categoryNameId: category.categoryNameId },
  )
}
