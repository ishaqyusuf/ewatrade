import { resolveCatalogFormGuidance, findCatalogOptionSuggestion, getCatalogOptionSuggestions, getCatalogOptionValueSuggestions, getCatalogOptionValueHint } from "../../packages/utils/src/business-catalog-guidance"
import { BUSINESS_PROFILES } from "../../packages/utils/src/business-profiles"
import { CATALOG_CATEGORY_CONFIG, getCatalogCategoryPresets, findCatalogCategoryPreset } from "../../packages/utils/src/catalog-category-presets"
Object.assign(window, { CatalogCategories: { BUSINESS_PROFILES, CATALOG_CATEGORY_CONFIG, getCatalogCategoryPresets, findCatalogCategoryPreset } })

Object.assign(window, { CatalogGuidance: { resolveCatalogFormGuidance, findCatalogOptionSuggestion, getCatalogOptionSuggestions, getCatalogOptionValueSuggestions, getCatalogOptionValueHint } })
