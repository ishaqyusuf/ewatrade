import { afterEach, expect, test } from "bun:test"
import { createAttributedBrowserAnalytics } from "./browser-attribution"
import {
  issueAnalyticsContext,
  verifyAnalyticsContext,
} from "./identity-server"
import { createEventsRoute } from "./route"

const original = { ...process.env }
const originalFetch = globalThis.fetch
const now = Date.now()
const input = {
  project: "ewatrade-dashboard" as const,
  userId: "private-user",
  tenantId: "private-tenant",
  tenantName: "Example business",
  role: "MANAGER",
  internal: false,
}
function context(overrides = {}) {
  process.env.LOGLY_IDENTITY_SECRET =
    "test-only-identity-secret-of-32-characters"
  const issued = issueAnalyticsContext({ ...input, ...overrides }, now)
  if (!issued) throw new Error("Expected configured context")
  return issued
}
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of [
    "LOGLY_IDENTITY_SECRET",
    "LOGLY_COLLECTOR_URL",
    "LOGLY_DASHBOARD_PROJECT_KEY",
  ]) {
    if (original[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = original[key]
  }
})
test("stable group identity survives business rename and isolates project/user/tenant", () => {
  const first = context()
  const renamed = context({ tenantName: "New name" })
  const verified = verifyAnalyticsContext(
    first.token,
    input.project,
    new Date(now).toISOString(),
    now,
  )
  if (!verified) throw new Error("Expected verified context")
  expect(first.identityKey).toBe(renamed.identityKey)
  expect(first.identityKey).not.toBe(context({ tenantId: "other" }).identityKey)
  expect(first.identityKey).not.toBe(context({ userId: "other" }).identityKey)
  expect(first.identityKey).not.toBe(
    context({ project: "ewatrade-mobile" }).identityKey,
  )
  expect(JSON.stringify(verified)).not.toContain("private-")
  expect(verified.groups.business?.properties.name).toBe("Example business")
  expect(verified.properties.workspace_role).toBe("MANAGER")
})
test("proof rejects forgery, wrong project, expired capture and missing secret but accepts bounded delayed delivery", () => {
  const issued = context()
  const capturedAt = new Date(now + 1000).toISOString()
  expect(
    verifyAnalyticsContext(
      issued.token,
      input.project,
      capturedAt,
      now + 3600000,
    ),
  ).not.toBeNull()
  expect(
    verifyAnalyticsContext(
      `${issued.token}0`,
      input.project,
      capturedAt,
      now + 1000,
    ),
  ).toBeNull()
  expect(
    verifyAnalyticsContext(
      issued.token,
      "ewatrade-mobile",
      capturedAt,
      now + 1000,
    ),
  ).toBeNull()
  expect(
    verifyAnalyticsContext(
      issued.token,
      input.project,
      new Date(now + 1000000).toISOString(),
      now + 1000000,
    ),
  ).toBeNull()
  Reflect.deleteProperty(process.env, "LOGLY_IDENTITY_SECRET")
  expect(issueAnalyticsContext(input)).toBeNull()
  expect(
    verifyAnalyticsContext(issued.token, input.project, capturedAt),
  ).toBeNull()
})
test("browser retries retain captured context, logout drops queue and rotates visitor", async () => {
  const issued = context()
  const sent: Array<{
    events: Array<{ analyticsContext?: string; visitorId?: string }>
  }> = []
  const values = new Map<string, string>()
  let fail = true
  const client = createAttributedBrowserAnalytics({
    now: () => now + 1000,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
    },
    send: async (batch) => {
      sent.push(JSON.parse(JSON.stringify(batch)))
      if (fail) throw new Error("offline")
    },
  })
  client.trackPageView("/orders/private", issued)
  await client.flush()
  const visitor = sent[0]?.events[0]?.visitorId
  issued.token = "mutated-by-caller"
  fail = false
  await client.flush()
  expect(sent[1]?.events[0]?.analyticsContext).toBe(
    sent[0]?.events[0]?.analyticsContext,
  )
  client.trackPageView("/login", null)
  await client.flush()
  expect(sent[2]?.events.every((event) => !event.analyticsContext)).toBe(true)
  expect(sent[2]?.events[0]?.visitorId).not.toBe(visitor)
  client.destroy()
})
test("proxy replaces spoofed identity with signed group and removes proof from collector payload", async () => {
  const issued = context()
  process.env.LOGLY_COLLECTOR_URL = "https://collector.example"
  process.env.LOGLY_DASHBOARD_PROJECT_KEY = "test-key"
  let forwarded = 0
  globalThis.fetch = (async (_url, init) => {
    const event = JSON.parse(String(init?.body)).events[0]
    expect(event.name).toBe("order_created")
    expect(event.groups.business.properties.name).toBe("Example business")
    expect(event.actorId).toMatch(/^usr_/)
    expect(event.properties).toEqual({
      channel: "pos",
      item_count: 3,
      workspace_role: "MANAGER",
      audience: "business",
    })
    expect(event).not.toHaveProperty("analyticsContext")
    expect(JSON.stringify(event)).not.toContain("spoofed")
    forwarded++
    return Response.json({ accepted: 1 }, { status: 202 })
  }) as typeof fetch
  const request = (token: string) =>
    new Request("https://dash.ewatrade.com/api/analytics", {
      method: "POST",
      headers: { origin: "https://dash.ewatrade.com" },
      body: JSON.stringify({
        sentAt: new Date(now).toISOString(),
        sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
        events: [
          {
            eventId: crypto.randomUUID(),
            project: input.project,
            name: "order_created",
            version: 1,
            source: "browser",
            occurredAt: new Date(now).toISOString(),
            actorId: "spoofed-user",
            groups: { business: { key: "spoofed" } },
            analyticsContext: token,
            properties: {
              email: "spoofed",
              channel: "pos",
              item_count: 3,
              workspace_role: "spoofed-admin",
              audience: "spoofed",
            },
          },
        ],
      }),
    })
  expect(
    (await createEventsRoute("dashboard")(request(issued.token))).status,
  ).toBe(202)
  expect(
    (await createEventsRoute("dashboard")(request(`${issued.token}x`))).status,
  ).toBe(400)
  expect(forwarded).toBe(1)
})

test("internal account without tenant retains actor identity and permits bounded clock skew", () => {
  const issued = context({
    tenantId: undefined,
    tenantName: undefined,
    role: undefined,
    internal: true,
  })
  const verified = verifyAnalyticsContext(
    issued.token,
    input.project,
    new Date(now - 30000).toISOString(),
    now,
  )
  expect(verified?.actorId).toMatch(/^usr_/)
  expect(verified?.groups).toEqual({})
  expect(verified?.properties).toEqual({ audience: "internal" })
  expect(
    verifyAnalyticsContext(
      issued.token,
      input.project,
      new Date(now - 61000).toISOString(),
      now,
    ),
  ).toBeNull()
})

test("in-flight old-account acknowledgement cannot remove or retag new-account events", async () => {
  const sent: Array<{ events: Array<{ analyticsContext?: string }> }> = []
  let release: (() => void) | undefined
  const first = context()
  const second = context({ tenantId: "second-business" })
  const values = new Map<string, string>()
  const client = createAttributedBrowserAnalytics({
    now: () => now + 1000,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
    },
    send: async (batch) => {
      sent.push(structuredClone(batch))
      if (sent.length === 1)
        await new Promise<void>((resolve) => {
          release = resolve
        })
    },
  })
  try {
    client.trackPageView("/orders", first)
    client.trackPageView("/orders", second)
    release?.()
    await client.flush()
    await client.flush()
    expect(sent).toHaveLength(2)
    expect(
      sent[0]?.events.every((event) => event.analyticsContext === first.token),
    ).toBe(true)
    expect(
      sent[1]?.events.every((event) => event.analyticsContext === second.token),
    ).toBe(true)
  } finally {
    client.destroy()
  }
})
