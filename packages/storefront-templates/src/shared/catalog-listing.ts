import { storefrontListingHref } from "@ewatrade/storefront-runtime/links"
import type {
  CatalogQuery,
  StorefrontCategory,
} from "../../../storefront-contracts/src/resources"

/** Customer listing state the server applies to the whole catalog; templates never sort a loaded page. */
export type CatalogListingQuery = Pick<
  CatalogQuery,
  "q" | "availability" | "sort"
>

export const LISTING_SEARCH_MAX = 120

/** "available" means not marked out of stock, so unknown stock is included and labelled truthfully. */
export const LISTING_AVAILABILITY = [
  { value: "available", label: "Not out of stock" },
  { value: "out_of_stock", label: "Out of stock" },
] as const

/** No value keeps the server's existing default order. */
export const LISTING_SORTS = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price low–high" },
  { value: "price_desc", label: "Price high–low" },
] as const

/** Shown with an applied price sort: the server places unlisted or non-comparable prices last. */
export const LISTING_PRICE_SORT_NOTE =
  "Items without a comparable price are listed last."

export function catalogListingPriceSorted(query?: CatalogListingQuery | null) {
  const { sort } = catalogListingQuery(query)
  return sort === "price_asc" || sort === "price_desc"
}

/** Shared no-results copy; its reset is catalogListingHref(scope): same category scope, no search, filter, sort, cursor or item. */
export const LISTING_NO_RESULTS = {
  title: "No matching items",
  description: "Try a different search or availability, or clear them.",
  reset: "Clear search",
} as const

/** Only known values survive; q is trimmed and capped like the server schema. */
export function catalogListingQuery(
  value?: CatalogListingQuery | null,
): CatalogListingQuery {
  const q = value?.q?.trim().slice(0, LISTING_SEARCH_MAX).trim()
  const availability = LISTING_AVAILABILITY.find(
    (entry) => entry.value === value?.availability,
  )?.value
  const sort = LISTING_SORTS.find((entry) => entry.value === value?.sort)?.value
  return {
    ...(q ? { q } : {}),
    ...(availability ? { availability } : {}),
    ...(sort ? { sort } : {}),
  }
}

/** Search or availability narrows the listing; sort alone never empties it. */
export function catalogListingFiltered(query?: CatalogListingQuery | null) {
  const current = catalogListingQuery(query)
  return !!(current.q || current.availability)
}

export function catalogListingCustomized(query?: CatalogListingQuery | null) {
  const current = catalogListingQuery(query)
  return !!(current.q || current.availability || current.sort)
}

/**
 * A root category id, or the loaded catalog's `{ category, subcategory }` pair.
 * A subcategory never survives without its root category.
 */
export type CatalogListingScope =
  | string
  | { category?: string | null; subcategory?: string | null }
  | null
  | undefined

export function catalogListingScope(scope: CatalogListingScope) {
  const category = typeof scope === "string" ? scope : scope?.category
  const subcategory = typeof scope === "string" ? null : scope?.subcategory
  return {
    ...(category ? { category } : {}),
    ...(category && subcategory ? { subcategory } : {}),
  }
}

/**
 * Same-page listing link. Category and cursor stay server-loaded so no item is dropped;
 * callers pass `after` only for pagination, so a category or control change starts at page one.
 */
export function catalogListingHref(
  scope?: CatalogListingScope,
  after?: string | null,
  query?: CatalogListingQuery | null,
) {
  return storefrontListingHref({
    ...catalogListingScope(scope),
    ...catalogListingQuery(query),
    ...(after ? { after } : {}),
  })
}

type CatalogCategoryState = {
  categories: readonly StorefrontCategory[]
  category: string | null
  subcategory?: string | null
}

/** Root navigation is useful with several roots, or one root that has subcategories. */
export function catalogCategoryNavVisible(
  categories: readonly StorefrontCategory[],
) {
  return (
    categories.length > 1 ||
    categories.some((category) => category.subcategories?.length)
  )
}

/** A root link is the page itself, or the parent of the current subcategory page. */
export function catalogRootCurrent(catalog: CatalogCategoryState, id: string) {
  if (catalog.category !== id) return undefined
  return catalog.subcategory ? ("true" as const) : ("page" as const)
}

/**
 * Workshop category-navigation 01: under an active root with subcategories, a
 * subordinate row of "All <root>" plus each subcategory. Empty for any other state.
 */
export function catalogSubcategoryLinks(catalog: CatalogCategoryState) {
  const root = catalog.categories.find(
    (category) => category.id === catalog.category,
  )
  if (!root?.subcategories?.length) return []
  return [
    {
      id: root.id,
      label: `All ${root.name}`,
      scope: { category: root.id },
      current: !catalog.subcategory,
    },
    ...root.subcategories.map((subcategory) => ({
      id: subcategory.id,
      label: subcategory.name,
      scope: { category: root.id, subcategory: subcategory.id },
      current: catalog.subcategory === subcategory.id,
    })),
  ]
}

/**
 * The same listing state on a page other than Home, e.g. `/shop?category=…`. A root
 * path keeps the original `/?…` links; other paths never gain a trailing slash.
 */
export function catalogListingPathHref(
  path: string,
  scope?: CatalogListingScope,
  after?: string | null,
  query?: CatalogListingQuery | null,
) {
  const href = catalogListingHref(scope, after, query)
  if (path === "/") return href
  return href === "/" ? path : `${path}${href.slice(1)}`
}

/**
 * GET form submissions carry every named control. Empty values are removed so the URL
 * matches catalogListingHref and an empty select never invalidates the server query.
 */
export function pruneListingFormData(formData: FormData) {
  const query = catalogListingQuery({
    q: String(formData.get("q") ?? ""),
    availability: String(
      formData.get("availability") ?? "",
    ) as CatalogListingQuery["availability"],
    sort: String(formData.get("sort") ?? "") as CatalogListingQuery["sort"],
  })
  const category = String(formData.get("category") ?? "")
  const subcategory = String(formData.get("subcategory") ?? "")
  for (const key of [
    "category",
    "subcategory",
    "q",
    "availability",
    "sort",
    "after",
    "item",
  ])
    formData.delete(key)
  if (category) formData.set("category", category)
  if (category && subcategory) formData.set("subcategory", subcategory)
  if (query.q) formData.set("q", query.q)
  if (query.availability) formData.set("availability", query.availability)
  if (query.sort) formData.set("sort", query.sort)
  return formData
}
