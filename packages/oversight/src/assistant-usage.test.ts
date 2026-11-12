import { afterEach, expect, test } from "bun:test"
import type { PrismaClient } from "@ewatrade/db"
import { shapeAssistantUsage } from "@ewatrade/db/oversight-assistant-usage"
import { assistantUsageResponse } from "./assistant-usage"
import { createOversightRoutes } from "./routes"

const originalKey = process.env.OVERSIGHT_READ_KEY
afterEach(() => {
  if (originalKey === undefined)
    Reflect.deleteProperty(process.env, "OVERSIGHT_READ_KEY")
  else process.env.OVERSIGHT_READ_KEY = originalKey
})

test("assistant usage sits behind the read key and validates the period first", async () => {
  process.env.OVERSIGHT_READ_KEY = "c".repeat(64)
  let initializations = 0
  const app = createOversightRoutes(() => {
    initializations += 1
    throw new Error("Private database connection details")
  })
  const headers = { Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}` }
  const rejected = await app.request(
    "/assistant-usage?start=2026-11-01&end=2026-11-07",
  )
  expect(rejected.status).toBe(401)
  expect(rejected.headers.get("Cache-Control")).toBe("no-store")
  for (const query of [
    "",
    "start=2026-11-01",
    "start=2026-11-07&end=2026-11-01",
    "start=2026-02-30&end=2026-03-01",
    "start=2026-01-01&end=2026-11-01",
    "start=2026-11-01&end=2026-11-07&channel=whatsapp",
    "start=2026-11-01T00:00:00Z&end=2026-11-07",
  ]) {
    const invalid = await app.request(`/assistant-usage?${query}`, { headers })
    expect(invalid.status).toBe(400)
  }
  expect(initializations).toBe(0)
  // The service's error handler turns this into a sanitized 503.
  const failed = await app.request(
    "/assistant-usage?start=2026-11-01&end=2026-11-07",
    { headers },
  )
  expect(failed.status).toBe(500)
  expect(await failed.text()).not.toContain("Private database")
  expect(initializations).toBe(1)
})

test("a ledger read returns the strict contract", async () => {
  process.env.OVERSIGHT_READ_KEY = "d".repeat(64)
  const db = {
    $queryRaw: async () => [],
  } as unknown as PrismaClient
  const app = createOversightRoutes(() => db)
  const response = await app.request(
    "/assistant-usage?start=2026-10-31&end=2026-11-01",
    { headers: { Authorization: `Bearer ${process.env.OVERSIGHT_READ_KEY}` } },
  )
  expect(response.status).toBe(200)
  const body = assistantUsageResponse.parse(await response.json())
  expect(body.period).toEqual({
    start: "2026-10-31",
    end: "2026-11-01",
    timezone: "UTC",
  })
  expect(body.runs).toHaveLength(6)
})

test("the contract accepts populated shaping output and rejects drift", () => {
  const shaped = shapeAssistantUsage(
    {
      runs: [
        { day: "2026-11-01", channel: "in_app", status: "COMPLETED", runs: 2n },
      ],
      runActors: [{ day: null, channel: null, tenants: 1n, users: 1n }],
      tokens: [
        {
          day: "2026-11-01",
          channel: "in_app",
          requestClass: "chat",
          provider: "openai",
          model: "gpt",
          events: 2n,
          failedEvents: 0n,
          eventsWithoutTokens: 0n,
          inputTokens: 10n,
          cachedInputTokens: 0n,
          outputTokens: 5n,
          totalTokens: 15n,
        },
      ],
      whatsappOutbox: [
        { day: "2026-11-01", state: "READ", messages: 1n, untenanted: 0n },
      ],
      whatsappAttempts: [],
      whatsappReceipts: [],
      telegramOutbox: [],
    },
    { start: "2026-11-01", end: "2026-11-01" },
    new Date("2026-11-12T00:00:00Z"),
  )
  expect(assistantUsageResponse.safeParse(shaped).success).toBe(true)
  expect(
    assistantUsageResponse.safeParse({ ...shaped, extra: true }).success,
  ).toBe(false)
  expect(
    assistantUsageResponse.safeParse({
      ...shaped,
      tokens: [{ ...shaped.tokens[0], totalTokens: -1 }],
    }).success,
  ).toBe(false)
})
