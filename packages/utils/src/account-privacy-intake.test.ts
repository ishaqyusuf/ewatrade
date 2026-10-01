import { expect, test } from "bun:test"
import {
  isAccountPrivacyEmailIntakeConfigured,
  isAccountPrivacyOtpSecretConfigured,
} from "./account-privacy-intake"

test("account deletion intake requires a usable OTP secret and mail settings", () => {
  const ready = {
    ACCOUNT_PRIVACY_REQUESTS_ENABLED: "true",
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
  expect(
    isAccountPrivacyEmailIntakeConfigured({
      ...ready,
      ACCOUNT_PRIVACY_REQUESTS_ENABLED: "false",
    }),
  ).toBe(false)
})
