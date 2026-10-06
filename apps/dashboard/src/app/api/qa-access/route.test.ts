import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const keys = [
  "APP_ENV",
  "NODE_ENV",
  "QA_ACCELERATOR_ENABLED",
  "QA_ACCELERATOR_SECRET",
  "QA_ACCELERATOR_ALLOWED_ORIGINS",
  "EMAIL_QA_DOMAIN_ROUTES",
] as const
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
const calls: string[] = []
let stale = false
const reference = "p".repeat(40)
const token = "opaque-server-token"
const profile = {
  profileReference: reference,
  business: { name: "QA shop" },
  identity: { email: "ada@ishaq.qa.test", name: "Ada" },
  membership: { role: "OWNER" },
  store: { name: "Main" },
}

class QaAccessError extends Error {
  constructor(public category: string) {
    super(category)
  }
}
mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/auth", () => ({
  getAuthCookieDomain: () => undefined,
  createBetterAuthSessionCookieHeaders: () => [
    "better-auth.session_token=signed-test-token; HttpOnly; Path=/",
    "better-auth.session_data=; Max-Age=0; Path=/",
  ],
}))
mock.module("@ewatrade/db/qa-access", () => ({
  QaAccessError,
  authorizeQaDomain: async () => {
    calls.push("authorize")
    return {
      token,
      authorization: { expiresAt: new Date(Date.now() + 60_000) },
    }
  },
  revalidateQaClientAuthorization: async () => {
    calls.push("revalidate")
    if (stale) throw new QaAccessError("authorization_required")
    return {
      qaDomain: "ishaq.qa.test",
      expiresAt: new Date(Date.now() + 60_000),
    }
  },
  listQaAccessProfiles: async () => {
    calls.push("profiles")
    return [profile]
  },
  selectQaAccessProfile: async () => {
    calls.push("select")
    if (stale) throw new QaAccessError("authorization_required")
    return {
      token: "ordinary-session-token",
      expiresAt: new Date(Date.now() + 60_000),
      profile: { businessSlug: "qa-shop", storeId: "qa-store" },
    }
  },
}))
const { GET, POST } = await import("./route.qa")

beforeEach(() => {
  calls.length = 0
  stale = false
  process.env.APP_ENV = "local"
  process.env.NODE_ENV = "development"
  process.env.QA_ACCELERATOR_ENABLED = "true"
  process.env.QA_ACCELERATOR_SECRET = "test-only-qa-signing-secret-long-enough"
  process.env.QA_ACCELERATOR_ALLOWED_ORIGINS =
    "https://ewatrade-dashboard.localhost"
  process.env.EMAIL_QA_DOMAIN_ROUTES =
    '{"ishaq.qa.test":"qa-inbox@example.test"}'
})
afterAll(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})
function request(
  body?: object,
  options: { origin?: string | null; cookie?: boolean } = {},
) {
  const headers = new Headers({ host: "ewatrade-dashboard.localhost" })
  if (options.origin !== null)
    headers.set(
      "origin",
      options.origin ?? "https://ewatrade-dashboard.localhost",
    )
  if (options.cookie)
    headers.set("cookie", `ewatrade.qa_authorization.v1=${token}`)
  return new NextRequest("https://ewatrade-dashboard.localhost/api/qa-access", {
    headers,
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

test.each(["local", "dev", "preview"])(
  "%s anonymous login exposes capability without account data",
  async (environment) => {
    process.env.APP_ENV = environment
    const response = await GET(request())
    expect(await response.json()).toEqual({ available: true, access: null })
    expect(calls).toEqual([])
  },
)
test("Production and disabled entry make no authorization or session calls", async () => {
  process.env.QA_ACCELERATOR_ENABLED = "false"
  process.env.APP_ENV = "production"
  expect((await GET(request())).status).toBe(404)
  expect(
    (await POST(request({ action: "authorize", qaDomain: "ishaq.qa.test" })))
      .status,
  ).toBe(404)
  expect(calls).toEqual([])
})
test.each([null, "https://outside.example"])(
  "mutations reject missing or foreign Origin %s",
  async (origin) => {
    const response = await POST(
      request({ action: "authorize", qaDomain: "ishaq.qa.test" }, { origin }),
    )
    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  },
)
test("unknown domains and extra credential fields cannot authorize", async () => {
  expect(
    (await POST(request({ action: "authorize", qaDomain: "other.qa.test" })))
      .status,
  ).toBe(401)
  expect(
    (
      await POST(
        request({
          action: "authorize",
          qaDomain: "ishaq.qa.test",
          password: "unexpected",
        }),
      )
    ).status,
  ).toBe(400)
  expect(calls).toEqual([])
})
test("domain load returns profile choices and keeps authorization token in HttpOnly cookies", async () => {
  const response = await POST(
    request({ action: "authorize", qaDomain: "ishaq.qa.test" }),
  )
  const body = await response.json()
  expect(body.access.profiles).toEqual([profile])
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(JSON.stringify(body)).not.toContain(token)
  expect(response.headers.getSetCookie()).toHaveLength(2)
  expect(
    response.headers
      .getSetCookie()
      .every((cookie) => cookie.includes("HttpOnly")),
  ).toBe(true)
  expect(calls).toEqual(["authorize", "revalidate", "profiles"])
})
test("stale authorization hides choices and refuses selection", async () => {
  stale = true
  expect(
    await (await GET(request(undefined, { cookie: true }))).json(),
  ).toEqual({ available: true, access: null })
  expect(
    (
      await POST(
        request(
          { action: "select", profileReference: reference },
          { cookie: true },
        ),
      )
    ).status,
  ).toBe(401)
})
test("select requires authorization and returns all session/context cookies with a safe destination", async () => {
  expect(
    (await POST(request({ action: "select", profileReference: reference })))
      .status,
  ).toBe(401)
  expect(calls).toEqual([])
  const response = await POST(
    request(
      {
        action: "select",
        profileReference: reference,
        next: "//outside.example",
      },
      { cookie: true },
    ),
  )
  expect(await response.json()).toEqual({ redirectTo: "/" })
  expect(
    response.headers.getSetCookie().map((cookie) => cookie.split("=")[0]),
  ).toEqual([
    "ewatrade.active_tenant_slug",
    "ewatrade.active_store_id",
    "better-auth.session_token",
    "better-auth.session_data",
  ])
})
