import { expect, test } from "bun:test"
import { createNativeAnalytics } from "./native"
import { type NativeBatch, nativeBatchSchema } from "./native-contract"

test("native queues failed delivery, removes private routes and rolls UTC visit days", async () => {
  const values = new Map<string, string>()
  const batches: NativeBatch[] = []
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
    expect(nativeBatchSchema.safeParse(batches[0]).success).toBe(true)
    expect(batches[0]?.events[0]).toMatchObject({
      source: "mobile",
      platform: "android",
    })
    expect(batches[0]?.events.map((event) => event.name)).toEqual([
      "app_session",
      "screen_view",
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

test("native captures proof immutably, drops old-account queue and stops capture after expiry", async () => {
  const batches: NativeBatch[] = []
  let time = 1000
  let fail = true
  const client = createNativeAnalytics({
    endpoint: "https://example.com",
    enabled: true,
    createId: () => crypto.randomUUID(),
    now: () => new Date(time),
    storage: undefined,
    send: async (batch) => {
      batches.push(structuredClone(batch))
      if (fail) throw new Error("offline")
    },
  })
  try {
    client.init()
    const context = {
      identityKey: "first",
      token: "proof-one",
      expiresAt: 3000,
    }
    client.setContext(context)
    client.trackPageView({ route: "/orders" })
    await client.flush()
    context.token = "changed"
    await client.flush()
    expect(batches[1]?.events[0]?.analyticsContext).toBe("proof-one")
    client.setContext({
      identityKey: "second",
      token: "proof-two",
      expiresAt: 3000,
    })
    fail = false
    client.trackPageView({ route: "/orders" })
    await client.flush()
    expect(
      batches[2]?.events.every(
        (event) => event.analyticsContext === "proof-two",
      ),
    ).toBe(true)
    time = 4000
    client.trackPageView({ route: "/inventory" })
    await client.flush()
    expect(batches).toHaveLength(3)
  } finally {
    client.destroy()
  }
})

test("native relaunch preserves same-account visitor and rotates for different persisted owner", async () => {
  const values = new Map<string, string>()
  const batches: NativeBatch[] = []
  const create = () =>
    createNativeAnalytics({
      endpoint: "https://example.com",
      enabled: true,
      createId: () => crypto.randomUUID(),
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
        batches.push(batch)
      },
    })
  const context = {
    token: "proof",
    identityKey: "account-one",
    expiresAt: Date.now() + 60000,
  }
  for (const identityKey of ["account-one", "account-one", "account-two"]) {
    const client = create()
    try {
      client.init()
      client.setContext({ ...context, identityKey })
      client.trackPageView({ route: "/orders" })
      await client.flush()
    } finally {
      client.destroy()
    }
  }
  expect(batches[1]?.events[0]?.visitorId).toBe(
    batches[0]?.events[0]?.visitorId,
  )
  expect(batches[1]?.events.map((event) => event.name)).toEqual(["screen_view"])
  expect(batches[2]?.events[0]?.visitorId).not.toBe(
    batches[0]?.events[0]?.visitorId,
  )
})
