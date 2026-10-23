import { expect, test } from "bun:test"
import {
  productWhatsAppUrl,
  storefrontUrl,
} from "@ewatrade/storefront-runtime/links"
import { storefrontMetadata } from "./storefront-metadata"
import type { PublicStorefront } from "./storefront-types"

const store: PublicStorefront = {
  name: "Everyday Store",
  slug: "everyday",
  description: "Thoughtful essentials.",
  isQaPreview: true,
  planId: "starter",
  storefrontItems: 3,
  customerMessages: false,
  chatToken: null,
  whatsAppPhone: null,
  category: null,
  categories: [],
  nextCursor: null,
  highlightedItem: null,
  hasHiddenItems: false,
  items: [],
}

test("shop and eligible item links have distinct absolute OG images and canonical URLs", () => {
  const home = storefrontMetadata(store, "localhost")
  expect(home.openGraph).toMatchObject({
    url: "https://everyday.ewatrade-storefront.localhost/",
    images: [
      {
        width: 1200,
        height: 630,
        url: "https://everyday.ewatrade-storefront.localhost/share-image",
      },
    ],
  })
  expect(home.robots).toEqual({ index: false, follow: false })
  const detail = storefrontMetadata(
    {
      ...store,
      highlightedItem: {
        id: "item-1",
        name: "Sandals",
        kind: "PRODUCT",
        description: "Soft leather.",
        category: null,
        illustrationId: "ill-sandal",
        priceMinor: 1850000,
        currencyCode: "NGN",
        isFromPrice: false,
        availability: null,
        options: [],
      },
    },
    "localhost",
  )
  expect(detail.title).toBe("Sandals | Everyday Store")
  expect(detail.description).toContain("18,500")
  expect(detail.openGraph).toMatchObject({
    url: "https://everyday.ewatrade-storefront.localhost/?item=item-1",
    images: [
      {
        url: "https://everyday.ewatrade-storefront.localhost/share-image?item=item-1",
      },
    ],
  })
  expect(detail.twitter).toMatchObject({ card: "summary_large_image" })
})

test("WhatsApp draft contains exact product link and text with reserved characters intact", () => {
  const link = storefrontUrl("everyday", "ewatrade.com", "item-1")
  const draft = productWhatsAppUrl("+2348031234567", "Bags & hats #1", link)
  expect(draft).not.toBeNull()
  if (!draft) throw new Error("Expected a WhatsApp draft")
  const url = new URL(draft)
  expect(url.origin).toBe("https://wa.me")
  expect(url.pathname).toBe("/2348031234567")
  expect(url.searchParams.get("text")).toBe(
    `Hello, I’d like to ask about Bags & hats #1.\n${link}`,
  )
  expect(productWhatsAppUrl(null, "Name", link)).toBeNull()
  expect(productWhatsAppUrl("https://evil.test", "Name", link)).toBeNull()
  expect(productWhatsAppUrl("08031234567", "Name", link)).toBeNull()
})

test("About and pagination have page-specific canonicals/social metadata; local and QA stay noindex", () => {
  const live = { ...store, isQaPreview: false }
  const about = storefrontMetadata(live, "ewatrade.com", { page: "about" })
  expect(about.title).toBe("About Everyday Store")
  expect(about.alternates).toEqual({
    canonical: "https://everyday.ewatrade.com/about",
  })
  expect(about.openGraph).toMatchObject({
    url: "https://everyday.ewatrade.com/about",
    description: store.description,
  })
  expect(about.robots).toEqual({ index: true, follow: true })
  const paged = storefrontMetadata(live, "ewatrade.com", {
    after: "a:item-2",
    category: "cat-1",
  })
  expect(paged.alternates).toEqual({
    canonical: "https://everyday.ewatrade.com/?category=cat-1&after=a%3Aitem-2",
  })
  expect(
    storefrontMetadata(live, "localhost", { indexable: false }).robots,
  ).toEqual({ index: false, follow: false })
})
