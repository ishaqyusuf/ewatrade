import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import { productTaxonomyCategoryForLabel } from "@ewatrade/utils/product-taxonomy"
const normalized = (label: string) =>
  label.trim().replace(/\s+/g, " ").toLowerCase()
/** Two-level Catalog hierarchy retains intermediate taxonomy labels in its child
 * path. Only exact labels from the pinned taxonomy establish external hierarchy.
 */
export function catalogCategoryIdentity(label: string) {
  const taxonomy = productTaxonomyCategoryForLabel(label)
  const preset = CATALOG_CATEGORY_PRESETS.find(
    (entry) =>
      normalized(entry.label) === normalized(label) ||
      normalized(label).startsWith(`${normalized(entry.label)} / `),
  )
  return {
    preset,
    rootLabel: taxonomy?.path[0] ?? preset?.label ?? label,
    childLabel:
      taxonomy && taxonomy.path.length > 1
        ? taxonomy.path.slice(1).join(" / ")
        : preset && label.includes(" / ")
          ? label.slice(label.indexOf(" / ") + 3).trim()
          : null,
  }
}
