import { expect, test } from "bun:test"
import { createAttributedBrowserAnalytics } from "./browser-attribution"
import {
  createStorefrontAnalyticsHandlers,
  storefrontCollectionEnabled,
} from "./storefront-server"

const production = {
  NODE_ENV: "production",
  APP_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_LOGLY_STOREFRONT_ENABLED: "true",
  LOGLY_STOREFRONT_ENABLED: "true",
  LOGLY_STOREFRONT_PROJECT_KEY: "fixture-storefront-key",
  LOGLY_COLLECTOR_URL: "https://collector.example",
  LOGLY_IDENTITY_SECRET: "fixture-only-secret-at-least-32-characters",
}
const merchant = { tenantId: "private-tenant-id", name: "Public shop" }
function request(origin = "https://merchant.example", event = {}) {
  return new Request("https://merchant.example/api/analytics", {
    method: "POST",
    headers: {
      host: "merchant.example",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sentAt: new Date().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
      events: [
        {
          eventId: crypto.randomUUID(),
          project: "spoofed-project",
          name: "storefront_item_viewed",
          version: 1,
          source: "browser",
          occurredAt: new Date().toISOString(),
          visitorId: "fixture-visitor",
          route: "/?item=private-item&utm_source=secret",
          properties: {
            category: "PRODUCT",
            email: "secret@example.com",
            action: "private-note",
          },
          ...event,
        },
      ],
    }),
  })
}

test("storefront forwarding requires every independent Production gate and its own credential", async () => {
  expect(storefrontCollectionEnabled(production)).toBe(true)
  for (const field of Object.keys(production)) {
    expect(storefrontCollectionEnabled({ ...production, [field]: "" })).toBe(
      false,
    )
  }
  let resolved = 0
  const handler = createStorefrontAnalyticsHandlers({
    environment: () => ({ ...production, APP_ENV: "local" }),
    resolveMerchant: async () => {
      resolved++
      return merchant
    },
    send: async () => {
      throw new Error("must not send")
    },
  })
  expect((await handler.POST(request())).status).toBe(204)
  expect(await (await handler.GET(request())).json()).toEqual({
    enabled: false,
  })
  expect(resolved).toBe(0)
})

test("verified merchant overrides client identity; custom origins stay exact and private input is removed", async () => {
  let sent: Record<string, unknown>[] = []
  const handler = (tenant = merchant) =>
    createStorefrontAnalyticsHandlers({
      environment: () => production,
      resolveMerchant: async () => tenant,
      send: async (url, init) => {
        expect(url).toBe("https://collector.example/v1/events")
        expect(new Headers(init.headers).get("x-logly-project-key")).toBe(
          "fixture-storefront-key",
        )
        expect(new Headers(init.headers).get("x-logly-origin")).toBe(
          "https://merchant.example",
        )
        sent = JSON.parse(String(init.body)).events
        return Response.json({ accepted: 1 })
      },
    })
  const spoofed = {
    actorId: "attacker",
    groups: {
      business: { key: "attacker", properties: { name: "Wrong shop" } },
    },
  }
  expect(
    (await handler().POST(request("https://merchant.example", spoofed))).status,
  ).toBe(200)
  const first = sent[0]
  expect(first).toMatchObject({
    project: "ewatrade-storefront",
    route: "/",
    properties: {
      surface: "storefront",
      audience: "anonymous",
      category: "PRODUCT",
    },
    groups: { business: { properties: { name: merchant.name } } },
  })
  expect(first?.visitorId).toMatch(/^vis_[a-f0-9]{64}$/)
  expect(JSON.stringify(sent)).not.toMatch(
    /private-tenant-id|private-item|secret|attacker|actorId/,
  )
  await handler({ ...merchant, name: "Renamed shop" }).POST(request())
  expect(sent[0]?.groups).toMatchObject({
    business: {
      key: (first?.groups as { business: { key: string } }).business.key,
    },
  })
  await handler({ ...merchant, tenantId: "another-private-tenant" }).POST(
    request(),
  )
  expect(sent[0]?.visitorId).not.toBe(first?.visitorId)
  expect(sent[0]?.groups).not.toEqual(first?.groups)
})

test("wrong origins, QA/unpublished merchants, privacy signals and private routes never forward", async () => {
  let sends = 0
  const handler = (allowed = true) =>
    createStorefrontAnalyticsHandlers({
      environment: () => production,
      resolveMerchant: async () => (allowed ? merchant : null),
      send: async () => {
        sends++
        return Response.json({})
      },
    })
  expect((await handler().POST(request("https://other.example"))).status).toBe(
    403,
  )
  expect((await handler(false).POST(request())).status).toBe(204)
  expect(await (await handler(false).GET(request())).json()).toEqual({
    enabled: false,
  })
  const privateRoute = request("https://merchant.example", {
    route: "/r/private-token",
    name: "page_view",
  })
  expect((await handler().POST(privateRoute)).status).toBe(202)
  const dnt = request()
  dnt.headers.set("dnt", "1")
  expect((await handler().POST(dnt)).status).toBe(204)
  const custom = request("https://merchant.example", {
    name: "arbitrary_event",
  })
  expect((await handler().POST(custom)).status).toBe(202)
  expect(sends).toBe(0)
})

test("storefront browser uses separate storage/project and drops denied queued work", async () => {
  const memory = new Map<string, string>()
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
  }
  const batches: unknown[] = []
  const client = createAttributedBrowserAnalytics({
    project: "ewatrade-storefront",
    storage,
    send: async (batch) => {
      batches.push(batch)
      throw new Error("offline")
    },
  })
  client.trackPageView("/about?secret=value", null)
  await client.flush()
  expect(JSON.stringify(batches)).toContain('"project":"ewatrade-storefront"')
  expect([...memory.keys()]).toEqual([
    "logly:ewatrade-storefront:attributed-visitor",
  ])
  expect(JSON.stringify(batches)).not.toContain("secret")
  client.setEnabled(false)
  const count = batches.length
  await client.flush()
  expect(batches).toHaveLength(count)
  expect(memory.size).toBe(0)
})
