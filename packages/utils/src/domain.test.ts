import { describe, expect, test } from "bun:test"

import {
  buildPlatformSurfaceHostname,
  extractTenantSlugFromPlatformHostname,
  inferTenantSurfaceFromHostname,
  resolveTenantDomain,
} from "./domain"

describe("tenant domain resolution", () => {
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
