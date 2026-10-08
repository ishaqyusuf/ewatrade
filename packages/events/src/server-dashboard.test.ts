import { afterEach, beforeEach, expect, test } from "bun:test"
import {
  createDashboardOutcome,
  dashboardCommandId,
  deliverDashboardOutcome,
} from "./server-dashboard"
const keys = [
  "NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED",
  "LOGLY_IDENTITY_SECRET",
  "EMAIL_QA_DOMAIN_ROUTES",
  "LOGLY_COLLECTOR_URL",
  "LOGLY_DASHBOARD_PROJECT_KEY",
  "LOGLY_MARKETING_PROJECT_KEY",
]
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
beforeEach(() => {
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "true"
  process.env.LOGLY_IDENTITY_SECRET = "test-only-identity-secret-32-characters"
  process.env.EMAIL_QA_DOMAIN_ROUTES =
    '{"qa.example.test":"qa-inbox@example.com"}'
  process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
  process.env.LOGLY_DASHBOARD_PROJECT_KEY = "dashboard-test-key"
  process.env.LOGLY_MARKETING_PROJECT_KEY = "marketing-test-key"
})
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
function input() {
  return {
    headers: new Headers({
      origin: "https://dash.ewatrade.com",
      "x-ewatrade-analytics": "allowed",
    }),
    principal: {
      userId: "private-user-id",
      email: "private@example.com",
      tenantId: "private-tenant",
      tenantName: "Business",
      role: "OWNER",
      internal: false,
    },
    path: "orders.create",
    output: {
      id: "private-order",
      customerEmail: "private-customer@example.com",
      total: 4000,
    },
    requestId: crypto.randomUUID(),
    commandId: "stable-command",
  }
}
function requireOutcome(value: Parameters<typeof createDashboardOutcome>[0]) {
  const event = createDashboardOutcome(value)
  if (!event) throw new Error("Expected a server event")
  return event
}
test("server outcomes use authenticated pseudonyms and never copy business payloads", () => {
  const event = requireOutcome(input())
  expect(event.source).toBe("server")
  expect(event.actorId).toMatch(/^usr_[a-f0-9]{64}$/)
  expect(event.groups.business?.key).toMatch(/^grp_[a-f0-9]{64}$/)
  expect(event.properties).toMatchObject({
    category: "sales",
    action: "create",
    channel: "server",
    success: true,
  })
  const serialized = JSON.stringify(event)
  for (const privateValue of [
    "private-user-id",
    "private-tenant",
    "private-order",
    "private-customer@example.com",
    "4000",
  ])
    expect(serialized).not.toContain(privateValue)
})
test("command retries retain one UUID; actors, workspaces and actions stay isolated", () => {
  const request = input()
  const first = requireOutcome(request)
  expect(
    createDashboardOutcome({ ...request, requestId: crypto.randomUUID() })
      ?.eventId,
  ).toBe(first.eventId)
  for (const changed of [
    { ...request, commandId: "other" },
    { ...request, path: "orders.recordPayment" },
    {
      ...request,
      principal: { ...request.principal, tenantId: "other-business" },
    },
    { ...request, principal: { ...request.principal, userId: "other-user" } },
  ])
    expect(createDashboardOutcome(changed)?.eventId).not.toBe(first.eventId)
  expect(
    dashboardCommandId({
      clientCommandId: "command",
      email: "private@example.com",
    }),
  ).toBe("command")
  expect(
    dashboardCommandId({ clientCommandId: "x".repeat(201) }),
  ).toBeUndefined()
})
test("collection fails closed for privacy denial, wrong origins, QA, missing secret and disabled flag", () => {
  const request = input()
  for (const headers of [
    new Headers({
      origin: "https://ewatrade.com",
      "x-ewatrade-analytics": "allowed",
    }),
    new Headers({
      origin: "https://dash.ewatrade.com",
      "x-ewatrade-analytics": "denied",
    }),
    new Headers(),
  ])
    expect(createDashboardOutcome({ ...request, headers })).toBeNull()
  for (const principal of [
    { ...request.principal, qaSession: true },
    { ...request.principal, dataClassification: "QA" },
    { ...request.principal, email: "tester@qa.example.test" },
  ])
    expect(createDashboardOutcome({ ...request, principal })).toBeNull()
  process.env.LOGLY_IDENTITY_SECRET = ""
  expect(createDashboardOutcome(request)).toBeNull()
  process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED = "false"
  expect(createDashboardOutcome(request)).toBeNull()
})
test("setup partial failures are safe server outcomes, not successful conversions", () => {
  const event = requireOutcome({
    ...input(),
    path: "setupAssistant.commit",
    output: {
      results: [
        { state: "COMMITTED", recordId: "private" },
        { state: "FAILED", message: "private" },
      ],
    },
  })
  expect(event.name).toBe("dashboard_assistant_commit_failed")
  expect(event.properties).toMatchObject({ success: false, item_count: 1 })
})
test("server delivery fixes the project/key/origin, retries the same event, and strips arbitrary metadata", async () => {
  const event = requireOutcome(input())
  const bodies: string[] = []
  const send = (async (url, init) => {
    expect(String(url)).toBe("https://collector.example/v1/events")
    const headers = new Headers(init?.headers)
    expect(headers.get("x-logly-project-key")).toBe("dashboard-test-key")
    expect(headers.get("x-logly-origin")).toBe("https://dash.ewatrade.com")
    const body = JSON.parse(String(init?.body))
    expect(body.events[0].properties.email).toBeUndefined()
    bodies.push(body.events[0].eventId)
    return new Response("{}", { status: bodies.length === 1 ? 503 : 202 })
  }) as typeof fetch
  const extra = {
    ...event,
    properties: { ...event.properties, email: "private@example.com" },
  }
  await expect(deliverDashboardOutcome(extra, send)).rejects.toThrow(
    "delivery failed",
  )
  await deliverDashboardOutcome(extra, send)
  expect(bodies).toEqual([event.eventId, event.eventId])
  await expect(
    deliverDashboardOutcome({ ...event, project: "ewatrade-marketing" }, send),
  ).rejects.toThrow()
})
