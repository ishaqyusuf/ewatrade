import { expect, test } from "bun:test"
import { ExternalDeletionRequestForm } from "@/components/legal/external-deletion-request-form"
import { renderToStaticMarkup } from "react-dom/server"
import Page from "./page"

test("public deletion page offers an email request path until verified intake is ready", async () => {
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
  const expectEmailRequest = async () => {
    const html = renderToStaticMarkup(await intake())
    expect(html).toContain("Request account deletion")
    expect(html).toContain(
      "mailto:founders@ewatrade.com?subject=EwaTrade%20account%20deletion%20request",
    )
    expect(html).toContain(
      "Sending the request does not mean deletion is complete",
    )
  }
  try {
    process.env.ACCOUNT_PRIVACY_REQUESTS_ENABLED = "true"
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "short-secret"
    process.env.RESEND_API_KEY = "mail-key"
    process.env.EMAIL_FROM = "privacy@example.com"
    process.env.EMAIL_DELIVERY_MODE = "live"
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = "x-client-ip"
    await expectEmailRequest()

    process.env.ACCOUNT_PRIVACY_OTP_SECRET = "a".repeat(32)
    expect((await intake())?.type).toBe(ExternalDeletionRequestForm)

    process.env.EMAIL_DELIVERY_MODE = "console"
    await expectEmailRequest()
    process.env.EMAIL_DELIVERY_MODE = "live"
    process.env.EMAIL_CAPTURE_FILE = "/tmp/captured-mail.jsonl"
    await expectEmailRequest()
    Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")

    process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = " "
    await expectEmailRequest()
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
