import { expect, test } from "bun:test"
import {
  LISTING_AVAILABILITY,
  LISTING_SORTS,
  catalogListingCustomized,
  catalogListingFiltered,
  catalogListingHref,
  catalogListingQuery,
  pruneListingFormData,
} from "./catalog-listing"
import { detailHistoryChange } from "./commerce"

test("listing hrefs keep category and controls, add the cursor last and drop empty values", () => {
  const query = {
    q: "  ankara tote ",
    availability: "available",
    sort: "price_asc",
  } as const
  expect(catalogListingHref()).toBe("/")
  expect(catalogListingHref("cat-a")).toBe("/?category=cat-a")
  expect(catalogListingHref(null, null, query)).toBe(
    "/?q=ankara+tote&availability=available&sort=price_asc",
  )
  expect(catalogListingHref("cat-a", "s:abc_-1", query)).toBe(
    "/?category=cat-a&q=ankara+tote&availability=available&sort=price_asc&after=s%3Aabc_-1",
  )
  expect(catalogListingHref("cat-a", "", { q: "   " })).toBe("/?category=cat-a")
})

test("listing query keeps only known values and caps search like the server", () => {
  expect(
    catalogListingQuery({
      q: `  ${"x".repeat(130)}  `,
      availability: "in_stock" as never,
      sort: "newest" as never,
    }),
  ).toEqual({ q: "x".repeat(120) })
  expect(catalogListingQuery(null)).toEqual({})
  expect(catalogListingFiltered({ sort: "name_asc" })).toBe(false)
  expect(catalogListingCustomized({ sort: "name_asc" })).toBe(true)
  expect(catalogListingFiltered({ q: " shirt " })).toBe(true)
  expect(catalogListingFiltered({ availability: "out_of_stock" })).toBe(true)
  expect(catalogListingCustomized({ q: "  " })).toBe(false)
})

test("labels stay truthful: available means not marked out of stock", () => {
  expect(LISTING_AVAILABILITY.map((entry) => entry.label)).toEqual([
    "Not out of stock",
    "Out of stock",
  ])
  expect(LISTING_SORTS.map((entry) => entry.label)).toEqual([
    "Name A–Z",
    "Name Z–A",
    "Price low–high",
    "Price high–low",
  ])
})

test("GET form data is pruned to the same params the href helper builds; item and after never survive", () => {
  const data = new FormData()
  data.set("category", "cat-b")
  data.set("q", "  hem  ")
  data.set("availability", "")
  data.set("sort", "name_desc")
  data.set("after", "s:stale")
  data.set("item", "p1")
  const pruned = pruneListingFormData(data)
  const params = new URLSearchParams()
  for (const [key, value] of pruned) params.append(key, String(value))
  expect(`/?${params}`).toBe(
    catalogListingHref("cat-b", null, { q: "hem", sort: "name_desc" }),
  )
  const blank = new FormData()
  blank.set("q", "")
  blank.set("availability", "")
  blank.set("sort", "")
  expect([...pruneListingFormData(blank).keys()]).toEqual([])
})

test("history sync only acts when the open detail differs from the URL item", () => {
  // Listing Back/Forward with no detail open must not move focus or the title.
  expect(detailHistoryChange(null, null)).toBe(false)
  expect(detailHistoryChange(null, "")).toBe(false)
  // Back from an opened detail closes it; Forward to an item reopens it.
  expect(detailHistoryChange("p1", null)).toBe(true)
  expect(detailHistoryChange(null, "p1")).toBe(true)
  expect(detailHistoryChange("p1", "p1")).toBe(false)
  expect(detailHistoryChange("p1", "p2")).toBe(true)
})
