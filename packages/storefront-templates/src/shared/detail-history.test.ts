import { expect, test } from "bun:test"
import { detailUrl, historyDetail, knownDetail } from "./detail-history"

const items = [
  { id: "p1", name: "Raffia basket" },
  { id: "p2", name: "Painted tray" },
]
const listing =
  "https://shop.example/?category=cat-a&q=raffia&availability=available&sort=price_asc&after=s%3Acursor"

test("opening and closing a detail changes only ?item=, keeping every listing parameter", () => {
  const opened = detailUrl(listing, "p2")
  expect(opened.searchParams.get("item")).toBe("p2")
  for (const key of ["category", "q", "availability", "sort", "after"])
    expect(opened.searchParams.get(key)).toBe(
      new URL(listing).searchParams.get(key),
    )
  expect(detailUrl(opened.href, null).href).toBe(listing)
})

test("only items from the current public load can open", () => {
  expect(knownDetail(items, "p1")?.name).toBe("Raffia basket")
  expect(knownDetail(items, "forged")).toBeNull()
  expect(knownDetail(items, "")).toBeNull()
  expect(knownDetail(items, null)).toBeNull()
})

test("Back/Forward closes or reopens the detail and ignores listing-only entries", () => {
  // Back from a pushed detail to the listing entry closes it.
  expect(historyDetail("p1", listing, items)).toBeNull()
  // Forward to the detail entry reopens the same known item.
  expect(historyDetail(null, `${listing}&item=p2`, items)?.id).toBe("p2")
  // Listing Back/Forward with nothing open leaves focus and title alone.
  expect(historyDetail(null, listing, items)).toBeUndefined()
  expect(historyDetail("p2", `${listing}&item=p2`, items)).toBeUndefined()
  // A history entry naming an item outside this load stays closed.
  expect(historyDetail(null, `${listing}&item=forged`, items)).toBeNull()
})
