import { describe, expect, test } from "bun:test"

import {
  getRequestedMarketingExperience,
  isMarketingExperienceId,
} from "./marketing-experience"

describe("marketing experience configuration", () => {
  test("recognizes registered experience ids", () => {
    expect(isMarketingExperienceId("legacy-v1")).toBe(true)
    expect(isMarketingExperienceId("operator-v2")).toBe(true)
    expect(isMarketingExperienceId("shop-v3")).toBe(true)
    expect(isMarketingExperienceId("launch-v4")).toBe(true)
    expect(isMarketingExperienceId("unknown-v3")).toBe(false)
  })

  test("falls back when configuration is empty or unknown", () => {
    expect(getRequestedMarketingExperience("")).toBe("launch-v4")
    expect(getRequestedMarketingExperience("unknown-v3")).toBe("launch-v4")
  })

  test("keeps a registered configured experience", () => {
    expect(getRequestedMarketingExperience("operator-v2")).toBe("operator-v2")
  })
})
