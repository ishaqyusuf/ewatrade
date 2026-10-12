import { expect, test } from "bun:test"
import { isMarketingSignupEnabled } from "./marketing-signup"

test("follows the Terms gate", () => {
  expect(isMarketingSignupEnabled(() => false)).toBe(false)
  expect(isMarketingSignupEnabled(() => true)).toBe(true)
})
