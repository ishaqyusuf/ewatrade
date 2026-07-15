import { afterEach, describe, expect, it, mock } from "bun:test"
import { provisionTenantVercelDomains } from "./vercel"

const originalFetch = globalThis.fetch
const originalWarn = console.warn
const originalEnv = {
  VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
  VERCEL_DASHBOARD_PROJECT_ID: process.env.VERCEL_DASHBOARD_PROJECT_ID,
  VERCEL_POS_PROJECT_ID: process.env.VERCEL_POS_PROJECT_ID,
  VERCEL_STOREFRONT_PROJECT_ID: process.env.VERCEL_STOREFRONT_PROJECT_ID,
}

function setVercelEnv(values: Partial<typeof originalEnv>) {
  for (const key of Object.keys(originalEnv) as Array<
    keyof typeof originalEnv
  >) {
    const value = values[key]

    if (value === undefined) {
      delete process.env[key]
      continue
    }

    process.env[key] = value
  }
}

describe("Vercel tenant domain provisioning", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    setVercelEnv(originalEnv)
  })

  it("provisions only configured surface project domains", async () => {
    const fetchMock = mock(
      (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => Promise.resolve(new Response(null, { status: 200 })),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    setVercelEnv({
      VERCEL_API_TOKEN: "vcp_test_token",
      VERCEL_STOREFRONT_PROJECT_ID: "prj_storefront",
      VERCEL_POS_PROJECT_ID: "",
      VERCEL_DASHBOARD_PROJECT_ID: "",
    })

    await provisionTenantVercelDomains({
      storefrontDomain: "demo.ewatrade.com",
      posDomain: "demo-pos.ewatrade.com",
      dashboardDomain: "demo-dashboard.ewatrade.com",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]

    expect(firstCall?.[0]).toBe(
      "https://api.vercel.com/v10/projects/prj_storefront/domains",
    )
    expect(firstCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "demo.ewatrade.com" }),
    })
  })

  it("skips provisioning when the Vercel token is absent", async () => {
    const fetchMock = mock(
      (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => Promise.resolve(new Response(null, { status: 200 })),
    )
    const warnMock = mock(() => undefined)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    console.warn = warnMock as typeof console.warn
    setVercelEnv({
      VERCEL_STOREFRONT_PROJECT_ID: "prj_storefront",
      VERCEL_POS_PROJECT_ID: "",
      VERCEL_DASHBOARD_PROJECT_ID: "",
    })

    await provisionTenantVercelDomains({
      storefrontDomain: "demo.ewatrade.com",
      posDomain: "demo-pos.ewatrade.com",
      dashboardDomain: "demo-dashboard.ewatrade.com",
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledTimes(1)
  })
})
