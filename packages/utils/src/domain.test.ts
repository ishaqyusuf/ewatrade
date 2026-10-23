import { describe, expect, test } from "bun:test"

import {
  buildInternalTenantHostname,
  buildPlatformSurfaceHostname,
  extractTenantSlugFromPlatformHostname,
  inferTenantSurfaceFromHostname,
  resolveTenantDomain,
} from "./domain"

describe("tenant domain resolution", () => {
  test("uses the selected workspace on the hosted Preview dashboard", () => {
    expect(
      resolveTenantDomain("preview-dashboard.ewatrade.com", {
        platformDomain: "ewatrade.com",
      }),
    ).toEqual({
      kind: "tenant",
      hostname: "preview-dashboard.ewatrade.com",
      surface: "dashboard",
      tenantSlug: null,
      isCustomDomain: false,
      isLocalhost: false,
    })
    expect(
      extractTenantSlugFromPlatformHostname(
        "preview-west-dashboard.ewatrade.com",
        "ewatrade.com",
      ),
    ).toBe("preview-west")
  })

  test("treats reserved platform subdomains as global app surfaces", () => {
    expect(
      inferTenantSurfaceFromHostname("dash.ewatrade.com", "ewatrade.com"),
    ).toBe("dashboard")
    expect(
      extractTenantSlugFromPlatformHostname(
        "dash.ewatrade.com",
        "ewatrade.com",
      ),
    ).toBe(null)
    expect(
      resolveTenantDomain("dash.ewatrade.com", {
        platformDomain: "ewatrade.com",
      }),
    ).toEqual({
      kind: "tenant",
      hostname: "dash.ewatrade.com",
      surface: "dashboard",
      tenantSlug: null,
      isCustomDomain: false,
      isLocalhost: false,
    })
  })

  test("keeps tenant dashboard suffix hostnames tenant-scoped", () => {
    expect(
      inferTenantSurfaceFromHostname(
        "demo-dashboard.ewatrade.com",
        "ewatrade.com",
      ),
    ).toBe("dashboard")
    expect(
      extractTenantSlugFromPlatformHostname(
        "demo-dashboard.ewatrade.com",
        "ewatrade.com",
      ),
    ).toBe("demo")
  })

  test("builds one global dashboard hostname for every business", () => {
    expect(
      buildPlatformSurfaceHostname({
        platformDomain: "ewatrade.com",
        surface: "dashboard",
      }),
    ).toBe("dash.ewatrade.com")
    expect(
      buildPlatformSurfaceHostname({
        platformDomain: "localhost",
        surface: "dashboard",
      }),
    ).toBe("ewatrade-dashboard.localhost")
  })
})

// Keep previously issued links on the dashboard surface during the migration.
test("legacy dashboard origin remains a global dashboard", () => {
  expect(
    resolveTenantDomain("dashboard.ewatrade.com", {
      platformDomain: "ewatrade.com",
    }),
  ).toMatchObject({ surface: "dashboard", tenantSlug: null })
})

describe("Portless storefront addresses", () => {
  test("builds a tenant subdomain of the one storefront app, including legacy caller options", () => {
    for (const localProjectSlug of [undefined, "sample-shop"]) {
      expect(
        buildInternalTenantHostname({
          tenantSlug: "sample-shop",
          surface: "storefront",
          platformDomain: "localhost",
          localProjectSlug,
        }),
      ).toBe("sample-shop.ewatrade-storefront.localhost")
    }
    expect(
      buildInternalTenantHostname({
        tenantSlug: "sample-shop",
        surface: "storefront",
        platformDomain: "ewatrade.com",
      }),
    ).toBe("sample-shop.ewatrade.com")
  })
  test("resolves local tenant storefronts without treating global apps or sibling products as tenants", () => {
    expect(
      resolveTenantDomain("sample-shop.ewatrade-storefront.localhost", {
        platformDomain: "localhost",
      }),
    ).toMatchObject({
      surface: "storefront",
      tenantSlug: "sample-shop",
      isCustomDomain: false,
      isLocalhost: true,
    })
    for (const host of [
      "ewatrade-storefront.localhost",
      "ewatrade-dashboard.localhost",
      "sample-shop.localhost",
      "sample-shop.other-storefront.localhost",
    ]) {
      expect(
        resolveTenantDomain(host, { platformDomain: "localhost" }).tenantSlug,
      ).toBeNull()
    }
  })
})

test("local QA storefront preview requires the exact local dev environment and canonical host", async () => {
  const { isLocalStorefrontPreviewHost } = await import("./domain")
  const env = {
    NODE_ENV: "development",
    APP_ENV: "local",
    DEV_PROFILE: "local",
    EWATRADE_ENV_MODE: "local",
    NEXT_PUBLIC_PLATFORM_DOMAIN: "localhost",
  }
  const host = "sample-shop-qa.ewatrade-storefront.localhost"
  expect(isLocalStorefrontPreviewHost(host, env)).toBe(true)
  for (const key of [
    "NODE_ENV",
    "APP_ENV",
    "DEV_PROFILE",
    "EWATRADE_ENV_MODE",
  ] as const) {
    for (const value of ["production", "preview", undefined]) {
      expect(isLocalStorefrontPreviewHost(host, { ...env, [key]: value })).toBe(
        false,
      )
    }
  }
  for (const hostname of [
    "sample-shop-qa.ewatrade.com",
    "sample-shop-qa.localhost",
    "ewatrade-storefront.localhost",
    "sample-shop-qa.ewatrade-storefront.localhost.attacker.com",
  ]) {
    expect(isLocalStorefrontPreviewHost(hostname, env)).toBe(false)
  }
  expect(
    isLocalStorefrontPreviewHost(host, {
      ...env,
      NEXT_PUBLIC_PLATFORM_DOMAIN: "ewatrade.com",
    }),
  ).toBe(false)
})
