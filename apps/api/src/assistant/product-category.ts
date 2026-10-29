import {
  productCategoryLabel,
  productCategoryReference,
} from "@ewatrade/assistant/product/knowledge"
import type { SetupProductPayload } from "@ewatrade/assistant/setup/contracts"
import {
  findProductTaxonomyCategory,
  readProductTaxonomyAttributes,
  searchProductTaxonomyCategories,
  suggestProductTaxonomy,
} from "@ewatrade/utils/product-taxonomy"

/** Reconstruct external labels from the pinned index; client/model labels are never trusted. */
export function prepareProductCategory<T extends SetupProductPayload>(
  payload: T,
): T {
  if (payload.categoryKey && !payload.categorySuggested) {
    const selected = findProductTaxonomyCategory(payload.categoryKey)
    return { ...payload, categoryLabel: selected?.label }
  }
  const local = productCategoryReference(payload.name)
  if (local)
    return {
      ...payload,
      categoryKey: local.categoryKey,
      categoryLabel: findProductTaxonomyCategory(local.categoryKey)?.label,
      categorySuggested: true,
      categorySuggestionName: payload.name,
    }
  const selected =
    (payload.categoryKey
      ? findProductTaxonomyCategory(payload.categoryKey)
      : undefined) ?? suggestProductTaxonomy(payload.name)
  return {
    ...payload,
    categoryKey: selected?.categoryKey,
    categoryLabel: selected?.label,
    categorySuggested: !!selected,
    categorySuggestionName: selected ? payload.name : undefined,
  }
}
export function searchProductCategories(query: string) {
  return searchProductTaxonomyCategories(query).map(
    ({ categoryKey, label }) => ({ categoryKey, label }),
  )
}
export function readProductCategoryAttributes(categoryKey: string) {
  return readProductTaxonomyAttributes(categoryKey)
}
export function trustedProductCategoryLabel(key: string | undefined) {
  return (
    productCategoryLabel(key) ??
    (key?.startsWith("shopify:")
      ? findProductTaxonomyCategory(key)?.label
      : undefined)
  )
}
