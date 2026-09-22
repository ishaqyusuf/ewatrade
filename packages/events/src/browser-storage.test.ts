import { expect, test } from "bun:test"
import { type AnalyticsBatch, createAnalytics } from "@ishaqyusuf/logly-core"
import { createBrowserStorage } from "./browser-storage"

test("blocked browser storage cannot interrupt disabled or enabled product startup", () => {
  const storage = createBrowserStorage(() => {
    throw new Error("SecurityError")
  })
  for (const disabled of [true, false]) {
    const client = createAnalytics({
      project: "ewatrade-dashboard",
      disabled,
      storage,
    })
    expect(() => client.init()).not.toThrow()
    expect(() => client.destroy()).not.toThrow()
  }
  expect(storage.getItem("visitor")).toBeNull()
})
test("quota and denied removal are nonblocking", () => {
  const storage = createBrowserStorage(() => ({
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError")
    },
    removeItem: () => {
      throw new Error("SecurityError")
    },
  }))
  expect(() => storage.setItem("visitor", "value")).not.toThrow()
  expect(() => storage.removeItem("visitor")).not.toThrow()
  const client = createAnalytics({ project: "ewatrade-marketing", storage })
  expect(() => client.init()).not.toThrow()
  client.destroy()
})

test("failed removal and replacement keep the new in-memory value authoritative", () => {
  const storage = createBrowserStorage(() => ({
    getItem: () => "stale-persisted-visitor",
    setItem: () => {
      throw new Error("QuotaExceededError")
    },
    removeItem: () => {
      throw new Error("SecurityError")
    },
  }))
  expect(storage.getItem("visitor")).toBe("stale-persisted-visitor")
  storage.removeItem("visitor")
  expect(storage.getItem("visitor")).toBeNull()
  storage.setItem("visitor", "new-session-visitor")
  expect(storage.getItem("visitor")).toBe("new-session-visitor")
})

for (const [name, getStorage] of [
  [
    "blocked storage",
    () => {
      throw new Error("SecurityError")
    },
  ],
  [
    "failed persistent writes",
    () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
      removeItem: () => {},
    }),
  ],
] as const) {
  test(`${name} retains one visitor identity for the session`, async () => {
    const batches: AnalyticsBatch[] = []
    let id = 0
    const storage = createBrowserStorage(getStorage)
    const client = createAnalytics({
      createId: () => `id-${++id}`,
      flushAt: 1,
      project: "ewatrade-dashboard",
      storage,
      transport: async (batch) => {
        batches.push(batch)
      },
    })
    client.init()
    await client.flush()
    client.trackPageView({ route: "/orders" })
    await client.flush()
    client.trackPageView({ route: "/customers" })
    await client.flush()
    const events = batches.flatMap((batch) => batch.events)
    expect(events.every((event) => typeof event.visitorId === "string")).toBe(
      true,
    )
    expect(new Set(events.map((event) => event.visitorId)).size).toBe(1)
    client.reset()
    expect(storage.getItem("logly:ewatrade-dashboard:visitor")).toBeNull()
    client.destroy()
  })
}
