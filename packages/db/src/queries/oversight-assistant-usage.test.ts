import { describe, expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  type AssistantUsageRows,
  assistantUsageDays,
  oversightAssistantUsage,
  shapeAssistantUsage,
} from "./oversight-assistant-usage"
import type { DbClient } from "./types"

const period = { start: "2026-11-01", end: "2026-11-03" }
const now = new Date("2026-11-12T10:00:00Z")
const empty: AssistantUsageRows = {
  runs: [],
  runActors: [],
  tokens: [],
  whatsappOutbox: [],
  whatsappAttempts: [],
  whatsappReceipts: [],
  telegramOutbox: [],
}

describe("assistant usage shaping", () => {
  test("inclusive UTC days across a month boundary", () => {
    expect(
      assistantUsageDays({ start: "2026-10-30", end: "2026-11-02" }),
    ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"])
  })

  test("an empty ledger is a dense zero series, every channel present", () => {
    const usage = shapeAssistantUsage(empty, period, now)
    expect(usage.runs).toHaveLength(9)
    expect(usage.runs.every((r) => r.total === 0)).toBe(true)
    expect(usage.runDays.map((d) => d.date)).toEqual(assistantUsageDays(period))
    expect(usage.runTotals.map((t) => t.channel)).toEqual([
      "whatsapp",
      "telegram",
      "in_app",
      "all",
    ])
    expect(usage.whatsapp).toHaveLength(3)
    expect(usage.telegram).toHaveLength(3)
    expect(usage.tokens).toEqual([])
    expect(usage.attribution.inApp).toBe("web_and_mobile_combined")
    expect(usage.asOf).toBe(now.toISOString())
  })

  test("runs roll up by status, channel and day; distinct actors come from SQL", () => {
    const usage = shapeAssistantUsage(
      {
        ...empty,
        runs: [
          {
            day: "2026-11-01",
            channel: "whatsapp",
            status: "COMPLETED",
            runs: 3n,
          },
          {
            day: "2026-11-01",
            channel: "whatsapp",
            status: "FAILED",
            runs: 1n,
          },
          { day: "2026-11-01", channel: "in_app", status: "RUNNING", runs: 2n },
          {
            day: "2026-11-02",
            channel: "telegram",
            status: "COMPLETED",
            runs: 4n,
          },
          // Outside the period: ignored rather than mis-bucketed.
          {
            day: "2026-11-09",
            channel: "in_app",
            status: "COMPLETED",
            runs: 99n,
          },
        ],
        runActors: [
          { day: "2026-11-01", channel: "whatsapp", tenants: 2n, users: 3n },
          { day: "2026-11-01", channel: null, tenants: 3n, users: 4n },
          { day: null, channel: "whatsapp", tenants: 2n, users: 3n },
          { day: null, channel: null, tenants: 4n, users: 6n },
        ],
      },
      period,
      now,
    )
    const cell = (date: string, channel: string) =>
      usage.runs.find((r) => r.date === date && r.channel === channel)
    expect(cell("2026-11-01", "whatsapp")).toEqual({
      date: "2026-11-01",
      channel: "whatsapp",
      running: 0,
      completed: 3,
      failed: 1,
      total: 4,
      activeTenants: 2,
      activeUsers: 3,
    })
    expect(cell("2026-11-01", "in_app")?.running).toBe(2)
    expect(cell("2026-11-02", "telegram")?.completed).toBe(4)
    expect(usage.runDays[0]).toMatchObject({
      total: 6,
      activeTenants: 3,
      activeUsers: 4,
    })
    const all = usage.runTotals.find((t) => t.channel === "all")
    expect(all).toMatchObject({
      running: 2,
      completed: 7,
      failed: 1,
      total: 10,
      activeTenants: 4,
      activeUsers: 6,
    })
  })

  test("outbound, attempts and receipts keep their own states", () => {
    const usage = shapeAssistantUsage(
      {
        ...empty,
        whatsappOutbox: [
          {
            day: "2026-11-02",
            state: "DELIVERED",
            messages: 5n,
            untenanted: 0n,
          },
          { day: "2026-11-02", state: "SENT", messages: 2n, untenanted: 1n },
        ],
        whatsappAttempts: [
          { day: "2026-11-02", state: "ACCEPTED", attempts: 7n },
          { day: "2026-11-02", state: "REJECTED", attempts: 1n },
        ],
        whatsappReceipts: [
          { day: "2026-11-02", status: "delivered", receipts: 5n },
          { day: "2026-11-02", status: "deleted", receipts: 1n },
        ],
        telegramOutbox: [{ day: "2026-11-03", state: "SENT", messages: 4n }],
      },
      period,
      now,
    )
    const day = usage.whatsapp[1]
    expect(day?.outbound).toMatchObject({
      total: 7,
      delivered: 5,
      sent: 2,
      untenanted: 1,
    })
    expect(day?.deliveryAttempts).toMatchObject({
      total: 8,
      accepted: 7,
      rejected: 1,
    })
    expect(day?.receipts).toMatchObject({ total: 6, delivered: 5, other: 1 })
    expect(usage.telegram[2]?.outbound).toMatchObject({ total: 4, sent: 4 })
  })

  test("token rows convert BigInt sums and sort deterministically", () => {
    const row = {
      requestClass: "chat",
      provider: "openai",
      model: "m",
      events: 2n,
      failedEvents: 1n,
      eventsWithoutTokens: 0n,
      inputTokens: 100n,
      cachedInputTokens: 10n,
      outputTokens: 50n,
      totalTokens: 150n,
    }
    const usage = shapeAssistantUsage(
      {
        ...empty,
        tokens: [
          { ...row, day: "2026-11-02", channel: "whatsapp" },
          {
            ...row,
            day: "2026-11-01",
            channel: "unattributed",
            requestClass: "transcribe",
          },
        ],
      },
      period,
      now,
    )
    expect(usage.tokens.map((t) => [t.date, t.channel])).toEqual([
      ["2026-11-01", "unattributed"],
      ["2026-11-02", "whatsapp"],
    ])
    expect(usage.tokens[1]?.totalTokens).toBe(150)
  })
})

describe("assistant usage queries", () => {
  test("every statement is a read that only counts LIVE businesses", async () => {
    const statements: Prisma.Sql[] = []
    const db = {
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: Prisma.Sql[]
      ) => {
        statements.push(Prisma.sql(strings, ...values))
        return []
      },
    } as unknown as DbClient
    const usage = await oversightAssistantUsage(db, period, now)
    expect(usage.runs).toHaveLength(9)
    expect(statements).toHaveLength(7)
    for (const sql of statements) {
      expect(sql.sql.trim()).toMatch(/^(SELECT|WITH)\b/)
      expect(sql.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|GRANT|ALTER)\b/)
      expect(sql.sql).toContain(`"dataClassification" = 'LIVE'`)
      // Period bounds are bound parameters, never interpolated text.
      expect(sql.values).toContain("2026-11-01")
      expect(sql.values).toContain("2026-11-03")
    }
  })

  test("rejects periods outside the supported range before any query", async () => {
    const db = {
      $queryRaw: () => {
        throw new Error("must not query")
      },
    } as unknown as DbClient
    await expect(
      oversightAssistantUsage(db, { start: "2026-01-01", end: "2026-11-01" }),
    ).rejects.toThrow("out of range")
    await expect(
      oversightAssistantUsage(db, { start: "2026-11-02", end: "2026-11-01" }),
    ).rejects.toThrow("out of range")
  })
})
