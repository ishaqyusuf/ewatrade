import { afterEach, expect, test } from "bun:test"
import { buildEarlyAccessSignupUrl } from "./early-access-onboarding"
import {
  getDashboardRouteUrl,
  getDashboardSignupUrl,
} from "./signup-navigation"

const keys = [
  "NODE_ENV",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})

test("signup and verification use the same configured origin as login", () => {
  const config = {
    configuredUrl: "https://ewatrade-dashboard.localhost/",
    isProduction: false,
    platformDomain: "localhost",
  }
  for (const path of ["/signup", "/login", "/api/early-access/verify"])
    expect(getDashboardRouteUrl(path, config)).toBe(
      `https://ewatrade-dashboard.localhost${path}`,
    )
})
test("production preserves the canonical dashboard base path", () => {
  const config = {
    configuredUrl: "https://ewatrade.com/dashboard",
    isProduction: true,
    platformDomain: "ewatrade.com",
  }
  for (const path of ["/signup", "/login", "/api/early-access/verify"])
    expect(getDashboardRouteUrl(path, config)).toBe(
      `https://ewatrade.com/dashboard${path}`,
    )
})
test("email setup links ignore request host and preserve the exact token", () => {
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "ewatrade.com"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dash.ewatrade.com"
  const token = "ea_fixture/+?&"
  const link = new URL(
    buildEarlyAccessSignupUrl({
      requestUrl: "https://attacker.invalid",
      token,
    }),
  )
  expect(link.origin + link.pathname).toBe(
    "https://dash.ewatrade.com/signup",
  )
  expect(link.searchParams.get("access_token")).toBe(token)
  expect(getDashboardSignupUrl()).toBe("https://dash.ewatrade.com/signup")
})
test("hosted links refuse insecure or credential-bearing custom origins", () => {
  for (const configuredUrl of [
    "http://app.example.com",
    "https://user:secret@app.example.com",
    "javascript:alert(1)",
  ])
    expect(() =>
      getDashboardRouteUrl("/signup", {
        configuredUrl,
        isProduction: true,
        platformDomain: "ewatrade.com",
      }),
    ).toThrow()
})

test("production fallback uses the documented dashboard hostname", () => {
  expect(
    getDashboardRouteUrl("/signup", {
      isProduction: true,
      platformDomain: "ewatrade.com",
    }),
  ).toBe("https://dash.ewatrade.com/signup")
})
