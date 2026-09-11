import { describe, expect, test } from "bun:test"

import { resolveMarketingExperience } from "./marketing-experience-policy"

describe("marketing experience production policy", () => {
  test("keeps the selected experience outside production", () => {
    expect(
      resolveMarketingExperience({
        requestedExperience: "operator-v2",
        nodeEnvironment: "development",
      }),
    ).toBe("operator-v2")
  })

  test("keeps operator-v2 after it is approved for preview deployment", () => {
    expect(
      resolveMarketingExperience({
        requestedExperience: "operator-v2",
        nodeEnvironment: "production",
      }),
    ).toBe("operator-v2")
  })

  test("keeps a production-ready experience in production", () => {
    expect(
      resolveMarketingExperience({
        requestedExperience: "legacy-v1",
        nodeEnvironment: "production",
      }),
    ).toBe("legacy-v1")
  })
})
