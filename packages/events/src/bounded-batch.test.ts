import { expect, test } from "bun:test"
import { boundedBatch } from "./bounded-batch"
import { createAttributedBrowserAnalytics } from "./browser-attribution"
import { createNativeAnalytics } from "./native"

const envelope = {
  sentAt: new Date().toISOString(),
  sdk: { name: "@ishaqyusuf/logly-core" as const, version: "0.3.0" },
}
test("byte packing counts envelope/UTF-8 and skips poison oversized head", () => {
  const queue = Array.from({ length: 25 }, (_, index) => ({
    eventId: String(index),
    value: "漢".repeat(1000),
  }))
  const { batch, dropped } = boundedBatch(
    [{ eventId: "oversized", value: "漢".repeat(20000) }, ...queue],
    envelope,
  )
  expect(dropped.has("oversized")).toBe(true)
  expect(batch.events.length).toBeGreaterThan(0)
  expect(batch.events.length).toBeLessThan(25)
  expect(
    new TextEncoder().encode(JSON.stringify(batch)).byteLength,
  ).toBeLessThanOrEqual(48 * 1024)
})
test("browser and native split and drain large signed custom-event queues without retagging", async () => {
  for (const native of [false, true]) {
    let fail = true
    const delivered: Array<{
      eventId: string
      name: string
      properties: unknown
      analyticsContext?: string
    }> = []
    const send = async (batch: { events: typeof delivered }) => {
      expect(
        new TextEncoder().encode(JSON.stringify(batch)).byteLength,
      ).toBeLessThanOrEqual(48 * 1024)
      if (fail) throw new Error("offline")
      delivered.push(...batch.events)
    }
    const context = {
      token: "x".repeat(2048),
      identityKey: "same-identity",
      expiresAt: Date.now() + 60000,
    }
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
    const browserClient = native
      ? null
      : createAttributedBrowserAnalytics({ storage, send })
    const nativeClient = native
      ? createNativeAnalytics({
          endpoint: "https://example.test",
          enabled: true,
          storage,
          createId: () => crypto.randomUUID(),
          send,
        })
      : null
    nativeClient?.init()
    nativeClient?.setContext(context)
    const client = browserClient ?? nativeClient
    if (!client) throw new Error("Expected adapter")
    try {
      for (let index = 0; index < 30; index++) {
        const properties = {
          action: "漢".repeat(128),
          channel: "漢".repeat(128),
          category: "漢".repeat(128),
          status: "漢".repeat(128),
          surface: "漢".repeat(128),
          item_count: index,
        }
        browserClient?.track("order_started", properties, context, "/orders")
        nativeClient?.track("order_started", properties, "/orders")
      }
      await client.flush()
      nativeClient?.setContext({ ...context, token: "refreshed-proof" })
      fail = false
      for (let attempt = 0; attempt < 10; attempt++) await client.flush()
      const custom = delivered.filter((event) => event.name === "order_started")
      expect(custom).toHaveLength(30)
      expect(new Set(custom.map((event) => event.eventId)).size).toBe(30)
      expect(
        custom.every((event) => event.analyticsContext === context.token),
      ).toBe(true)
      expect(custom[29]?.properties).toHaveProperty("item_count", 29)
    } finally {
      client.destroy()
    }
  }
})
