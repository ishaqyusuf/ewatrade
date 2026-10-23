import { expect, test } from "bun:test"
import { handleStorefrontItemClick, storefrontItemHref } from "./links"
import {
  type StorefrontSeoStore,
  collectStorefrontSitemap,
  serializeStorefrontStructuredData,
  storefrontIndexingEnabled,
  storefrontPageUrl,
  storefrontStructuredData,
} from "./seo"

const item = {
  id: "item-1",
  name: "Bread </script><script>alert(1)</script>",
  kind: "PRODUCT" as const,
  description: "Fresh bread",
  category: null,
  illustrationId: "default",
  currencyCode: "NGN",
  priceMinor: 250000,
  isFromPrice: false,
  availability: null,
  options: [
    {
      id: "option-1",
      name: "Loaf",
      priceMinor: 250000,
      currencyCode: "NGN",
      availability: "OUT_OF_STOCK" as const,
    },
  ],
}
const store: StorefrontSeoStore = {
  name: "Baker",
  slug: "baker",
  description: "Daily bread",
  isQaPreview: false,
  items: [item],
  highlightedItem: null,
  nextCursor: null,
}
test("indexing is restricted to explicit Production; local, Preview and unknown environments stay private", () => {
  expect(
    storefrontIndexingEnabled({
      NODE_ENV: "production",
      APP_ENV: "production",
      VERCEL_ENV: "production",
    }),
  ).toBe(true)
  expect(
    storefrontIndexingEnabled({
      NODE_ENV: "production",
      APP_ENV: "production",
      VERCEL_ENV: "preview",
    }),
  ).toBe(false)
  expect(
    storefrontIndexingEnabled({ NODE_ENV: "development", APP_ENV: "local" }),
  ).toBe(false)
  expect(storefrontIndexingEnabled({})).toBe(false)
})
test("canonical URLs retain real listing pages and share one stable domain policy", () => {
  expect(storefrontPageUrl(store, "ewatrade.com", { page: "about" })).toBe(
    "https://baker.ewatrade.com/about",
  )
  expect(
    storefrontPageUrl(store, "ewatrade.com", {
      category: "food",
      after: "a:next",
    }),
  ).toBe("https://baker.ewatrade.com/?category=food&after=a%3Anext")
  expect(
    storefrontPageUrl(store, "ewatrade.com", {
      category: "food",
      after: "a:next",
      item: "item-1",
    }),
  ).toBe("https://baker.ewatrade.com/?item=item-1")
})
test("structured data uses public facts, exact prices, stock and safely serialized merchant text", () => {
  const data = storefrontStructuredData(
    { ...store, highlightedItem: item },
    "ewatrade.com",
  )
  const text = serializeStorefrontStructuredData(data)
  expect(text).not.toContain("</script>")
  expect(JSON.parse(text)).toEqual(data)
  expect(text).toContain('"price":"2500.00"')
  expect(text).toContain("https://schema.org/OutOfStock")
  expect(text).not.toMatch(/aggregateRating|InStock|private-tenant/)
  const unpriced = {
    ...item,
    kind: "SERVICE" as const,
    options: [{ ...item.options[0], priceMinor: null }],
  }
  expect(
    serializeStorefrontStructuredData(
      storefrontStructuredData(
        { ...store, highlightedItem: unpriced },
        "ewatrade.com",
      ),
    ),
  ).not.toContain('"offers"')
})
test("sitemap walks public pages, deduplicates, and excludes preview or changed releases", async () => {
  const page = { mode: "live" as const, releaseId: "r1", about: true, store }
  const result = await collectStorefrontSitemap(
    "ewatrade.com",
    async (after) =>
      after
        ? {
            ...page,
            store: { ...store, items: [item, { ...item, id: "item-2" }] },
          }
        : { ...page, store: { ...store, nextCursor: "a:next" } },
  )
  expect(result.map((entry) => entry.url)).toEqual([
    "https://baker.ewatrade.com/",
    "https://baker.ewatrade.com/about",
    "https://baker.ewatrade.com/?item=item-1",
    "https://baker.ewatrade.com/?item=item-2",
  ])
  expect(
    await collectStorefrontSitemap("ewatrade.com", async () => ({
      ...page,
      mode: "preview",
    })),
  ).toEqual([])
  expect(
    await collectStorefrontSitemap("ewatrade.com", async (after) =>
      after ? null : { ...page, store: { ...store, nextCursor: "a:next" } },
    ),
  ).toEqual([])
  expect(
    await collectStorefrontSitemap("ewatrade.com", async (after) => ({
      ...page,
      releaseId: after ? "r2" : "r1",
      store: { ...store, nextCursor: "a:next" },
    })),
  ).toEqual([])
})
test("crawlable item links keep modified browser navigation and intercept ordinary activation", () => {
  expect(storefrontItemHref("item & 1")).toBe("/?item=item%20%26%201")
  let opened = 0
  let prevented = false
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: () => {
      prevented = true
    },
  }
  handleStorefrontItemClick({ ...event, metaKey: true }, () => {
    opened++
  })
  expect(opened).toBe(0)
  expect(prevented).toBe(false)
  handleStorefrontItemClick(event, () => {
    opened++
  })
  expect(opened).toBe(1)
  expect(prevented).toBe(true)
})
