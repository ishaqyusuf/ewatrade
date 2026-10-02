import { afterEach, expect, test } from "bun:test"
import type { TRPCContext } from "../init"
import { createCallerFactory } from "../init"
import { tenantRouter } from "./tenant"
const originalRoutes = process.env.EMAIL_QA_DOMAIN_ROUTES
const originalSecret = process.env.LOGLY_IDENTITY_SECRET
afterEach(() => {
  if (originalRoutes === undefined)
    Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
  else process.env.EMAIL_QA_DOMAIN_ROUTES = originalRoutes
  if (originalSecret === undefined)
    Reflect.deleteProperty(process.env, "LOGLY_IDENTITY_SECRET")
  else process.env.LOGLY_IDENTITY_SECRET = originalSecret
})
function caller(
  email: string,
  classification: "QA" | "LIVE" = "LIVE",
  qa = false,
) {
  return createCallerFactory(tenantRouter)({
    db: {},
    session: { user: { id: "account", email } },
    requestHeaders: new Headers(),
    qaSessionScope: qa
      ? { tenantId: "tenant", membershipId: "membership", storeId: "store" }
      : null,
    tenantContext: {
      tenant: {
        id: "tenant",
        name: "Example",
        dataClassification: classification,
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store" },
    },
  } as unknown as TRPCContext)
}
test("mobile context explicitly denies mapped QA accounts, sessions, and workspaces", async () => {
  process.env.EMAIL_QA_DOMAIN_ROUTES = JSON.stringify({
    "tester.qa.test": "tester@example.com",
  })
  process.env.LOGLY_IDENTITY_SECRET =
    "test-only-attribution-secret-of-32-characters"
  for (const client of [
    caller("owner@tester.qa.test"),
    caller("owner@example.com", "QA"),
    caller("owner@example.com", "LIVE", true),
  ]) {
    expect(await client.analyticsContext()).toEqual({
      enabled: false,
      context: null,
    })
  }
  const normal = await caller("owner@example.com").analyticsContext()
  expect(normal.enabled).toBe(true)
  expect(normal.context?.token).toBeDefined()
})
test("missing attribution configuration preserves normal anonymous analytics", async () => {
  Reflect.deleteProperty(process.env, "LOGLY_IDENTITY_SECRET")
  expect(await caller("owner@example.com").analyticsContext()).toEqual({
    enabled: true,
    context: null,
  })
})
