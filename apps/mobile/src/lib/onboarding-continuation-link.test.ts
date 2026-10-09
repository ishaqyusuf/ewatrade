import { expect, test } from "bun:test"
import { resolveOnboardingContinuationLink } from "./onboarding-continuation-link"

const setup = `ea_${"s".repeat(43)}`
const verification = `ear_${"v".repeat(43)}`

test("setup and verification links resume only on the configured dashboard", () => {
  const configuration = {
    variant: "preview" as const,
    dashboardUrl: "https://dashboard-preview.example.com",
  }
  expect(
    resolveOnboardingContinuationLink(
      `https://dashboard-preview.example.com/signup?access_token=${setup}`,
      configuration,
    ),
  ).toEqual({ kind: "setup", token: setup })
  expect(
    resolveOnboardingContinuationLink(
      `https://dashboard-preview.example.com/api/early-access/verify?token=${verification}`,
      configuration,
    ),
  ).toEqual({ kind: "verification", token: verification })
  expect(
    resolveOnboardingContinuationLink(
      `https://dash.ewatrade.com/signup?access_token=${setup}`,
      configuration,
    ),
  ).toBeNull()
  expect(
    resolveOnboardingContinuationLink(
      `https://dash.ewatrade.com/signup?access_token=${setup}`,
      { variant: "preview" },
    ),
  ).toBeNull()
})

test("coinstalled apps cannot resume another environment's custom scheme", () => {
  for (const variant of ["production", "preview", "development"] as const) {
    for (const [target, scheme] of [
      ["production", "ewatrade"],
      ["preview", "ewatrade-preview"],
      ["development", "ewatrade-dev"],
    ]) {
      const result = resolveOnboardingContinuationLink(
        `${scheme}://onboarding/continue?access_token=${setup}`,
        { variant },
      )
      expect(Boolean(result)).toBe(target === variant)
    }
  }
})

test("approval, ambiguous tokens, unrelated routes and host tricks are not continuation", () => {
  for (const value of [
    `https://dash.ewatrade.com/api/early-access/approve?token=${verification}`,
    `https://dash.ewatrade.com/signup?access_token=${setup}&access_token=${setup}`,
    `https://dash.ewatrade.com/signup?access_token=${verification}`,
    `https://dash.ewatrade.com/signup?access_token=${setup}&environment=preview`,
    `https://dash.ewatrade.com.attacker.com/signup?access_token=${setup}`,
    `https://user@dash.ewatrade.com/signup?access_token=${setup}`,
    `https://dash.ewatrade.com/signup?access_token=${setup}#anything`,
    `ewatrade://orders?access_token=${setup}`,
  ])
    expect(
      resolveOnboardingContinuationLink(value, { variant: "production" }),
    ).toBeNull()
})
