import { describe, expect, test } from "bun:test"
import { isWebsiteDomainsLaunchApproved } from "./website-domains-launch-gate"

const production = {
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  NODE_ENV: "production",
}

describe("Website & domain launch gate", () => {
  test("stays off in production until approved", () => {
    expect(isWebsiteDomainsLaunchApproved(production)).toBe(false)
    expect(
      isWebsiteDomainsLaunchApproved({
        ...production,
        WEBSITE_DOMAINS_LAUNCH_APPROVED: "false",
      }),
    ).toBe(false)
    expect(
      isWebsiteDomainsLaunchApproved({
        ...production,
        WEBSITE_DOMAINS_LAUNCH_APPROVED: "true",
      }),
    ).toBe(true)
  })

  test("approval needs the full production profile", () => {
    expect(
      isWebsiteDomainsLaunchApproved({
        NODE_ENV: "production",
        WEBSITE_DOMAINS_LAUNCH_APPROVED: "true",
      }),
    ).toBe(false)
  })

  test("local and dev stay on; preview stays off", () => {
    expect(isWebsiteDomainsLaunchApproved({ APP_ENV: "local" })).toBe(true)
    expect(isWebsiteDomainsLaunchApproved({ APP_ENV: "dev" })).toBe(true)
    expect(isWebsiteDomainsLaunchApproved({ APP_ENV: "preview" })).toBe(false)
    expect(isWebsiteDomainsLaunchApproved({ NODE_ENV: "test" })).toBe(true)
  })
})
