import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

// Ledger-backed assistant usage for Oversight (billing-grade counts).
// Read-only SELECTs over the assistant ledger tables, bounded by a UTC date
// period of at most ASSISTANT_USAGE_MAX_DAYS days. Only LIVE, non-purging
// businesses count, exactly like the other Oversight summaries.
//
// Channel attribution: an AssistantRun is "whatsapp" when a WhatsApp inbox row
// carries its runId or its requestId (channel turns reuse the inbox requestId,
// which also covers runs still RUNNING before the inbox settles), "telegram"
// likewise, otherwise "in_app". The ledger cannot tell the web dashboard from
// the mobile app: "in_app" is both. Behaviour analytics (Logly) splits them.
//
// WhatsApp usage buckets expire and are deleted, so outbound counts read the
// outbox, delivery attempts and receipts instead.

export const ASSISTANT_USAGE_MAX_DAYS = 92
export const ASSISTANT_RUN_CHANNELS = [
  "whatsapp",
  "telegram",
  "in_app",
] as const
export type AssistantRunChannel = (typeof ASSISTANT_RUN_CHANNELS)[number]

const WHATSAPP_OUTBOX_STATES = [
  "PENDING",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
  "EXPIRED",
] as const
const WHATSAPP_ATTEMPT_STATES = [
  "STARTED",
  "ACCEPTED",
  "REJECTED",
  "UNKNOWN",
] as const
const WHATSAPP_RECEIPT_STATUSES = [
  "sent",
  "delivered",
  "read",
  "failed",
] as const
const TELEGRAM_OUTBOX_STATES = [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
  "EXPIRED",
] as const

const DAY_MS = 86_400_000
const liveTenant = Prisma.sql`t."dataClassification" = 'LIVE' AND t."qaPurgeStartedAt" IS NULL`

export type AssistantUsagePeriod = { start: string; end: string }

export type AssistantUsageRows = {
  runs: {
    day: string
    channel: string
    status: string
    runs: bigint | number
  }[]
  runActors: {
    day: string | null
    channel: string | null
    tenants: bigint | number
    users: bigint | number
  }[]
  tokens: {
    day: string
    channel: string
    requestClass: string
    provider: string
    model: string
    events: bigint | number
    failedEvents: bigint | number
    eventsWithoutTokens: bigint | number
    inputTokens: bigint | number
    cachedInputTokens: bigint | number
    outputTokens: bigint | number
    totalTokens: bigint | number
  }[]
  whatsappOutbox: {
    day: string
    state: string
    messages: bigint | number
    untenanted: bigint | number
  }[]
  whatsappAttempts: { day: string; state: string; attempts: bigint | number }[]
  whatsappReceipts: { day: string; status: string; receipts: bigint | number }[]
  telegramOutbox: { day: string; state: string; messages: bigint | number }[]
}

/** Inclusive UTC calendar days of the period. */
export function assistantUsageDays(period: AssistantUsagePeriod) {
  const start = Date.parse(`${period.start}T00:00:00Z`)
  const end = Date.parse(`${period.end}T00:00:00Z`)
  const days: string[] = []
  for (let at = start; at <= end; at += DAY_MS)
    days.push(new Date(at).toISOString().slice(0, 10))
  return days
}

export async function oversightAssistantUsage(
  db: DbClient,
  period: AssistantUsagePeriod,
  now = new Date(),
) {
  const days = assistantUsageDays(period)
  if (!days.length || days.length > ASSISTANT_USAGE_MAX_DAYS)
    throw new Error("Assistant usage period is out of range")
  const rows = await readAssistantUsageRows(db, period)
  return shapeAssistantUsage(rows, period, now)
}

async function readAssistantUsageRows(
  db: DbClient,
  period: AssistantUsagePeriod,
): Promise<AssistantUsageRows> {
  // TIMESTAMP(3) columns hold UTC wall time, so date bounds and ::date need no
  // time-zone conversion (and never depend on the session time zone).
  const from = Prisma.sql`${period.start}::date`
  const until = Prisma.sql`(${period.end}::date + 1)`
  const runChannel = Prisma.sql`
    CASE
      WHEN EXISTS (SELECT 1 FROM "AssistantWhatsAppInbox" w WHERE w."runId" = r."id")
        OR EXISTS (
          SELECT 1 FROM "AssistantWhatsAppInbox" w
            JOIN "AssistantWhatsAppBinding" b ON b."id" = w."bindingId"
           WHERE w."requestId" = r."requestId" AND b."conversationId" = r."conversationId")
        THEN 'whatsapp'
      WHEN EXISTS (SELECT 1 FROM "AssistantTelegramInbox" g WHERE g."runId" = r."id")
        OR EXISTS (
          SELECT 1 FROM "AssistantTelegramInbox" g
            JOIN "AssistantTelegramBinding" b ON b."id" = g."bindingId"
           WHERE g."requestId" = r."requestId" AND b."conversationId" = r."conversationId")
        THEN 'telegram'
      ELSE 'in_app'
    END`
  const periodRuns = Prisma.sql`
    SELECT r."id", r."status"::text AS "status", r."actorUserId", c."tenantId",
           r."startedAt"::date AS "day", ${runChannel} AS "channel"
      FROM "AssistantRun" r
      JOIN "AssistantConversation" c ON c."id" = r."conversationId"
      JOIN "Tenant" t ON t."id" = c."tenantId"
     WHERE r."startedAt" >= ${from} AND r."startedAt" < ${until} AND ${liveTenant}`
  // WhatsApp replies reach a tenant through the inbox binding's conversation,
  // or the run's conversation. Control replies before a business is selected
  // have neither: they are kept and reported as untenanted, never as QA.
  const whatsappOutboxScope = Prisma.sql`
      FROM "AssistantWhatsAppOutbox" o
      JOIN "AssistantWhatsAppInbox" i ON i."id" = o."inboxId"
      LEFT JOIN "AssistantWhatsAppBinding" b ON b."id" = i."bindingId"
      LEFT JOIN "AssistantRun" r ON r."id" = o."runId"
      LEFT JOIN "AssistantConversation" c
        ON c."id" = COALESCE(b."conversationId", r."conversationId")
      LEFT JOIN "Tenant" t ON t."id" = c."tenantId"`
  const whatsappOutboxLive = Prisma.sql`(c."id" IS NULL OR (${liveTenant}))`

  const [
    runs,
    runActors,
    tokens,
    whatsappOutbox,
    whatsappAttempts,
    whatsappReceipts,
    telegramOutbox,
  ] = await Promise.all([
    db.$queryRaw<AssistantUsageRows["runs"]>`
      WITH p AS (${periodRuns})
      SELECT to_char(p."day", 'YYYY-MM-DD') AS "day", p."channel", p."status",
             count(*) AS "runs"
        FROM p GROUP BY 1, 2, 3`,
    // Distinct businesses and users per day and channel, per day overall,
    // per channel over the period and over the whole period (null = rollup).
    db.$queryRaw<AssistantUsageRows["runActors"]>`
      WITH p AS (${periodRuns})
      SELECT to_char(p."day", 'YYYY-MM-DD') AS "day", p."channel",
             count(DISTINCT p."tenantId") AS "tenants",
             count(DISTINCT p."actorUserId") AS "users"
        FROM p GROUP BY GROUPING SETS ((p."day", p."channel"), (p."day"), (p."channel"), ())`,
    db.$queryRaw<AssistantUsageRows["tokens"]>`
      SELECT to_char(e."createdAt"::date, 'YYYY-MM-DD') AS "day",
             CASE WHEN e."runId" IS NULL THEN 'unattributed' ELSE (
               SELECT ${runChannel} FROM "AssistantRun" r WHERE r."id" = e."runId"
             ) END AS "channel",
             e."requestClass", e."provider", e."model",
             count(*) AS "events",
             count(*) FILTER (WHERE e."outcome" = 'failed') AS "failedEvents",
             count(*) FILTER (WHERE e."totalTokens" IS NULL) AS "eventsWithoutTokens",
             COALESCE(sum(e."inputTokens"), 0) AS "inputTokens",
             COALESCE(sum(e."cachedInputTokens"), 0) AS "cachedInputTokens",
             COALESCE(sum(e."outputTokens"), 0) AS "outputTokens",
             COALESCE(sum(e."totalTokens"), 0) AS "totalTokens"
        FROM "AssistantUsageEvent" e
        JOIN "Tenant" t ON t."id" = e."tenantId"
       WHERE e."createdAt" >= ${from} AND e."createdAt" < ${until} AND ${liveTenant}
       GROUP BY 1, 2, 3, 4, 5`,
    db.$queryRaw<AssistantUsageRows["whatsappOutbox"]>`
      SELECT to_char(o."createdAt"::date, 'YYYY-MM-DD') AS "day",
             o."state"::text AS "state", count(*) AS "messages",
             count(*) FILTER (WHERE c."id" IS NULL) AS "untenanted"
        ${whatsappOutboxScope}
       WHERE o."createdAt" >= ${from} AND o."createdAt" < ${until} AND ${whatsappOutboxLive}
       GROUP BY 1, 2`,
    db.$queryRaw<AssistantUsageRows["whatsappAttempts"]>`
      SELECT to_char(a."startedAt"::date, 'YYYY-MM-DD') AS "day",
             a."state"::text AS "state", count(*) AS "attempts"
        FROM "AssistantWhatsAppAttempt" a
        JOIN LATERAL (SELECT c."id" AS "conversationId", t."dataClassification", t."qaPurgeStartedAt"
                        ${whatsappOutboxScope} WHERE o."id" = a."outboxId") s ON true
       WHERE a."startedAt" >= ${from} AND a."startedAt" < ${until}
         AND (s."conversationId" IS NULL OR (s."dataClassification" = 'LIVE' AND s."qaPurgeStartedAt" IS NULL))
       GROUP BY 1, 2`,
    db.$queryRaw<AssistantUsageRows["whatsappReceipts"]>`
      SELECT to_char(x."providerOccurredAt"::date, 'YYYY-MM-DD') AS "day",
             lower(x."status") AS "status", count(*) AS "receipts"
        FROM "AssistantWhatsAppReceipt" x
        JOIN "AssistantWhatsAppAttempt" a ON a."id" = x."attemptId"
        JOIN LATERAL (SELECT c."id" AS "conversationId", t."dataClassification", t."qaPurgeStartedAt"
                        ${whatsappOutboxScope} WHERE o."id" = a."outboxId") s ON true
       WHERE x."providerOccurredAt" >= ${from} AND x."providerOccurredAt" < ${until}
         AND (s."conversationId" IS NULL OR (s."dataClassification" = 'LIVE' AND s."qaPurgeStartedAt" IS NULL))
       GROUP BY 1, 2`,
    db.$queryRaw<AssistantUsageRows["telegramOutbox"]>`
      SELECT to_char(o."createdAt"::date, 'YYYY-MM-DD') AS "day",
             o."state"::text AS "state", count(*) AS "messages"
        FROM "AssistantTelegramOutbox" o
        JOIN "AssistantTelegramInbox" i ON i."id" = o."inboxId"
        JOIN "AssistantTelegramBinding" b ON b."id" = i."bindingId"
        JOIN "AssistantConversation" c ON c."id" = b."conversationId"
        JOIN "Tenant" t ON t."id" = c."tenantId"
       WHERE o."createdAt" >= ${from} AND o."createdAt" < ${until} AND ${liveTenant}
       GROUP BY 1, 2`,
  ])
  return {
    runs,
    runActors,
    tokens,
    whatsappOutbox,
    whatsappAttempts,
    whatsappReceipts,
    telegramOutbox,
  }
}

function num(value: bigint | number | null | undefined) {
  return value == null ? 0 : Number(value)
}

function counts<K extends string>(keys: readonly K[]) {
  return Object.fromEntries(keys.map((k) => [k.toLowerCase(), 0])) as Record<
    Lowercase<K>,
    number
  >
}

/** Pure: dense UTC day series, zero only where the ledger recorded nothing. */
export function shapeAssistantUsage(
  rows: AssistantUsageRows,
  period: AssistantUsagePeriod,
  now: Date,
) {
  const days = assistantUsageDays(period)
  const inPeriod = new Set(days)
  const emptyRuns = () => ({
    running: 0,
    completed: 0,
    failed: 0,
    total: 0,
    activeTenants: 0,
    activeUsers: 0,
  })
  const runKey = (day: string | null, channel: string | null) =>
    `${day ?? "*"}|${channel ?? "*"}`
  const runCells = new Map<string, ReturnType<typeof emptyRuns>>()
  const runCell = (day: string | null, channel: string | null) => {
    const key = runKey(day, channel)
    const existing = runCells.get(key)
    if (existing) return existing
    const cell = emptyRuns()
    runCells.set(key, cell)
    return cell
  }
  for (const row of rows.runs) {
    if (!inPeriod.has(row.day)) continue
    const status = row.status.toLowerCase()
    const n = num(row.runs)
    for (const cell of [
      runCell(row.day, row.channel),
      runCell(row.day, null),
      runCell(null, row.channel),
      runCell(null, null),
    ]) {
      if (status === "running" || status === "completed" || status === "failed")
        cell[status] += n
      cell.total += n
    }
  }
  for (const row of rows.runActors) {
    if (row.day !== null && !inPeriod.has(row.day)) continue
    const cell = runCell(row.day, row.channel)
    cell.activeTenants = num(row.tenants)
    cell.activeUsers = num(row.users)
  }

  const whatsapp = new Map(
    days.map((date) => [
      date,
      {
        date,
        outbound: {
          total: 0,
          untenanted: 0,
          ...counts(WHATSAPP_OUTBOX_STATES),
        },
        deliveryAttempts: { total: 0, ...counts(WHATSAPP_ATTEMPT_STATES) },
        receipts: { total: 0, other: 0, ...counts(WHATSAPP_RECEIPT_STATUSES) },
      },
    ]),
  )
  for (const row of rows.whatsappOutbox) {
    const cell = whatsapp.get(row.day)?.outbound
    if (!cell) continue
    const n = num(row.messages)
    const state = row.state.toLowerCase() as keyof typeof cell
    if (state in cell && state !== "total" && state !== "untenanted")
      cell[state] += n
    cell.total += n
    cell.untenanted += num(row.untenanted)
  }
  for (const row of rows.whatsappAttempts) {
    const cell = whatsapp.get(row.day)?.deliveryAttempts
    if (!cell) continue
    const n = num(row.attempts)
    const state = row.state.toLowerCase() as keyof typeof cell
    if (state in cell && state !== "total") cell[state] += n
    cell.total += n
  }
  for (const row of rows.whatsappReceipts) {
    const cell = whatsapp.get(row.day)?.receipts
    if (!cell) continue
    const n = num(row.receipts)
    const status = row.status as keyof typeof cell
    if (status in cell && status !== "total") cell[status] += n
    else cell.other += n
    cell.total += n
  }

  const telegram = new Map(
    days.map((date) => [
      date,
      { date, outbound: { total: 0, ...counts(TELEGRAM_OUTBOX_STATES) } },
    ]),
  )
  for (const row of rows.telegramOutbox) {
    const cell = telegram.get(row.day)?.outbound
    if (!cell) continue
    const n = num(row.messages)
    const state = row.state.toLowerCase() as keyof typeof cell
    if (state in cell && state !== "total") cell[state] += n
    cell.total += n
  }

  return {
    version: 1 as const,
    projectId: "ewatrade" as const,
    source: "ewatrade_ledger" as const,
    asOf: now.toISOString(),
    period: { start: period.start, end: period.end, timezone: "UTC" as const },
    attribution: {
      channels: [...ASSISTANT_RUN_CHANNELS],
      inApp: "web_and_mobile_combined" as const,
      unattributedTokens: "usage_without_chat_run" as const,
      untenantedWhatsApp: "replies_before_business_selection" as const,
    },
    runs: days.flatMap((date) =>
      ASSISTANT_RUN_CHANNELS.map((channel) => ({
        date,
        channel,
        ...(runCells.get(runKey(date, channel)) ?? emptyRuns()),
      })),
    ),
    runDays: days.map((date) => ({
      date,
      ...(runCells.get(runKey(date, null)) ?? emptyRuns()),
    })),
    runTotals: [
      ...ASSISTANT_RUN_CHANNELS.map((channel) => ({
        channel,
        ...(runCells.get(runKey(null, channel)) ?? emptyRuns()),
      })),
      {
        channel: "all" as const,
        ...(runCells.get(runKey(null, null)) ?? emptyRuns()),
      },
    ],
    tokens: rows.tokens
      .filter((row) => inPeriod.has(row.day))
      .map((row) => ({
        date: row.day,
        channel: row.channel as AssistantRunChannel | "unattributed",
        requestClass: row.requestClass,
        provider: row.provider,
        model: row.model,
        events: num(row.events),
        failedEvents: num(row.failedEvents),
        eventsWithoutTokens: num(row.eventsWithoutTokens),
        inputTokens: num(row.inputTokens),
        cachedInputTokens: num(row.cachedInputTokens),
        outputTokens: num(row.outputTokens),
        totalTokens: num(row.totalTokens),
      }))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.channel.localeCompare(b.channel) ||
          a.requestClass.localeCompare(b.requestClass) ||
          a.provider.localeCompare(b.provider) ||
          a.model.localeCompare(b.model),
      ),
    whatsapp: [...whatsapp.values()],
    telegram: [...telegram.values()],
  }
}

export type OversightAssistantUsage = ReturnType<typeof shapeAssistantUsage>
