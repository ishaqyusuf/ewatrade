import { expect, test } from "bun:test"
import { ExternalDeletionRequestForm } from "@/components/legal/external-deletion-request-form"
import Page from "./page"

test("public deletion page hides intake until the same email-code configuration as the API is ready", async () => {
  const keys = [
    "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
    "ACCOUNT_PRIVACY_OTP_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_DELIVERY_MODE",
    "EMAIL_CAPTURE_FILE",
    "ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER",
  ] as const
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  const intake = async () =>
    (await Page({ searchParams: Promise.resolve({}) })).props.afterSections
  try {
    process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "short-secret"
    process.env.RESEND_API_KEY = "mail-key"
    process.env.EMAIL_FROM = "privacy@example.com"
    process.env.EMAIL_DELIVERY_MODE = "live"
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = "x-client-ip"
    expect(await intake()).toBeUndefined()

    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "a".repeat(32)
    expect((await intake())?.type).toBe(ExternalDeletionRequestForm)

    process.env.EMAIL_DELIVERY_MODE = "console"
    expect(await intake()).toBeUndefined()
    process.env.EMAIL_DELIVERY_MODE = "live"
    process.env.EMAIL_CAPTURE_FILE = "/tmp/captured-mail.jsonl"
    expect(await intake()).toBeUndefined()
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")

    process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = " "
    expect(await intake()).toBeUndefined()
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
