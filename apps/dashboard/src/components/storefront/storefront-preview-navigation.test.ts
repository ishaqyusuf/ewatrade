import { expect, test } from "bun:test"
import {
  storefrontPreviewFormQuery,
  storefrontPreviewQuery,
} from "./storefront-preview-navigation"

test("preview links preserve every catalog query field but cannot navigate elsewhere or choose scope", () => {
  const origin = "https://dashboard.localhost"
  expect(
    storefrontPreviewQuery(
      "/?q=Home&sort=price_asc&availability=available&category=cat&after=s:next&item=item",
      origin,
    ),
  ).toEqual({
    q: "Home",
    sort: "price_asc",
    availability: "available",
    category: "cat",
    after: "s:next",
    item: "item",
  })
  for (const href of [
    "https://evil.test/",
    "/service-request",
    "/?tenantId=foreign",
    "/?q=one&q=two",
    "/?sort=cost",
  ])
    expect(storefrontPreviewQuery(href, origin)).toBeNull()
})

test("preview GET forms update only local query state and reject post/file/foreign actions", () => {
  const origin = "https://dashboard.localhost"
  const data = new FormData()
  data.set("q", "  Laundry  ")
  data.set("availability", "")
  data.set("sort", "name_desc")
  expect(storefrontPreviewFormQuery("/", "get", data, origin)).toEqual({
    q: "Laundry",
    availability: undefined,
    sort: "name_desc",
  })
  expect(storefrontPreviewFormQuery("/", "post", data, origin)).toBeNull()
  expect(
    storefrontPreviewFormQuery("https://evil.test/", "get", data, origin),
  ).toBeNull()
  data.set("tenantId", "foreign")
  expect(storefrontPreviewFormQuery("/", "get", data, origin)).toBeNull()
})

test("Commerce /shop listing forms and links stay inside the preview as query state", () => {
  const origin = "https://dashboard.localhost"
  const data = new FormData()
  data.set("category", "cat-a")
  data.set("q", "basket")
  expect(storefrontPreviewFormQuery("/shop", "get", data, origin)).toEqual({
    category: "cat-a",
    q: "basket",
  })
  // Clear filters on /shop resets to the plain listing.
  expect(storefrontPreviewQuery("/shop", origin)).toEqual({})
  expect(
    storefrontPreviewQuery("/shop?category=cat-b&after=p7", origin),
  ).toEqual({ category: "cat-b", after: "p7" })
  // Other storefront routes are never followed from the dashboard.
  for (const href of ["/checkout", "/account", "/shop/x", "/receipt/t"])
    expect(storefrontPreviewQuery(href, origin)).toBeNull()
})
