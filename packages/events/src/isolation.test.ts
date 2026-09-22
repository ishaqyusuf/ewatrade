import { afterEach, expect, test } from "bun:test"
import { createEventsRoute } from "./route"
const originalFetch = globalThis.fetch
const keys = [
  "LOGLY_COLLECTOR_URL",
  "LOGLY_DASHBOARD_PROJECT_KEY",
  "LOGLY_MARKETING_PROJECT_KEY",
  "LOGLY_PROJECT_KEY",
  "NEXT_PUBLIC_LOGLY_PROJECT",
  "LOGLY_MOBILE_PROJECT_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of keys) {
    if (original[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = original[key]
  }
})
function request(origin?: string, native = false, extra = {}) {
  return new Request("https://ewatrade.com/api/analytics", {
    method: "POST",
    headers: origin ? { origin } : {},
    body: JSON.stringify({
      sentAt: new Date().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.3.0" },
      events: [
        {
          eventId: crypto.randomUUID(),
          project: "wrong-project",
          version: 1,
          name: native ? "screen_view" : "page_view",
          source: native ? "mobile" : "browser",
          ...(native
            ? { platform: "android", appVersion: "1.0.0", appBuild: "12" }
            : {}),
          occurredAt: new Date().toISOString(),
          route: "/orders/private-token?email=secret",
          visitorId: "installation-123",
          actorId: "private-user",
          properties: { email: "secret" },
          ...extra,
        },
      ],
    }),
  })
}
function configure() {
  process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
  process.env.LOGLY_PROJECT_KEY = "wrong-shared-key"
  process.env.NEXT_PUBLIC_LOGLY_PROJECT = "wrong-shared-project"
  process.env.LOGLY_DASHBOARD_PROJECT_KEY = "dashboard-key"
  process.env.LOGLY_MARKETING_PROJECT_KEY = "marketing-key"
  process.env.LOGLY_MOBILE_PROJECT_KEY = "mobile-key"
}
test("fixed namespaces and exact origins isolate dashboard and marketing despite shared env", async () => {
  configure()
  for (const [surface, origin] of [
    ["dashboard", "https://dashboard.ewatrade.com"],
    ["marketing", "https://ewatrade.com"],
    ["marketing", "https://www.ewatrade.com"],
  ] as const) {
    globalThis.fetch = (async (_url, init) => {
      const headers = new Headers(init?.headers)
      expect(headers.get("x-logly-project-key")).toBe(`${surface}-key`)
      expect(headers.get("x-logly-origin")).toBe(origin)
      const event = JSON.parse(String(init?.body)).events[0]
      expect(event.project).toBe(`ewatrade-${surface}`)
      expect(event.route).toBe("/orders")
      expect(event.properties).toEqual({})
      expect(event).not.toHaveProperty("actorId")
      return Response.json({ accepted: 1 }, { status: 202 })
    }) as typeof fetch
    expect((await createEventsRoute(surface)(request(origin))).status).toBe(202)
    for (const foreign of [
      "https://tenant.ewatrade.com",
      "https://ewatrade.com:444",
      "https://ewatrade.com.evil.test",
      surface === "dashboard"
        ? "https://ewatrade.com"
        : "https://dashboard.ewatrade.com",
    ])
      expect((await createEventsRoute(surface)(request(foreign))).status).toBe(
        403,
      )
  }
  Reflect.deleteProperty(process.env, "LOGLY_DASHBOARD_PROJECT_KEY")
  expect(
    (
      await createEventsRoute("dashboard")(
        request("https://dashboard.ewatrade.com"),
      )
    ).status,
  ).toBe(503)
})
test("native contract retains Android attribution while dropping private fields", async () => {
  configure()
  globalThis.fetch = (async (_url, init) => {
    expect(new Headers(init?.headers).get("x-logly-project-key")).toBe(
      "mobile-key",
    )
    expect(JSON.parse(String(init?.body)).events[0]).toEqual({
      eventId: expect.any(String),
      project: "ewatrade-mobile",
      name: "screen_view",
      version: 1,
      source: "mobile",
      platform: "android",
      occurredAt: expect.any(String),
      visitorId: "installation-123",
      appVersion: "1.0.0",
      appBuild: "12",
      route: "/orders",
      properties: {},
    })
    return Response.json({ accepted: 1 }, { status: 202 })
  }) as typeof fetch
  expect(
    (await createEventsRoute("mobile")(request(undefined, true))).status,
  ).toBe(202)
  expect(
    (
      await createEventsRoute("mobile")(
        request(undefined, true, { platform: "ios" }),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await createEventsRoute("marketing")(
        request("https://ewatrade.com", true),
      )
    ).status,
  ).toBe(400)
  globalThis.fetch = Object.assign(
    async () => {
      throw new Error("offline")
    },
    { preconnect: originalFetch.preconnect },
  )
  expect(
    (await createEventsRoute("mobile")(request(undefined, true))).status,
  ).toBe(502)
})
