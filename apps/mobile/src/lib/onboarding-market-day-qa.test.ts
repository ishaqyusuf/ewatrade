import { describe, expect, test } from "bun:test"

import { resolveOnboardingMarketDayQaPath } from "./onboarding-market-day-qa"

describe("Onboarding Market Day QA routing", () => {
  test("maps the exact development-only app URL to the existing Onboarding route", () => {
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day",
        true,
      ),
    ).toBe("/onboarding")
  })

  test("rejects production, unknown hosts, query payloads, and other schemes", () => {
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day",
        false,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath("ewatrade-dev://onboarding", true),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day?state=other",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day/other",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day#other",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://user@onboarding-market-day",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade-dev://onboarding-market-day:123",
        true,
      ),
    ).toBeNull()
    expect(
      resolveOnboardingMarketDayQaPath(
        "ewatrade://onboarding-market-day",
        true,
      ),
    ).toBeNull()
    expect(resolveOnboardingMarketDayQaPath("not a URL", true)).toBeNull()
  })
})
