import { expect, test } from "bun:test"
import {
  readStorefrontFeatureConfig,
  storefrontCommerceAvailability,
} from "./features"

const legacy = (
  key = "commerce-studio",
  settings: Record<string, unknown> = {},
) => ({
  schemaVersion: 1,
  template: { key, version: "1.0.0" },
  pages: [
    { key: "home", sections: [{ type: "commerce-studio-header", settings }] },
  ],
})

test("legacy normalization retains operational defaults without enabling other templates", () => {
  expect(readStorefrontFeatureConfig(legacy())).toEqual({
    version: 1,
    accounts: { enabled: true },
    orders: { enabled: true, fulfilment: ["pickup"] },
  })
  expect(
    readStorefrontFeatureConfig(legacy("retail-editorial"))?.orders.enabled,
  ).toBe(false)
  expect(
    readStorefrontFeatureConfig(legacy("retail-editorial"))?.accounts.enabled,
  ).toBe(false)
  expect(
    readStorefrontFeatureConfig(
      legacy("commerce-studio", {
        "offer-pickup": false,
        "offer-delivery": true,
      }),
    )?.orders.fulfilment,
  ).toEqual(["delivery"])
})

test("legacy hide-login is presentation only and never changes existing identity policy", () => {
  expect(
    readStorefrontFeatureConfig(
      legacy("commerce-studio", { "show-login": false }),
    )?.accounts.enabled,
  ).toBe(true)
})

test("unknown versions, malformed configuration and policy smuggling fail closed", () => {
  for (const value of [
    null,
    {},
    { schemaVersion: 99 },
    { ...legacy(), features: {} },
    { schemaVersion: 2, features: { version: 99 } },
    { ...legacy(), pages: [null] },
  ])
    expect(readStorefrontFeatureConfig(value)).toBeNull()
})

test("new order intake and login are independently configured", () => {
  const config = readStorefrontFeatureConfig({
    schemaVersion: 2,
    features: {
      version: 1,
      accounts: { enabled: true },
      orders: { enabled: false, fulfilment: ["pickup"] },
    },
  })
  if (!config) throw new Error("Expected explicit configuration")
  const available = storefrontCommerceAvailability(config, {
    requestsEntitled: true,
    products: 2,
    channels: ["email"],
    hasContact: true,
  })
  expect(available.orderRequests.available).toBe(false)
  expect(available.customerAccounts.available).toBe(true)
  expect(available.customerAccounts.channels).toEqual(["email"])
  const guest = storefrontCommerceAvailability(
    {
      ...config,
      accounts: { enabled: false },
      orders: { enabled: true, fulfilment: ["pickup"] },
    },
    {
      requestsEntitled: true,
      products: 2,
      channels: ["email"],
      hasContact: true,
    },
  )
  expect(guest.orderRequests.available).toBe(true)
  expect(guest.customerAccounts.available).toBe(false)
})

test("configuration cannot invent entitlement, products or deliverable login channels", () => {
  const config = readStorefrontFeatureConfig(legacy())
  if (!config) throw new Error("Expected legacy configuration")
  expect(
    storefrontCommerceAvailability(config, {
      requestsEntitled: false,
      products: 3,
      channels: ["email"],
      hasContact: false,
    }).orderRequests.available,
  ).toBe(false)
  expect(
    storefrontCommerceAvailability(config, {
      requestsEntitled: true,
      products: 0,
      channels: [],
      hasContact: false,
    }).customerAccounts.available,
  ).toBe(false)
  expect(
    storefrontCommerceAvailability(config, {
      requestsEntitled: true,
      products: 0,
      channels: [],
      hasContact: false,
    }).orderRequests.available,
  ).toBe(false)
})
