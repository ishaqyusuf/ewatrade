import { afterEach, expect, test } from "bun:test"
import { getDashboardLoginUrl } from "./auth-navigation"

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DASHBOARD_URL: process.env.NEXT_PUBLIC_DASHBOARD_URL,
  NEXT_PUBLIC_PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
}
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})

test("marketing links directly to the configured local dashboard login", () => {
  Reflect.set(process.env, "NODE_ENV", "development")
  process.env.NEXT_PUBLIC_DASHBOARD_URL =
    "https://ewatrade-dashboard.localhost/"
  expect(getDashboardLoginUrl()).toBe(
    "https://ewatrade-dashboard.localhost/login",
  )
})

test("production uses the shared application path", () => {
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "ewatrade.com"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dashboard.ewatrade.com"
  expect(getDashboardLoginUrl()).toBe("https://ewatrade.com/dashboard/login")
})
