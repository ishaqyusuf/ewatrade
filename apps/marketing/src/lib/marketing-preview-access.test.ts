import { describe, expect, test } from "bun:test"

import { canPreviewMarketingExperience } from "./marketing-preview-access"

describe("marketing preview access", () => {
  test("allows previews outside production", () => {
    expect(
      canPreviewMarketingExperience({
        nodeEnvironment: "development",
      }),
    ).toBe(true)
  })

  test("requires the configured token in production", () => {
    expect(
      canPreviewMarketingExperience({
        configuredToken: "preview-secret",
        nodeEnvironment: "production",
        providedToken: "wrong-secret",
      }),
    ).toBe(false)
  })

  test("allows a matching production token", () => {
    expect(
      canPreviewMarketingExperience({
        configuredToken: "preview-secret",
        nodeEnvironment: "production",
        providedToken: "preview-secret",
      }),
    ).toBe(true)
  })
})
