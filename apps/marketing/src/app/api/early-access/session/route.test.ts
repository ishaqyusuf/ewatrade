import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

function fixture(email = "owner@ishaq.qa.test") {
  return {
    completed: false,
    expiresAt: new Date(Date.now() + 60_000),
    token: "ea_synthetic_fixture",
    formData: {
      kind: "early_access",
      approvedAt: new Date().toISOString(),
      emailVerifiedAt: new Date().toISOString(),
      accessUrl:
        "https://ewatrade.localhost/signup?access_token=ea_synthetic_fixture",
      companyName: "Hello",
      email,
      fullName: "Ada Okafor",
      leadId: "synthetic-lead",
      requestedAt: new Date().toISOString(),
    },
  }
}
let session = fixture()
mock.module("@ewatrade/db", () => ({
  prisma: { onboardingSession: { findUnique: async () => session } },
}))
const { GET } = await import("./route")
const previousRoutes = process.env.EMAIL_QA_DOMAIN_ROUTES
beforeEach(() => {
  session = fixture()
  process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ishaq.qa.test":"tester@example.com"}'
})
afterEach(() => {
  if (previousRoutes === undefined)
    Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
  else process.env.EMAIL_QA_DOMAIN_ROUTES = previousRoutes
})
function request() {
  return new NextRequest(
    "https://ewatrade.localhost/api/early-access/session?token=ea_synthetic_fixture",
  )
}

test("verified QA session exposes its address hint without caching the bearer response", async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toMatchObject({
    qaWorkspace: true,
    lead: { email: "owner@ishaq.qa.test", firstName: "Ada" },
  })
})
for (const email of ["owner@example.com", "owner@unknown.test"]) {
  test(`a verified ${email} session does not grant a QA hint`, async () => {
    session = fixture(email)
    expect(await (await GET(request())).json()).toMatchObject({
      qaWorkspace: false,
    })
  })
}
for (const state of ["expired", "consumed"]) {
  test(`${state} session rejects before exposing lead or QA details`, async () => {
    if (state === "expired") session.expiresAt = new Date(Date.now() - 1000)
    else session.completed = true
    const response = await GET(request())
    expect(response.status).toBe(410)
    const body = await response.json()
    expect(body).not.toHaveProperty("lead")
    expect(body).not.toHaveProperty("qaWorkspace")
  })
}
