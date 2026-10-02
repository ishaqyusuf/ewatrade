import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const envKeys = [
  "NODE_ENV",
  "APP_ENV",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "EMAIL_QA_DOMAIN_ROUTES",
  "VERCEL_API_TOKEN",
]
const previous = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
)
const realEmail = await import("@ewatrade/email")
Reflect.set(process.env, "NODE_ENV", "production")
process.env.NEXT_PUBLIC_PLATFORM_DOMAIN = "ewatrade.com"
const dispatch = mock(async (_input: unknown) => [{ status: "sent" }])
mock.module("@ewatrade/email", () => ({
  ...realEmail,
  dispatchEmailMessages: dispatch,
}))
const signUp = mock(async (_input: unknown) => ({
  user: { id: "synthetic-owner" },
}))
mock.module("@ewatrade/auth", () => ({
  auth: {
    api: {
      signUpEmail: signUp,
      signInEmail: async () => ({ user: { id: "synthetic-owner" } }),
    },
  },
}))
mock.module("@ewatrade/utils/legal-approval", () => ({
  isLegalTestingEnvironment: () => false,
  isApprovedLegalPublication: () => false,
  isSignupAvailableForLegalPublication: () => true,
  currentLegalPublicationDigest: () => "fixture-digest",
  assertLegalVersionHash: () => undefined,
}))
const findTenant = mock(
  async (_input: unknown): Promise<{ id: string } | null> => null,
)
const createTenant = mock(
  async ({ data }: { data: { slug: string } & Record<string, unknown> }) => ({
    ...data,
    id: "synthetic-tenant",
  }),
)
const createHostnames = mock(async (_input: unknown) => ({}))
let sessionEmail = "owner@example.com"
const findSession = mock(
  async (
    _input: unknown,
  ): Promise<{
    id: string
    completed: boolean
    expiresAt: Date
    formData: Record<string, unknown>
  } | null> => ({
    id: "fixture-session",
    completed: false,
    expiresAt: new Date(Date.now() + 60_000),
    formData: {
      accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
      kind: "early_access",
      approvedAt: new Date().toISOString(),
      emailVerifiedAt: new Date().toISOString(),
      companyName: "Hello",
      leadId: "fixture-lead",
      email: sessionEmail,
      fullName: "Test Owner",
      requestedAt: new Date().toISOString(),
    },
  }),
)
const createStore = mock(async (_input: unknown) => ({}))
const tx = {
  user: { update: async () => ({ id: "synthetic-owner" }) },
  tenant: { create: createTenant },
  tenantHostname: { createMany: createHostnames },
  membership: { create: async () => ({}) },
  store: { create: createStore },
  onboardingSession: { updateMany: async () => ({ count: 1 }) },
}
mock.module("@ewatrade/db", () => ({
  prisma: {
    user: { findUnique: async () => null },
    tenant: { findUnique: findTenant },
    onboardingSession: { findUnique: findSession },
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
  },
}))
const { POST } = await import("./route")

beforeEach(() => {
  mock.clearAllMocks()
  findTenant.mockReset()
  findTenant.mockImplementation(async () => null)
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.APP_ENV = "production"
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "true"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://ewatrade.com/dashboard"
  process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ishaq.qa.test":"tester@example.com"}'
  Reflect.deleteProperty(process.env, "VERCEL_API_TOKEN")
})
afterEach(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, previous[key])
  }
})

function request(
  email: string,
  subdomain: string | null = "hello",
  withAccess = true,
  currencyCode = "NGN",
) {
  sessionEmail = email
  return new NextRequest("https://www.ewatrade.com/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ageBand: "ADULT",
      accessToken: withAccess ? "ea_fixture" : undefined,
      subdomain: subdomain ?? undefined,
      businessName: "Hello",
      addressLine1: "12 Sample Road",
      city: "Lagos",
      businessProfileKey: "general-retail-groceries",
      businessProfileVersion: 1,
      businessSize: "solo",
      countryCode: "NG",
      currencyCode,
      phone: "08000000000",
      firstName: "Test",
      lastName: "Owner",
      email,
      password: "synthetic-test-only",
      operatingModel: "products",
      orderChannels: ["walk_in"],
    }),
  })
}

test("ordinary signup preserves its original business identity", async () => {
  const response = await POST(request("owner@example.com"))
  expect(response.status).toBe(200)
  expect(createTenant.mock.lastCall?.[0].data.slug).toBe("hello")
  expect(
    createTenant.mock.lastCall?.[0].data.dataClassification,
  ).toBeUndefined()
  expect(await response.json()).toMatchObject({
    tenantSlug: "hello",
    storefrontUrl: "https://hello.ewatrade.com",
  })
})

test("public signup cannot bypass the early-access request", async () => {
  const response = await POST(request("owner@example.com", "hello", false))
  expect(response.status).toBe(403)
  expect((await response.json()).message).toContain("Request early access")
  expect(signUp).not.toHaveBeenCalled()
  expect(findTenant).not.toHaveBeenCalled()
  expect(findSession).not.toHaveBeenCalled()
  expect(createTenant).not.toHaveBeenCalled()
})

test("an invalid access token cannot create an account or workspace", async () => {
  findSession.mockResolvedValueOnce(null)
  const response = await POST(request("owner@example.com"))
  expect(response.status).toBe(404)
  expect(signUp).not.toHaveBeenCalled()
  expect(createTenant).not.toHaveBeenCalled()
})

test("disabled signup still refuses a valid early-access continuation", async () => {
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "false"
  expect((await POST(request("owner@example.com"))).status).toBe(403)
  expect(signUp).not.toHaveBeenCalled()
})

test("expired and consumed access links remain closed", async () => {
  for (const completed of [false, true]) {
    findSession.mockResolvedValueOnce({
      id: "fixture-session",
      completed,
      expiresAt: completed ? new Date(Date.now() + 60_000) : new Date(0),
      formData: {
        accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
        kind: "early_access",
        approvedAt: new Date().toISOString(),
        emailVerifiedAt: new Date().toISOString(),
        companyName: "Hello",
        leadId: "fixture-lead",
        email: "owner@example.com",
        fullName: "Test Owner",
        requestedAt: new Date().toISOString(),
      },
    })
    expect((await POST(request("owner@example.com"))).status).toBe(410)
  }
  expect(signUp).not.toHaveBeenCalled()
  expect(createTenant).not.toHaveBeenCalled()
})

test("an access link cannot be used for another email", async () => {
  const body = request("owner@example.com")
  sessionEmail = "different@example.com"
  expect((await POST(body)).status).toBe(400)
  expect(signUp).not.toHaveBeenCalled()
  expect(createTenant).not.toHaveBeenCalled()
})

test("signup preserves an explicit operating currency instead of replacing it with the country default", async () => {
  const response = await POST(
    request("owner@example.com", "hello", true, "USD"),
  )
  expect(response.status).toBe(200)
  expect(createTenant.mock.lastCall?.[0].data).toMatchObject({
    countryCode: "NG",
    currencyCode: "USD",
  })
  expect(createStore.mock.lastCall?.[0]).toMatchObject({
    data: { countryCode: "NG", currencyCode: "USD" },
  })
})

test("an old automatic token without approval proof cannot create a workspace", async () => {
  findSession.mockImplementationOnce(async () => ({
    id: "legacy",
    completed: false,
    expiresAt: new Date(Date.now() + 60000),
    formData: {
      kind: "early_access",
      accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
      leadId: "fixture-lead",
      email: "owner@example.com",
      fullName: "Test Owner",
      companyName: "Hello",
      requestedAt: new Date().toISOString(),
    },
  }))
  const response = await POST(request("owner@example.com"))
  expect(response.status).toBe(404)
  expect(signUp).not.toHaveBeenCalled()
  expect(createTenant).not.toHaveBeenCalled()
})

test("an approved contact must verify its email before account creation", async () => {
  findSession.mockImplementationOnce(async () => ({
    id: "unverified",
    completed: false,
    expiresAt: new Date(Date.now() + 60000),
    formData: {
      kind: "early_access",
      approvedAt: new Date().toISOString(),
      accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
      leadId: "fixture-lead",
      email: "owner@example.com",
      fullName: "Test Owner",
      companyName: "Hello",
      requestedAt: new Date().toISOString(),
    },
  }))
  const response = await POST(request("owner@example.com"))
  expect(response.status).toBe(403)
  expect((await response.json()).message).toContain("Verify")
  expect(signUp).not.toHaveBeenCalled()
})

test("verified approval cannot be transferred to another business", async () => {
  findSession.mockImplementationOnce(async () => ({
    id: "other-business",
    completed: false,
    expiresAt: new Date(Date.now() + 60000),
    formData: {
      kind: "early_access",
      approvedAt: new Date().toISOString(),
      emailVerifiedAt: new Date().toISOString(),
      accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
      leadId: "fixture-lead",
      email: "owner@example.com",
      fullName: "Test Owner",
      companyName: "Another Business",
      requestedAt: new Date().toISOString(),
    },
  }))
  const response = await POST(request("owner@example.com"))
  expect(response.status).toBe(403)
  expect((await response.json()).message).toContain("business name")
  expect(signUp).not.toHaveBeenCalled()
})
