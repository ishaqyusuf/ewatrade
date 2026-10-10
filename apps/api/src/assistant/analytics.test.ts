import { afterEach, expect, test } from "bun:test"
import { assistantAnalyticsContext } from "./analytics"
const enabled = process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED
const qaRoutes = process.env.EMAIL_QA_DOMAIN_ROUTES
afterEach(() => {
  if (enabled === undefined)
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED")
  else process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = enabled
  if (qaRoutes === undefined)
    Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
  else process.env.EMAIL_QA_DOMAIN_ROUTES = qaRoutes
})
test("worker collection permission comes only from an allowed non-QA dashboard request", () => {
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "true"
  process.env.EMAIL_QA_DOMAIN_ROUTES = "{}"
  const ctx = {
    requestHeaders: new Headers({
      origin: "https://dash.ewatrade.com",
      "x-ewatrade-analytics": "allowed",
    }),
    session: { user: { id: "user", email: "user@example.com" } },
    tenantContext: {
      tenant: { id: "tenant", name: "Business", dataClassification: "LIVE" },
      membership: { role: "OWNER" },
    },
  }
  expect(assistantAnalyticsContext(ctx).origin).toBe(
    "https://dash.ewatrade.com",
  )
  for (const modified of [
    { ...ctx, requestHeaders: new Headers() },
    {
      ...ctx,
      requestHeaders: new Headers({
        origin: "https://dash.ewatrade.com",
        "x-ewatrade-analytics": "denied",
      }),
    },
    {
      ...ctx,
      requestHeaders: new Headers({
        origin: "https://evil.example",
        "x-ewatrade-analytics": "allowed",
      }),
    },
    { ...ctx, qaSessionScope: {} },
    {
      ...ctx,
      tenantContext: {
        ...ctx.tenantContext,
        tenant: { ...ctx.tenantContext.tenant, dataClassification: "QA" },
      },
    },
  ])
    expect(assistantAnalyticsContext(modified).origin).toBeUndefined()
  process.env.EMAIL_QA_DOMAIN_ROUTES = "malformed"
  expect(assistantAnalyticsContext(ctx).origin).toBeUndefined()
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "false"
  expect(assistantAnalyticsContext(ctx).origin).toBeUndefined()
})
