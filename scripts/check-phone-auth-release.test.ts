import { expect, test } from "bun:test"
import {
  phoneAuthReleaseReadiness,
  probeDisabledPhoneAuth,
} from "./check-phone-auth-release"

function fixture() {
  return {
    server: {
      APP_ENV: "production",
      DEV_PROFILE: "prod",
      NODE_ENV: "production",
      API_URL: "https://api.ewatrade.com",
      NEXT_PUBLIC_API_URL: "https://api.ewatrade.com",
      WHATSAPP_OTP_ENABLED: "false",
      WHATSAPP_OTP_PHONE_NUMBER_ID: "1392318457295932",
      WHATSAPP_OTP_TEMPLATE_NAME: "ewatrade_login_otp",
      WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en_US",
      BETTER_AUTH_SECRET: "synthetic-auth-key-only-for-this-fixture",
      ACCOUNT_PRIVACY_OTP_SECRET: "synthetic-contact-key-only-for-this-fixture",
      ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      RESEND_API_KEY: "synthetic-never-dispatched",
      EMAIL_FROM: "privacy@example.invalid",
      EMAIL_DELIVERY_MODE: "live",
      QA_ACCELERATOR_ENABLED: "false",
    } as Record<string, string>,
    mobile: {
      EXPO_PUBLIC_APP_VARIANT: "production",
      EXPO_PUBLIC_API_URL: "https://api.ewatrade.com",
      EXPO_PUBLIC_LEGAL_ORIGIN: "https://ewatrade.com",
    } as Record<string, string>,
  }
}

test("disabled preparation passes without pretending activation is accepted", () => {
  const { server, mobile } = fixture()
  const result = phoneAuthReleaseReadiness(server, mobile)
  expect(result.failures).toEqual([])
  expect(result.pending).toContain(
    "Install a reviewed production token before future activation.",
  )
  expect(server.WHATSAPP_OTP_ENABLED).toBe("false")
})

test.each(["true", "", "FALSE"])(
  "refuses an enabled or ambiguous gate: %s",
  (value) => {
    const { server, mobile } = fixture()
    server.WHATSAPP_OTP_ENABLED = value
    expect(phoneAuthReleaseReadiness(server, mobile).failures).toContain(
      "WHATSAPP_OTP_ENABLED must explicitly remain false.",
    )
  },
)

test("refuses local profiles, a foreign sender, untrusted ingress and capture mail", () => {
  const { server, mobile } = fixture()
  Object.assign(server, {
    APP_ENV: "local",
    DEV_PROFILE: "local",
    NODE_ENV: "development",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "wrong-sender",
    ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for",
    EMAIL_CAPTURE_FILE: "/tmp/synthetic-capture",
  })
  expect(phoneAuthReleaseReadiness(server, mobile).failures).toHaveLength(4)
})

test("refuses secrets in the client and mismatched production origins", () => {
  const { server, mobile } = fixture()
  mobile.EXPO_PUBLIC_WHATSAPP_OTP_ACCESS_TOKEN = "do-not-print-this-value"
  mobile.EXPO_PUBLIC_API_URL = "https://wrong.example.invalid"
  const result = phoneAuthReleaseReadiness(server, mobile)
  expect(result.failures).toHaveLength(2)
  expect(JSON.stringify(result)).not.toContain("do-not-print-this-value")
})

test("a dormant token remains unchanged and still requires expiry/permission review", () => {
  const { server, mobile } = fixture()
  server.WHATSAPP_OTP_ACCESS_TOKEN = "synthetic-token-no-provider-use"
  const result = phoneAuthReleaseReadiness(server, mobile)
  expect(result.failures).toEqual([])
  expect(result.pending[0]).toContain("permissions, expiry")
  expect(JSON.stringify(result)).not.toContain(server.WHATSAPP_OTP_ACCESS_TOKEN)
  expect(server.WHATSAPP_OTP_ENABLED).toBe("false")
})

test("refuses a server token exposed through Expo's public build prefix", () => {
  const { server, mobile } = fixture()
  server.EXPO_PUBLIC_WHATSAPP_OTP_ACCESS_TOKEN = "synthetic-never-export"
  const result = phoneAuthReleaseReadiness(server, mobile)
  expect(result.failures).toHaveLength(1)
  expect(JSON.stringify(result)).not.toContain("synthetic-never-export")
})

test("hosted probe uses only GET and requires exact disabled contract", async () => {
  const requests: string[] = []
  const fetcher: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(String(input))
      expect(init?.method ?? "GET").toBe("GET")
      expect(init?.redirect).toBe("manual")
      return Response.json({ result: { data: { json: { enabled: false } } } })
    },
    { preconnect: fetch.preconnect },
  )
  expect(
    await probeDisabledPhoneAuth("https://api.example.invalid", fetcher),
  ).toEqual([])
  expect(requests).toEqual([
    "https://api.example.invalid/api/trpc/auth.phoneOtpAvailability",
  ])
})

test.each([
  Response.json({ result: { data: { json: { enabled: true } } } }),
  Response.json({ result: { data: { enabled: false } } }),
  new Response("missing", { status: 404 }),
  new Response(null, { status: 302 }),
])("hosted ambiguity or enabled service fails closed", async (response) => {
  const fetcher = Object.assign(async () => response, {
    preconnect: fetch.preconnect,
  })
  expect(
    await probeDisabledPhoneAuth("https://api.example.invalid", fetcher),
  ).toHaveLength(1)
})
