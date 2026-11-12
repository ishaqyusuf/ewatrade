import { afterEach, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { POST } from "./route"

const originalFetch = globalThis.fetch
const priorApi = process.env.NEXT_PUBLIC_API_URL
const priorAppEnv = process.env.APP_ENV
const priorVercelEnv = process.env.VERCEL_ENV
afterEach(() => {
  globalThis.fetch = originalFetch
  if (priorApi === undefined)
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_API_URL")
  else process.env.NEXT_PUBLIC_API_URL = priorApi
  if (priorAppEnv === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
  else process.env.APP_ENV = priorAppEnv
  if (priorVercelEnv === undefined)
    Reflect.deleteProperty(process.env, "VERCEL_ENV")
  else process.env.VERCEL_ENV = priorVercelEnv
})

function request(
  body: unknown,
  origin = "https://ewatrade-dashboard.localhost",
) {
  return new NextRequest(
    "https://ewatrade-dashboard.localhost/api/auth/login-code",
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

type Call = { url: string; body: unknown; headers: Headers }
function fixture(reply: unknown, calls: Call[]) {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test"
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      })
      return Response.json([reply])
    },
    { preconnect: originalFetch.preconnect },
  )
}
const ok = (json: unknown) => ({ result: { data: { json } } })
const rejected = (message: string, httpStatus = 400) => ({
  error: {
    json: {
      message,
      code: -32600,
      data: { code: "BAD_REQUEST", httpStatus },
    },
  },
})
const session = (tenant: { slug: string } | null) =>
  ok({
    token: "fixture-session-not-real",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    tenant,
  })

test("sends a login-mode code and sets no session", async () => {
  const calls: Call[] = []
  fixture(ok({ devCode: null, email: "owner@example.test" }), calls)
  const response = await POST(
    request({ action: "request", email: "Owner@Example.test" }),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).sent).toBe(true)
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toContain("auth.requestMobileOwnerOtp")
  expect(JSON.stringify(calls[0]?.body)).toContain(
    '"email":"owner@example.test","mode":"login"',
  )
  expect(response.headers.get("set-cookie")).toBeNull()
})

test("known and unknown emails get the same request response", async () => {
  // The route never looks the account up; the API issues a login code for any
  // address, so both paths make the same single call and return the same body.
  const bodies: unknown[] = []
  for (const email of ["owner@example.test", "nobody@example.test"]) {
    const calls: Call[] = []
    fixture(ok({ devCode: null, email }), calls)
    const response = await POST(request({ action: "request", email }))
    expect(response.status).toBe(200)
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/api/trpc/auth.requestMobileOwnerOtp",
    ])
    bodies.push(await response.json())
  }
  expect(bodies[0]).toEqual(bodies[1])
})

test("only Preview displays the API-provided QA sign-in code", async () => {
  process.env.APP_ENV = "preview"
  process.env.VERCEL_ENV = "preview"
  const body = { action: "request", email: "owner@example.test" }
  const calls: Call[] = []
  fixture(ok({ devCode: null, previewQaCode: "123456" }), calls)
  expect(await (await POST(request(body))).json()).toMatchObject({
    previewQaCode: "123456",
  })
  expect(calls[0]?.headers.get("x-ewatrade-preview-qa-code")).toBe("inline")

  process.env.VERCEL_ENV = "production"
  expect(await (await POST(request(body))).json()).not.toHaveProperty(
    "previewQaCode",
  )
})

test("a wrong or expired code is refused without a session", async () => {
  for (const message of [
    "The verification code is incorrect.",
    "The verification code has expired. Request a new code.",
  ]) {
    const calls: Call[] = []
    fixture(rejected(message), calls)
    const response = await POST(
      request({
        action: "verify",
        email: "owner@example.test",
        code: "000000",
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: message })
    expect(response.headers.get("set-cookie")).toBeNull()
  }
})

test("a correct code signs in with HttpOnly cookies and resets the Store choice", async () => {
  const calls: Call[] = []
  fixture(session({ slug: "jawdah-poultry" }), calls)
  const response = await POST(
    request({ action: "verify", email: "owner@example.test", code: "123456" }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toEqual({ success: true, dashboardUrl: "/" })
  expect(JSON.stringify(body)).not.toContain("fixture-session")
  expect(calls[0]?.url).toContain("auth.verifyMobileOwnerOtp")
  expect(JSON.stringify(calls[0]?.body)).toContain('"mode":"login"')
  const cookies = response.headers.getSetCookie()
  expect(
    cookies.some(
      (cookie) =>
        cookie.includes("session_token=") && cookie.includes("HttpOnly"),
    ),
  ).toBe(true)
  expect(cookies.join("\n")).toContain(
    "ewatrade.active_tenant_slug=jawdah-poultry",
  )
  expect(cookies.join("\n")).toMatch(/ewatrade\.active_store_id=;/)
})

test("an account without an active workspace gets no session", async () => {
  const calls: Call[] = []
  fixture(session(null), calls)
  const response = await POST(
    request({ action: "verify", email: "owner@example.test", code: "123456" }),
  )
  expect(response.status).toBe(403)
  expect(response.headers.get("set-cookie")).toBeNull()
})

test("cross-origin and malformed requests never reach the API", async () => {
  const calls: Call[] = []
  fixture(ok({}), calls)
  expect(
    (
      await POST(
        request(
          { action: "request", email: "owner@example.test" },
          "https://foreign.example",
        ),
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await POST(
        request({ action: "verify", email: "owner@example.test", code: "12" }),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await POST(
        request({
          action: "request",
          email: "owner@example.test",
          password: "x",
        }),
      )
    ).status,
  ).toBe(400)
  expect(calls).toHaveLength(0)
})
