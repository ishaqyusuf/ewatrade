import { expect, test } from "bun:test"
import {
  canForwardMobileAnalytics,
  canInitializeMobileAnalytics,
} from "./mobile-policy"

const client = {
  development: false,
  platform: "android",
  environment: "production",
  enabled: "true",
  project: "ewatrade-mobile",
  endpoint: "https://ewatrade.com/api/analytics/mobile",
  authenticated: true,
}
test("release preview and unresolved app identity cannot initialize mobile tracking", () => {
  expect(canInitializeMobileAnalytics(client)).toBe(true)
  for (const environment of [
    undefined,
    null,
    "",
    "preview",
    "development",
    "disabled",
    "unknown",
  ])
    expect(canInitializeMobileAnalytics({ ...client, environment })).toBe(false)
  for (const patch of [
    { development: true },
    { platform: "ios" },
    { platform: "web" },
    { enabled: "false" },
    { project: "ewatrade-dashboard" },
    { endpoint: "https://preview.ewatrade.com/api/analytics/mobile" },
    { authenticated: false },
  ])
    expect(canInitializeMobileAnalytics({ ...client, ...patch })).toBe(false)
})

test("collector forwarding requires exact Production deployment and independent enable", () => {
  const env = {
    NODE_ENV: "production",
    APP_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    LOGLY_MOBILE_ENABLED: "true",
  }
  expect(canForwardMobileAnalytics(env)).toBe(true)
  expect(canForwardMobileAnalytics({})).toBe(false)
  for (const key of Object.keys(env))
    for (const value of [
      undefined,
      "",
      "preview",
      "development",
      "unknown",
      "false",
    ])
      expect(canForwardMobileAnalytics({ ...env, [key]: value })).toBe(false)
})
