import { expect, test } from "bun:test"
import type { EventMetadata } from "@ewatrade/events/metadata"
import { safeBatch } from "@ewatrade/events/policy"
import { createEventsRoute } from "@ewatrade/events/route"
import { createLeadCaptureAnalytics } from "./lead-capture-analytics"

function capture() {
  const events: { name: string; properties: EventMetadata }[] = []
  return {
    events,
    track(name: string, properties: EventMetadata) {
      events.push({ name, properties })
    },
  }
}

test("typing and retry keep one start; accepted submission begins a new form cycle", () => {
  const { events, track } = capture()
  const form = createLeadCaptureAnalytics("early-access")
  form.start(track)
  form.start(track)
  form.failed(track, "http_error")
  form.start(track)
  expect(events.map(({ name }) => name)).toEqual([
    "marketing_form_started",
    "marketing_form_failed",
  ])
  form.submitted(track)
  form.start(track)
  expect(events.map(({ name }) => name)).toEqual([
    "marketing_form_started",
    "marketing_form_failed",
    "marketing_form_submitted",
    "marketing_form_started",
  ])
  expect(events[2]?.properties).toEqual({
    surface: "marketing",
    category: "early_access",
    status: "accepted",
    success: true,
  })
})

test("waitlist state is independent and can record another signup after success", () => {
  const { events, track } = capture()
  const earlyAccess = createLeadCaptureAnalytics("early-access")
  const waitlist = createLeadCaptureAnalytics("waitlist")
  earlyAccess.start(track)
  waitlist.start(track)
  waitlist.submitted(track)
  waitlist.start(track)
  expect(events.map(({ properties }) => properties.category)).toEqual([
    "early_access",
    "waitlist",
    "waitlist",
    "waitlist",
  ])
})

test("validation, API and request failures never count as successful conversion", () => {
  const { events, track } = capture()
  const form = createLeadCaptureAnalytics("early-access")
  for (const status of [
    "validation_error",
    "http_error",
    "request_error",
  ] as const) {
    form.failed(track, status)
  }
  expect(events.every(({ name }) => name === "marketing_form_failed")).toBe(
    true,
  )
  expect(events.every(({ properties }) => properties.success === false)).toBe(
    true,
  )
})

test("analytics exceptions cannot escape any form lifecycle handler", () => {
  const form = createLeadCaptureAnalytics("waitlist")
  const track = () => {
    throw new Error("Collector unavailable")
  }
  expect(() => {
    form.start(track)
    form.failed(track, "request_error")
    form.submitted(track)
    form.start(track)
  }).not.toThrow()
})

test("all form events survive the real privacy projection without personal data", () => {
  const { events, track } = capture()
  const form = createLeadCaptureAnalytics("early-access")
  form.start(track)
  form.failed(track, "http_error")
  form.submitted(track)
  const batch = safeBatch(
    {
      sentAt: new Date().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
      events: events.map((event, index) => ({
        ...event,
        eventId: `event-${index}`,
        project: "wrong-project",
        version: 1,
        source: "browser",
        occurredAt: new Date().toISOString(),
        visitorId: "anonymous-visitor",
        route: "/?access_token=private&utm_source=private",
        properties: {
          ...event.properties,
          email: "private@example.com",
          message: "private form contents",
        },
      })),
    },
    "ewatrade-marketing",
  )
  expect(batch.events).toHaveLength(3)
  for (const event of batch.events) {
    expect(event.project).toBe("ewatrade-marketing")
    expect(event.route).toBe("/")
    expect(event.properties).not.toHaveProperty("email")
    expect(event.properties).not.toHaveProperty("message")
    expect(event.properties).toHaveProperty("category", "early_access")
  }
})

test("Marketing proxy forwards all three form events with isolated credentials", async () => {
  const oldCollector = process.env.LOGLY_COLLECTOR_URL
  const oldKey = process.env.LOGLY_MARKETING_PROJECT_KEY
  const originalFetch = globalThis.fetch
  const { events, track } = capture()
  const form = createLeadCaptureAnalytics("waitlist")
  form.start(track)
  form.failed(track, "http_error")
  form.submitted(track)
  const forwarded: { body?: unknown; key?: string | null } = {}
  const collectorFetch: typeof fetch = Object.assign(
    async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      forwarded.body = JSON.parse(String(init?.body))
      forwarded.key = new Headers(init?.headers).get("x-logly-project-key")
      return Response.json({ accepted: 3 }, { status: 202 })
    },
    { preconnect: originalFetch.preconnect },
  )
  try {
    process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
    process.env.LOGLY_MARKETING_PROJECT_KEY = "marketing-fixture-key"
    globalThis.fetch = collectorFetch
    const response = await createEventsRoute("marketing")(
      new Request("https://ewatrade.com/api/analytics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://ewatrade.com",
        },
        body: JSON.stringify({
          sentAt: new Date().toISOString(),
          sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
          events: events.map((event) => ({
            ...event,
            eventId: crypto.randomUUID(),
            project: "ewatrade-marketing",
            version: 1,
            source: "browser",
            occurredAt: new Date().toISOString(),
            visitorId: "v_form_fixture",
            route: "/",
          })),
        }),
      }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: 3 })
    expect(forwarded.key).toBe("marketing-fixture-key")
    expect(forwarded.body).toMatchObject({
      events: events.map((event) => ({
        ...event,
        project: "ewatrade-marketing",
        properties: { ...event.properties, audience: "anonymous" },
      })),
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of [
      ["LOGLY_COLLECTOR_URL", oldCollector],
      ["LOGLY_MARKETING_PROJECT_KEY", oldKey],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
