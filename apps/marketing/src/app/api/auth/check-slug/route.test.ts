import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const findTenant = mock(async ({ where }: { where: { slug: string } }) =>
  where.slug === "hello" ? { id: "ordinary-tenant" } : null,
)
mock.module("@ewatrade/db", () => ({
  prisma: { tenant: { findUnique: findTenant } },
}))
const { GET, POST } = await import("./route")
const previousRoutes = process.env.EMAIL_QA_DOMAIN_ROUTES
beforeEach(() => {
  mock.clearAllMocks()
  process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ishaq.qa.test":"tester@example.com"}'
})
afterEach(() => {
  if (previousRoutes === undefined)
    Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
  else process.env.EMAIL_QA_DOMAIN_ROUTES = previousRoutes
})

test("QA can choose an occupied ordinary name because availability checks hello-qa", async () => {
  const response = await POST(
    new NextRequest("https://ewatrade.localhost/api/auth/check-slug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "hello", email: "qa@ishaq.qa.test" }),
    }),
  )
  expect(await response.json()).toEqual({
    available: true,
    slug: "hello-qa",
    isQa: true,
  })
  expect(findTenant.mock.lastCall?.[0].where.slug).toBe("hello-qa")
  expect(response.headers.get("cache-control")).toBe("no-store")
})

test("ordinary availability retains hello and does not check the QA name", async () => {
  const response = await GET(
    new NextRequest(
      "https://ewatrade.localhost/api/auth/check-slug?slug=hello",
    ),
  )
  expect(await response.json()).toEqual({
    available: false,
    slug: "hello",
    isQa: false,
  })
  expect(findTenant.mock.lastCall?.[0].where.slug).toBe("hello")
})

test("an unconfigured QA namespace never checks the ordinary name", async () => {
  const response = await POST(
    new NextRequest("https://ewatrade.localhost/api/auth/check-slug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "hello", email: "qa@unknown.test" }),
    }),
  )
  expect(response.status).toBe(503)
  expect(findTenant).not.toHaveBeenCalled()
})
