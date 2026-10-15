import { expect, test } from "bun:test"
import {
  accountPrivacyEmailIntakeFailures,
  isAccountPrivacyEmailIntakeConfigured,
  isAccountPrivacyOtpSecretConfigured,
} from "./account-privacy-intake"

test("account deletion intake requires a usable OTP secret and mail settings", () => {
  const ready = {
    ACCOUNT_PRIVACY_OTP_SECRET: "a".repeat(32),
    RESEND_API_KEY: "mail-key",
    EMAIL_FROM: "privacy@example.com",
    EMAIL_DELIVERY_MODE: "live",
  }
  expect(isAccountPrivacyEmailIntakeConfigured(ready)).toBe(true)
  expect(isAccountPrivacyOtpSecretConfigured("a".repeat(32))).toBe(true)
  for (const secret of [undefined, "short", " ".repeat(32)]) {
    expect(isAccountPrivacyOtpSecretConfigured(secret)).toBe(false)
    expect(
      isAccountPrivacyEmailIntakeConfigured({
        ...ready,
        ACCOUNT_PRIVACY_OTP_SECRET: secret,
      }),
    ).toBe(false)
  }
  expect(
    isAccountPrivacyEmailIntakeConfigured({ ...ready, RESEND_API_KEY: " " }),
  ).toBe(false)
  expect(
    isAccountPrivacyEmailIntakeConfigured({ ...ready, EMAIL_FROM: " " }),
  ).toBe(false)
  expect(
    isAccountPrivacyEmailIntakeConfigured({
      ...ready,
      EMAIL_DELIVERY_MODE: "console",
    }),
  ).toBe(false)
  expect(
    isAccountPrivacyEmailIntakeConfigured({
      ...ready,
      EMAIL_DELIVERY_MODE: undefined,
    }),
  ).toBe(false)
  expect(
    isAccountPrivacyEmailIntakeConfigured({
      ...ready,
      EMAIL_CAPTURE_FILE: "/tmp/captured-mail.jsonl",
    }),
  ).toBe(false)
})

test("operator diagnostics report every missing setting without printing secrets", () => {
  expect(accountPrivacyEmailIntakeFailures({})).toHaveLength(4)
  const failures = accountPrivacyEmailIntakeFailures({
    ACCOUNT_PRIVACY_OTP_SECRET: "private-short-secret",
    RESEND_API_KEY: "private-provider-key",
    EMAIL_FROM: "privacy@example.com",
    EMAIL_DELIVERY_MODE: "console",
    EMAIL_CAPTURE_FILE: "/private/not-for-output.json",
  })
  expect(failures).toHaveLength(3)
  expect(failures.join(" ")).not.toContain("private-short-secret")
  expect(failures.join(" ")).not.toContain("private-provider-key")
  expect(failures.join(" ")).not.toContain("/private/not-for-output.json")
})
