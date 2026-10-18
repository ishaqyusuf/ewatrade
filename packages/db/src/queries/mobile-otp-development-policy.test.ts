import { expect, test } from "bun:test"
import { shouldUseFixedMobileOwnerOtp } from "./mobile-otp-development-policy"

test("fixed email codes require an explicit development profile and never a production runtime", () => {
  for (const APP_ENV of ["local", "development", "test"])
    expect(
      shouldUseFixedMobileOwnerOtp({ APP_ENV, NODE_ENV: "development" }),
    ).toBe(true)
  for (const APP_ENV of [undefined, "", "preview", "staging", "production"])
    expect(
      shouldUseFixedMobileOwnerOtp({ APP_ENV, NODE_ENV: "development" }),
    ).toBe(false)
  expect(
    shouldUseFixedMobileOwnerOtp({ APP_ENV: "local", NODE_ENV: "production" }),
  ).toBe(false)
})
