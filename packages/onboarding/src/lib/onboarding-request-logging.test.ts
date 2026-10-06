import { expect, test } from "bun:test"
import {
  onboardingRequestLogIgnore,
  onboardingSignupResponseHeaders,
} from "./onboarding-request-logging"
test("selected capability URLs stay out of Next development access logs", () => {
  for (const path of [
    "/signup?access_token=private",
    "/signup/?access_token=private",
    "/api/early-access/session?token=private",
    "/api/early-access/verify?token=private",
    "/api/early-access/approve?token=private",
    "/base/signup?access_token=private",
  ]) {
    expect(
      onboardingRequestLogIgnore.some((pattern) => pattern.test(path)),
    ).toBe(true)
  }
  for (const path of [
    "/sales",
    "/signup-extra?access_token=value",
    "/api/early-access/verification",
    "/api/early-access/verify-copy",
  ]) {
    expect(
      onboardingRequestLogIgnore.some((pattern) => pattern.test(path)),
    ).toBe(false)
  }
  expect(onboardingSignupResponseHeaders).toContainEqual({
    key: "Referrer-Policy",
    value: "no-referrer",
  })
})
