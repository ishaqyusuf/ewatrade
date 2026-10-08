import { describe, expect, test } from "bun:test"
import { resolveGreenTillQaPath } from "./green-till-qa-link"

describe("Green Till native QA links", () => {
  test("opens only named local development fixtures, retaining state parameters", () => {
    expect(
      resolveGreenTillQaPath(
        "ewatrade-dev://qa-auth-onboarding-modal?view=login&theme=dark",
        true,
      ),
    ).toBe("/qa-auth-onboarding-modal?view=login&theme=dark")
    expect(
      resolveGreenTillQaPath("ewatrade-dev://qa-startup-splash-modal/", true),
    ).toBe("/qa-startup-splash-modal")
    expect(
      resolveGreenTillQaPath("ewatrade-dev://qa-owner-setup-modal", true),
    ).toBe("/qa-owner-setup-modal")
  })
  test("opens Quick Fill forms in development for QA", () => {
    expect(resolveGreenTillQaPath("ewatrade-dev://closeout-modal", true)).toBe(
      "/closeout-modal",
    )
    expect(
      resolveGreenTillQaPath("ewatrade-dev://closeout-modal", false),
    ).toBeNull()
  })
  test("cannot open fixtures in a production build", () => {
    expect(
      resolveGreenTillQaPath("ewatrade-dev://qa-auth-onboarding-modal", false),
    ).toBeNull()
  })
  test("rejects public, preview, credentialed and unrelated routes", () => {
    for (const path of [
      "https://qa-auth-onboarding-modal",
      "ewatrade-preview://qa-auth-onboarding-modal",
      "ewatrade-dev://user@qa-auth-onboarding-modal",
      "ewatrade-dev://qa-auth-onboarding-modal:80",
      "ewatrade-dev://qa-auth-onboarding-modal/other",
      "ewatrade-dev://qa-auth-onboarding-modal#login",
      "ewatrade-dev://login",
      "/qa-auth-onboarding-modal",
      "bad url",
    ])
      expect(resolveGreenTillQaPath(path, true)).toBeNull()
  })
})
