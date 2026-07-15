import { describe, expect, test } from "bun:test"

import {
  extractTenantSlugFromPlatformHostname,
  inferTenantSurfaceFromHostname,
  resolveTenantDomain,
} from "./domain"

describe("tenant domain resolution", () => {
  test("treats reserved platform subdomains as global app surfaces", () => {
    expect(
      inferTenantSurfaceFromHostname("dashboard.ewatrade.com", "ewatrade.com"),
    ).toBe("dashboard")
    expect(
      extractTenantSlugFromPlatformHostname(
        "dashboard.ewatrade.com",
        "ewatrade.com",
      ),
    ).toBe(null)
    expect(
      resolveTenantDomain("dashboard.ewatrade.com", {
        platformDomain: "ewatrade.com",
      }),
    ).toEqual({
      kind: "tenant",
      hostname: "dashboard.ewatrade.com",
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
})
