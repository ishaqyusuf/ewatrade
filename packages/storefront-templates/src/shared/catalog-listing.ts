import { storefrontListingHref } from "@ewatrade/storefront-runtime/links"
import type { CatalogQuery } from "../../../storefront-contracts/src/resources"

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

/** Shared no-results copy; its reset is catalogListingHref(category): same category, no search, filter, sort, cursor or item. */
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
 * Same-page listing link. Category and cursor stay server-loaded so no item is dropped;
 * callers pass `after` only for pagination, so a category or control change starts at page one.
 */
export function catalogListingHref(
  category?: string | null,
  after?: string | null,
  query?: CatalogListingQuery | null,
) {
  return storefrontListingHref({
    ...(category ? { category } : {}),
    ...catalogListingQuery(query),
    ...(after ? { after } : {}),
  })
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
  for (const key of ["category", "q", "availability", "sort", "after", "item"])
    formData.delete(key)
  if (category) formData.set("category", category)
  if (query.q) formData.set("q", query.q)
  if (query.availability) formData.set("availability", query.availability)
  if (query.sort) formData.set("sort", query.sort)
  return formData
}
