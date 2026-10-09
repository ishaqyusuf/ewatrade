import { describe, expect, test } from "bun:test"
import { isMarketingSignupEnabled } from "./marketing-signup"

describe("isMarketingSignupEnabled", () => {
  test("protected Preview never advertises intake that its handler blocks", () => {
    for (const preview of [{ APP_ENV: "preview" }, { VERCEL_ENV: "preview" }])
      expect(
        isMarketingSignupEnabled(
          { ...preview, NEXT_PUBLIC_SIGNUP_ENABLED: "true" },
          () => true,
        ),
      ).toBe(false)
  })
  test("requires the signup switch", () => {
    expect(isMarketingSignupEnabled({}, () => true)).toBe(false)
    expect(
      isMarketingSignupEnabled(
        { NEXT_PUBLIC_SIGNUP_ENABLED: "false" },
        () => true,
      ),
    ).toBe(false)
  })

  test("requires the Terms gate to allow signup", () => {
    expect(
      isMarketingSignupEnabled(
        { NEXT_PUBLIC_SIGNUP_ENABLED: "true" },
        () => false,
      ),
    ).toBe(false)
  })

  test("is enabled when both allow it", () => {
    expect(
      isMarketingSignupEnabled(
        { NEXT_PUBLIC_SIGNUP_ENABLED: "true" },
        () => true,
      ),
    ).toBe(true)
  })
})
