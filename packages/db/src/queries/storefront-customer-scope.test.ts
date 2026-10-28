import { expect, test } from "bun:test"
import {
  type StorefrontCustomerScopeSource,
  createStorefrontCustomerScopeResolver,
} from "./storefront-customer-scope"
import { siteContentHash } from "./storefront-sites"

function source(
  key = "commerce-studio",
  requestsEntitled = true,
): StorefrontCustomerScopeSource {
  const composition = {
    schemaVersion: 1,
    template: { key, version: "1.0.0" },
    theme: {
      font: "system",
      accent: "#171717",
      background: "#ffffff",
      radius: "small",
    },
    pages: [{ key: "home", sections: [] }],
  }
  return {
    site: {
      siteId: "site-a",
      storeId: "store-a",
      release: {
        id: "release-a",
        tenantId: "tenant-a",
        templateKey: key,
        templateVersion: "1.0.0",
        runtimeVersion: 1,
        composition,
        contentHash: siteContentHash(composition),
      },
    },
    storefront: {
      name: "Business A",
      customerRequestsAllowed: requestsEntitled,
    },
  }
}

test("a template switch preserves the published customer scope without granting new login", async () => {
  let current = source()
  const resolve = createStorefrontCustomerScopeResolver({
    loadCurrent: async (host) => (host === "shop-a.test" ? current : null),
    findActiveStore: async ({ tenantId, storeId }) =>
      tenantId === "tenant-a" && storeId === "store-a"
        ? { countryCode: "NG" }
        : null,
  })
  expect(await resolve("shop-a.test")).toMatchObject({
    tenantId: "tenant-a",
    storeId: "store-a",
    allowNewLogin: true,
  })
  current = source("retail-editorial")
  expect(await resolve("shop-a.test")).toMatchObject({
    tenantId: "tenant-a",
    storeId: "store-a",
    allowNewLogin: false,
  })
  expect(await resolve("foreign.test")).toBeNull()
})

test("loss of new-request entitlement does not erase valid historical customer scope", async () => {
  const resolve = createStorefrontCustomerScopeResolver({
    loadCurrent: async () => source("commerce-studio", false),
    findActiveStore: async () => ({ countryCode: "NG" }),
  })
  expect(await resolve("shop-a.test")).toMatchObject({
    tenantId: "tenant-a",
    allowNewLogin: false,
  })
})

test("invalid publication hashes, pin mismatches and unsupported runtime versions refuse", async () => {
  for (const patch of [
    { contentHash: "tampered" },
    { templateVersion: "99.0.0" },
    { runtimeVersion: 99 },
  ]) {
    const current = source()
    Object.assign(current.site.release, patch)
    const resolve = createStorefrontCustomerScopeResolver({
      loadCurrent: async () => current,
      findActiveStore: async () => ({ countryCode: "NG" }),
    })
    expect(await resolve("shop-a.test")).toBeNull()
  }
})

test("missing publication or an inactive/foreign Store cannot resolve a scope", async () => {
  const absent = createStorefrontCustomerScopeResolver({
    loadCurrent: async () => null,
    findActiveStore: async () => {
      throw new Error("Store lookup must not run")
    },
  })
  expect(await absent("shop-a.test")).toBeNull()
  const wrongStore = createStorefrontCustomerScopeResolver({
    loadCurrent: async () => source(),
    findActiveStore: async ({ tenantId, storeId }) => {
      expect({ tenantId, storeId }).toEqual({
        tenantId: "tenant-a",
        storeId: "store-a",
      })
      return null
    },
  })
  expect(await wrongStore("shop-a.test")).toBeNull()
})
