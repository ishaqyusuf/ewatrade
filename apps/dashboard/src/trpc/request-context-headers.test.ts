import { expect, test } from "bun:test"
import {
  buildDashboardRequestContext,
  dashboardReadSignal,
  dashboardServerApiOrigin,
} from "./request-context-headers"

test("server reads prefer the configured API and preserve session and selected Tenant forwarding", () => {
  const context = buildDashboardRequestContext(
    new Headers({
      host: "merchant.ewatrade.com",
      "x-tenant-slug": "selected",
      cookie: "session=test",
      authorization: "Bearer test",
      "x-forwarded-host": "dash.ewatrade.com",
      "x-forwarded-proto": "https",
    }),
    {
      API_URL: "https://api.internal.test/",
      NEXT_PUBLIC_API_URL: "https://api.public.test",
    },
  )
  expect(context.apiOrigin).toBe("https://api.internal.test")
  expect(context.headers).toEqual({
    "x-trpc-source": "rsc",
    cookie: "session=test",
    authorization: "Bearer test",
    "x-tenant-slug": "selected",
  })
})

test("host-derived Tenant and cookie selection fallback retain the existing API authorization contract", () => {
  const scoped = buildDashboardRequestContext(
    new Headers({ host: "merchant.ewatrade.com" }),
    { API_URL: "https://api.test" },
  )
  expect(scoped.headers).toMatchObject({ "x-tenant-slug": "merchant" })
  const dashboard = buildDashboardRequestContext(
    new Headers({
      host: "dash.ewatrade.com",
      cookie: "ewatrade.active_tenant_slug=remembered",
    }),
    {},
  )
  expect(dashboard.apiOrigin).toBe("https://dash.ewatrade.com")
  expect(dashboard.headers).not.toHaveProperty("x-tenant-slug")
  expect(dashboard.headers.cookie).toBe(
    "ewatrade.active_tenant_slug=remembered",
  )
})

test("upstream configuration refuses credentials, non-HTTP schemes and URL payloads", () => {
  for (const API_URL of [
    "file:///tmp/api",
    "https://user:pass@api.test",
    "https://api.test/path",
    "https://api.test?token=private",
    "https://api.test#private",
  ])
    expect(() => dashboardServerApiOrigin({ API_URL }, null)).toThrow()
  expect(() => dashboardServerApiOrigin({}, null)).toThrow()
  expect(
    dashboardServerApiOrigin(
      { NEXT_PUBLIC_API_URL: "https://api.test" },
      "https://dash.test",
    ),
  ).toBe("https://api.test")
})

test("read deadlines preserve an already cancelled caller signal", () => {
  const controller = new AbortController()
  controller.abort(new Error("cancelled"))
  expect(dashboardReadSignal(controller.signal).aborted).toBe(true)
  expect(dashboardReadSignal().aborted).toBe(false)
})
