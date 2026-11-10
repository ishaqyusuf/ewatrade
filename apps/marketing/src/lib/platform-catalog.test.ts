import { expect, test } from "bun:test"
import {
  isLocalPlatformCatalogPreview,
  platformAvailability,
  platformCatalogHref,
  platformItemPrice,
  platformOrigin,
  platformWhatsAppUrl,
} from "./platform-catalog"

test("prices read like the storefront: From for ranges, ask when unpriced", () => {
  expect(
    platformItemPrice({
      priceMinor: 350000,
      isFromPrice: true,
      currencyCode: "NGN",
    }),
  ).toBe("From ₦3,500")
  expect(
    platformItemPrice({
      priceMinor: null,
      isFromPrice: false,
      currencyCode: "NGN",
    }),
  ).toBe("Ask for price")
  expect(platformAvailability("OUT_OF_STOCK")).toEqual({
    kind: "out",
    label: "Sold out",
  })
})

test("catalog links carry only listing state", () => {
  expect(platformCatalogHref("hypnos", {})).toBe("/b/hypnos")
  expect(
    platformCatalogHref("hypnos", {
      q: "  oud ",
      category: "cat_1",
      after: null,
    }),
  ).toBe("/b/hypnos?q=oud&category=cat_1")
})

test("platform origin comes from configuration, defaulting to ewatrade.com", () => {
  expect(platformOrigin({})).toBe("https://ewatrade.com")
  expect(
    platformOrigin({ MARKETING_URL: "https://ewatrade.localhost/x" }),
  ).toBe("https://ewatrade.localhost")
})

test("WhatsApp drafts need a public E.164 number and carry the order and page link", () => {
  const base = {
    intent: "order" as const,
    businessName: "Alhaq Tech",
    pageUrl: "https://ewatrade.com/b/alhaq/p/case",
    item: { name: "Clear case", option: "Galaxy A15", quantity: 2 },
  }
  expect(platformWhatsAppUrl({ ...base, phone: null })).toBeNull()
  expect(platformWhatsAppUrl({ ...base, phone: "08030000000" })).toBeNull()
  const url = new URL(
    platformWhatsAppUrl({ ...base, phone: "+2348030000000" }) ?? "",
  )
  expect(url.host).toBe("wa.me")
  expect(url.pathname).toBe("/2348030000000")
  expect(url.searchParams.get("text")).toBe(
    "Hello Alhaq Tech, I’d like to order:\n2 × Clear case (Galaxy A15)\nhttps://ewatrade.com/b/alhaq/p/case",
  )
})

test("QA preview is local-only: every env marker local and a local host", () => {
  const local = {
    NODE_ENV: "development",
    APP_ENV: "local",
    DEV_PROFILE: "local",
    EWATRADE_ENV_MODE: "local",
  }
  expect(isLocalPlatformCatalogPreview("ewatrade.localhost", local)).toBe(true)
  expect(isLocalPlatformCatalogPreview(null, local)).toBe(false)
  expect(
    isLocalPlatformCatalogPreview("ewatrade.localhost", {
      ...local,
      APP_ENV: "preview",
    }),
  ).toBe(false)
  expect(isLocalPlatformCatalogPreview("localhost:3097", local)).toBe(true)
  expect(isLocalPlatformCatalogPreview("ewatrade.com", local)).toBe(false)
  expect(
    isLocalPlatformCatalogPreview("ewatrade.localhost", {
      ...local,
      NODE_ENV: "production",
    }),
  ).toBe(false)
})
