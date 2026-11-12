import type { PrismaClient } from "@ewatrade/db"
import {
  ASSISTANT_USAGE_MAX_DAYS,
  assistantUsageDays,
  oversightAssistantUsage,
} from "@ewatrade/db/oversight-assistant-usage"
import { Hono } from "hono"
import { z } from "zod"

// Ledger-backed assistant usage (billing-grade counts) for Oversight. Mounted
// behind the Oversight read-key middleware; read-only SELECTs, UTC periods.
// Behaviour metrics (adoption, latency, web vs mobile) come from Logly instead.

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const at = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(value)
  })

export const assistantUsageQuery = z
  .object({ start: isoDay, end: isoDay })
  .strict()
  .refine((p) => p.start <= p.end, "start must not be after end")
  .refine(
    (p) => assistantUsageDays(p).length <= ASSISTANT_USAGE_MAX_DAYS,
    `period must be at most ${ASSISTANT_USAGE_MAX_DAYS} days`,
  )

const count = z.number().int().min(0)
const channel = z.enum(["whatsapp", "telegram", "in_app"])
const runCounts = {
  running: count,
  completed: count,
  failed: count,
  total: count,
  activeTenants: count,
  activeUsers: count,
}

/** Strict response contract; mirrored in Oversight packages/ops-contracts. */
export const assistantUsageResponse = z
  .object({
    version: z.literal(1),
    projectId: z.literal("ewatrade"),
    source: z.literal("ewatrade_ledger"),
    asOf: z.string().datetime(),
    period: z
      .object({ start: isoDay, end: isoDay, timezone: z.literal("UTC") })
      .strict(),
    attribution: z
      .object({
        channels: z.array(channel),
        inApp: z.literal("web_and_mobile_combined"),
        unattributedTokens: z.literal("usage_without_chat_run"),
        untenantedWhatsApp: z.literal("replies_before_business_selection"),
      })
      .strict(),
    runs: z.array(z.object({ date: isoDay, channel, ...runCounts }).strict()),
    runDays: z.array(z.object({ date: isoDay, ...runCounts }).strict()),
    runTotals: z.array(
      z
        .object({
          channel: z.enum(["whatsapp", "telegram", "in_app", "all"]),
          ...runCounts,
        })
        .strict(),
    ),
    tokens: z.array(
      z
        .object({
          date: isoDay,
          channel: z.enum(["whatsapp", "telegram", "in_app", "unattributed"]),
          requestClass: z.string().max(64),
          provider: z.string().max(128),
          model: z.string().max(256),
          events: count,
          failedEvents: count,
          eventsWithoutTokens: count,
          inputTokens: count,
          cachedInputTokens: count,
          outputTokens: count,
          totalTokens: count,
        })
        .strict(),
    ),
    whatsapp: z.array(
      z
        .object({
          date: isoDay,
          outbound: z
            .object({
              total: count,
              untenanted: count,
              pending: count,
              sending: count,
              sent: count,
              delivered: count,
              read: count,
              failed: count,
              unknown: count,
              cancelled: count,
              expired: count,
            })
            .strict(),
          deliveryAttempts: z
            .object({
              total: count,
              started: count,
              accepted: count,
              rejected: count,
              unknown: count,
            })
            .strict(),
          receipts: z
            .object({
              total: count,
              sent: count,
              delivered: count,
              read: count,
              failed: count,
              other: count,
            })
            .strict(),
        })
        .strict(),
    ),
    telegram: z.array(
      z
        .object({
          date: isoDay,
          outbound: z
            .object({
              total: count,
              pending: count,
              sending: count,
              sent: count,
              failed: count,
              unknown: count,
              cancelled: count,
              expired: count,
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict()

export type AssistantUsageResponse = z.infer<typeof assistantUsageResponse>

export function createAssistantUsageOversightRoutes(getDb: () => PrismaClient) {
  const routes = new Hono()
  routes.get("/", async (c) => {
    const parsed = assistantUsageQuery.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: "Invalid period" }, 400)
    // Parse the outgoing body too: a shape drift fails closed (503) rather
    // than sending Oversight data it cannot trust.
    return c.json(
      assistantUsageResponse.parse(
        await oversightAssistantUsage(getDb(), parsed.data),
      ),
    )
  })
  return routes
}
