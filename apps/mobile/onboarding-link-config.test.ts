import { expect, test } from "bun:test"
const { getOnboardingLinkConfig } = require("./onboarding-link-config.cjs")

test("native configuration claims only bounded setup paths per host", () => {
  expect(getOnboardingLinkConfig("production")).toEqual({
    dashboardUrl: "https://dashboard.ewatrade.com",
    host: "dashboard.ewatrade.com",
    paths: ["/signup", "/api/early-access/verify"],
  })
  expect(
    getOnboardingLinkConfig("preview", "https://preview.example.com").host,
  ).toBe("preview.example.com")
  expect(
    getOnboardingLinkConfig("development", "http://localhost:3093").host,
  ).toBeNull()
  expect(getOnboardingLinkConfig("preview")).toBeNull()
})

test("native preview cannot claim production continuation domains", () => {
  for (const [variant, url] of [
    ["preview", "https://dashboard.ewatrade.com"],
    ["preview", "http://preview.example.com"],
    ["production", "https://user@dashboard.ewatrade.com"],
    ["unknown", "https://example.com"],
  ])
    expect(() => getOnboardingLinkConfig(variant, url)).toThrow()
})
