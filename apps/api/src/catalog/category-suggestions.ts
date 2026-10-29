import type { PrismaClient } from "@ewatrade/db"
import type { CatalogPhotoActorScope } from "@ewatrade/db/catalog-photos"
import type { CatalogCategorySuggestionResult } from "@ewatrade/utils/catalog-category-suggestions"
import { searchProductTaxonomyCategories } from "@ewatrade/utils/product-taxonomy"

/** Protected route owns current management scope. Reference retrieval makes no provider call or write. */
export async function suggestCatalogCategories(
  _db: PrismaClient,
  _scope: CatalogPhotoActorScope,
  title: string,
): Promise<CatalogCategorySuggestionResult> {
  return {
    status: "ready",
    suggestions: searchProductTaxonomyCategories(title, 3).map((entry) => {
      const [rootLabel = entry.name, ...rest] = entry.label.split(" / ")
      return {
        key: entry.categoryKey,
        rootKey: entry.categoryKey,
        childKey: entry.parentId ? entry.categoryKey : null,
        rootLabel,
        childLabel: rest.length ? rest.join(" / ") : null,
        category: entry.label,
        emoji: "🏷️",
      }
    }),
  }
}
