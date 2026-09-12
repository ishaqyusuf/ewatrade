import { expect, test } from "bun:test"
import type { AnalyticsBatch } from "@ishaqyusuf/logly-core"
import { createNativeAnalytics } from "./native"

test("native queues failed delivery, removes private routes and rolls UTC visit days", async () => {
  const values = new Map<string, string>()
  const batches: AnalyticsBatch[] = []
  let fail = true
  let time = new Date("2026-09-07T23:59:00Z")
  const client = createNativeAnalytics({
    endpoint: "https://example.com",
    enabled: true,
    createId: () => crypto.randomUUID(),
    now: () => time,
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
      if (fail) throw new Error("offline")
      batches.push(batch)
    },
  })
  try {
    client.init()
    client.trackPageView({ route: "/members/private-id?email=secret" })
    await client.flush()
    expect(batches).toHaveLength(0)
    fail = false
    await client.flush()
    expect(batches[0]?.events.map((event) => event.name)).toEqual([
      "site_visit",
      "page_view",
    ])
    expect(
      batches[0]?.events.every(
        (event) =>
          event.route === "/members" && event.project === "ewatrade-mobile",
      ),
    ).toBe(true)
    client.trackPageView({ route: "/members/private-id" })
    await client.flush()
    expect(batches).toHaveLength(1)
    time = new Date("2026-09-08T00:01:00Z")
    client.trackPageView({ route: "/members/private-id" })
    await client.flush()
    expect(batches[1]?.events[0]?.visitKind).toBe("returning")
    expect(batches[1]?.events[0]?.visitorId).toBe(
      batches[0]?.events[0]?.visitorId,
    )
  } finally {
    client.destroy()
  }
})
test("storage failures and disabled tracking never send or throw", async () => {
  let sent = 0
  for (const enabled of [true, false]) {
    const client = createNativeAnalytics({
      endpoint: "https://example.com",
      enabled,
      createId: () => crypto.randomUUID(),
      storage: {
        getItem: () => {
          throw new Error("locked")
        },
        setItem: () => {},
        removeItem: () => {},
      },
      send: async () => {
        sent++
      },
    })
    expect(() => client.init()).not.toThrow()
    client.trackPageView({ route: "/" })
    await client.flush()
    client.destroy()
  }
  expect(sent).toBe(0)
})
