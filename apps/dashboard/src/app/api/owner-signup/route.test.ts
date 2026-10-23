import { afterEach, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { POST } from "./route"
const originalFetch = globalThis.fetch
const priorApi = process.env.NEXT_PUBLIC_API_URL
const fields = {
  businessName: "Fixture Bakery",
  name: "Fixture Owner",
  email: "owner@example.test",
  requestedSlug: "fixture-bakery",
  ageBand: "ADULT",
}
afterEach(() => {
  globalThis.fetch = originalFetch
  if (priorApi === undefined)
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_API_URL")
  else process.env.NEXT_PUBLIC_API_URL = priorApi
})
function request(
  body: unknown,
  origin = "https://ewatrade-dashboard.localhost",
) {
  return new NextRequest(
    "https://ewatrade-dashboard.localhost/api/owner-signup",
    {
      method: "POST",
      headers: {
        origin,
        host: "ewatrade-dashboard.localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )
}
function fixture(result: unknown, calls: { url: string; body: unknown }[]) {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test"
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return Response.json([{ result: { data: { json: result } } }])
    },
    { preconnect: originalFetch.preconnect },
  )
}
test("registration requests only the canonical signup OTP, without creating an account", async () => {
  const calls: { url: string; body: unknown }[] = []
  fixture(
    { devCode: null, email: fields.email, expiresAt: new Date().toISOString() },
    calls,
  )
  const response = await POST(
    request({
      action: "request_email",
      ...fields,
      acceptedTerms: true,
      acknowledgedPrivacyNotice: true,
    }),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).sent).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toContain("auth.requestMobileOwnerOtp")
  expect(JSON.stringify(calls[0]?.body)).toContain('"mode":"sign_up"')
  expect(response.headers.get("set-cookie")).toBeNull()
})
test("only explicit verification reaches account creation and exchanges the result into HttpOnly cookies", async () => {
  const calls: { url: string; body: unknown }[] = []
  fixture(
    {
      token: "fixture-session-not-real",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      tenant: { slug: fields.requestedSlug },
    },
    calls,
  )
  const response = await POST(
    request({ action: "verify_email", ...fields, code: "123456" }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toEqual({ success: true, redirect: "/setup" })
  expect(JSON.stringify(body)).not.toContain("fixture-session")
  expect(calls[0]?.url).toContain("auth.verifyMobileOwnerOtp")
  expect(response.headers.get("set-cookie")).toContain("HttpOnly")
})
test("cross-origin requests, missing legal choice, underage and malformed proof never reach signup", async () => {
  const calls: { url: string; body: unknown }[] = []
  fixture({}, calls)
  expect(
    (
      await POST(
        request(
          { action: "request_email", ...fields },
          "https://foreign.example",
        ),
      )
    ).status,
  ).toBe(403)
  expect(
    (await POST(request({ action: "request_email", ...fields }))).status,
  ).toBe(400)
  expect(
    (
      await POST(
        request({
          action: "request_email",
          ...fields,
          ageBand: "UNDER_13",
          acceptedTerms: true,
          acknowledgedPrivacyNotice: true,
        }),
      )
    ).status,
  ).toBe(400)
  expect(
    (await POST(request({ action: "verify_email", ...fields, code: "bad" })))
      .status,
  ).toBe(400)
  expect(calls).toHaveLength(0)
})
