import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

// Read side of lifecycle marketing (docs/plans/2026-11-12-lifecycle-marketing-plan.md §5).
// Every query reads BusinessGrowthSnapshot, the LifecycleMessage ledger or the
// owner billing tables; never live order/catalog tables. Each is bounded by a
// day list, a capped period or a page size, and only counts LIVE businesses.
// Read-only: safe on the Oversight read client (statement timeout 15 s).

export const GROWTH_STAGE_ORDER = [
  "signed_up",
  "activated",
  "habit",
  "expanding",
  "paying",
  "at_risk",
  "dormant",
] as const
/** Stages at or past Activated (regressions still count as once activated). */
const ACTIVATED_STAGES = ["activated", "habit", "expanding", "paying"]
/** Plays below this many treated businesses show "not enough data" (§5.3). */
export const PLAY_MIN_TREATED = 100
const REVENUE_PLAYS = ["P08", "P09", "P10", "P11", "P12"]

const DAY_MS = 86_400_000
const liveTenant = Prisma.sql`t."dataClassification" = 'LIVE' AND t."qaPurgeStartedAt" IS NULL`

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}
function addDays(day: string, days: number) {
  return isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS))
}
function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}
function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}
function num(value: unknown) {
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  return 0
}
function dayOf(value: unknown) {
  return value instanceof Date ? isoDay(value) : String(value).slice(0, 10)
}

/** The most recent snapshot day, or null before the first sweep. */
export async function latestGrowthSnapshotDay(db: DbClient) {
  const rows = await db.$queryRaw<{ day: Date | null }[]>`
    SELECT max("day") AS "day" FROM "BusinessGrowthSnapshot"`
  return rows[0]?.day ? isoDay(rows[0].day) : null
}

/** WASB (north star): businesses with an order in the last 7 days, one point per week. */
export async function growthWeeklyActiveSellingBusinesses(
  db: DbClient,
  input: { weeks?: number; latestDay?: string | null } = {},
) {
  const weeks = clamp(input.weeks, 1, 52, 12)
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  if (!latest) return { latestDay: null, points: [] }
  const days = Array.from({ length: weeks }, (_, i) =>
    addDays(latest, -7 * (weeks - 1 - i)),
  )
  const rows = await db.$queryRaw<
    { day: Date; businesses: bigint; active: bigint }[]
  >`
    SELECT s."day",
           count(*) AS "businesses",
           count(*) FILTER (WHERE s."ordersLast7" > 0) AS "active"
      FROM "BusinessGrowthSnapshot" s
      JOIN "Tenant" t ON t."id" = s."tenantId"
     WHERE s."day" = ANY(${days}::date[]) AND ${liveTenant}
     GROUP BY s."day"`
  const byDay = new Map(rows.map((r) => [dayOf(r.day), r]))
  return {
    latestDay: latest,
    points: days.map((day) => {
      const row = byDay.get(day)
      return {
        weekEnding: day,
        /** False when no sweep ran on that day. */
        measured: Boolean(row),
        businesses: num(row?.businesses),
        wasb: num(row?.active),
      }
    }),
  }
}

/** Businesses per stage on the latest day and 7 days earlier, plus stage moves. */
export async function growthStageFunnel(
  db: DbClient,
  input: { latestDay?: string | null } = {},
) {
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  if (!latest)
    return { latestDay: null, previousDay: null, stages: [], moves: [] }
  const previous = addDays(latest, -7)
  const [counts, moves] = await Promise.all([
    db.$queryRaw<{ day: Date; stage: string; n: bigint }[]>`
      SELECT s."day", s."stage", count(*) AS "n"
        FROM "BusinessGrowthSnapshot" s
        JOIN "Tenant" t ON t."id" = s."tenantId"
       WHERE s."day" IN (${latest}::date, ${previous}::date) AND ${liveTenant}
       GROUP BY s."day", s."stage"`,
    db.$queryRaw<{ from: string; to: string; n: bigint }[]>`
      SELECT p."stage" AS "from", c."stage" AS "to", count(*) AS "n"
        FROM "BusinessGrowthSnapshot" c
        JOIN "BusinessGrowthSnapshot" p
          ON p."tenantId" = c."tenantId" AND p."day" = ${previous}::date
        JOIN "Tenant" t ON t."id" = c."tenantId"
       WHERE c."day" = ${latest}::date AND c."stage" <> p."stage" AND ${liveTenant}
       GROUP BY p."stage", c."stage"
       ORDER BY count(*) DESC
       LIMIT 50`,
  ])
  const current = new Map<string, number>()
  const before = new Map<string, number>()
  for (const row of counts)
    (dayOf(row.day) === latest ? current : before).set(row.stage, num(row.n))
  const known = new Set<string>(GROWTH_STAGE_ORDER)
  const stages = [
    ...GROWTH_STAGE_ORDER,
    ...[...current.keys(), ...before.keys()].filter((s) => !known.has(s)),
  ]
    .filter((stage, i, all) => all.indexOf(stage) === i)
    .map((stage) => ({
      stage,
      count: current.get(stage) ?? 0,
      previous: before.size ? (before.get(stage) ?? 0) : null,
      delta: before.size
        ? (current.get(stage) ?? 0) - (before.get(stage) ?? 0)
        : null,
    }))
  return {
    latestDay: latest,
    previousDay: before.size ? previous : null,
    stages,
    moves: moves.map((m) => ({ from: m.from, to: m.to, count: num(m.n) })),
  }
}

/**
 * Share of each weekly signup cohort that reached Activated (or beyond) within
 * 7 days. Only businesses with a snapshot in that first week are measured, so
 * cohorts from before the snapshot writer existed are not counted as failures.
 */
export async function growthActivationCohorts(
  db: DbClient,
  input: { weeks?: number; now?: Date } = {},
) {
  const weeks = clamp(input.weeks, 1, 26, 12)
  const now = input.now ?? new Date()
  const rows = await db.$queryRaw<
    {
      cohort: Date
      signups: bigint
      measured: bigint
      activated: bigint
    }[]
  >`
    WITH cohort AS (
      SELECT t."id",
             (t."createdAt" AT TIME ZONE 'UTC')::date AS "createdDay",
             date_trunc('week', t."createdAt" AT TIME ZONE 'UTC')::date AS "cohort"
        FROM "Tenant" t
       WHERE ${liveTenant}
         AND t."createdAt" >= date_trunc('week', ${now}::timestamp AT TIME ZONE 'UTC') - make_interval(weeks => ${weeks - 1})
    )
    SELECT c."cohort",
           count(*) AS "signups",
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "BusinessGrowthSnapshot" s
              WHERE s."tenantId" = c."id"
                AND s."day" BETWEEN c."createdDay" AND c."createdDay" + 7)) AS "measured",
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "BusinessGrowthSnapshot" s
              WHERE s."tenantId" = c."id"
                AND s."day" BETWEEN c."createdDay" AND c."createdDay" + 7
                AND s."stage" = ANY(${ACTIVATED_STAGES}::text[]))) AS "activated"
      FROM cohort c
     GROUP BY c."cohort"
     ORDER BY c."cohort"`
  const today = isoDay(now)
  return rows.map((r) => {
    const cohortStart = dayOf(r.cohort)
    const measured = num(r.measured)
    const activated = num(r.activated)
    return {
      cohortStart,
      signups: num(r.signups),
      measured,
      activated,
      rate: pct(activated, measured),
      /** The 7-day window of the cohort's last signup day has passed. */
      complete: addDays(cohortStart, 13) < today,
    }
  })
}

export const RETENTION_WEEKS = [1, 4, 8, 12] as const

/**
 * Share of each signup-month cohort active (an order in the last 7 days) at
 * week 1, 4, 8 and 12 after signup. The denominator is businesses with a
 * snapshot on that exact day, so weeks not reached yet are null.
 */
export async function growthRetentionCurve(
  db: DbClient,
  input: { months?: number; now?: Date } = {},
) {
  const months = clamp(input.months, 1, 12, 6)
  const now = input.now ?? new Date()
  const rows = await db.$queryRaw<
    { cohort: Date; week: number; eligible: bigint; active: bigint }[]
  >`
    WITH cohort AS (
      SELECT t."id",
             (t."createdAt" AT TIME ZONE 'UTC')::date AS "createdDay",
             date_trunc('month', t."createdAt" AT TIME ZONE 'UTC')::date AS "cohort"
        FROM "Tenant" t
       WHERE ${liveTenant}
         AND t."createdAt" >= date_trunc('month', ${now}::timestamp AT TIME ZONE 'UTC') - make_interval(months => ${months - 1})
    ),
    week AS (SELECT unnest(${[...RETENTION_WEEKS]}::int[]) AS "week")
    SELECT c."cohort", w."week",
           count(s."id") AS "eligible",
           count(s."id") FILTER (WHERE s."ordersLast7" > 0) AS "active"
      FROM cohort c
      CROSS JOIN week w
      LEFT JOIN "BusinessGrowthSnapshot" s
        ON s."tenantId" = c."id" AND s."day" = c."createdDay" + 7 * w."week"
     GROUP BY c."cohort", w."week"
     ORDER BY c."cohort", w."week"`
  const cohorts = new Map<
    string,
    {
      cohortMonth: string
      weeks: {
        week: number
        eligible: number
        active: number
        rate: number | null
      }[]
    }
  >()
  for (const r of rows) {
    const month = dayOf(r.cohort).slice(0, 7)
    const entry = cohorts.get(month) ?? { cohortMonth: month, weeks: [] }
    const eligible = num(r.eligible)
    const active = num(r.active)
    entry.weeks.push({
      week: num(r.week),
      eligible,
      active,
      rate: pct(active, eligible),
    })
    cohorts.set(month, entry)
  }
  return [...cohorts.values()]
}

/** Businesses at 80% or more (and at 100%) of each plan limit on the latest day. */
export async function growthLimitPressure(
  db: DbClient,
  input: { latestDay?: string | null } = {},
) {
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  if (!latest) return { latestDay: null, limits: [] }
  const rows = await db.$queryRaw<
    { limit: string; tracked: bigint; near: bigint; reached: bigint }[]
  >`
    SELECT p."key" AS "limit",
           count(*) AS "tracked",
           count(*) FILTER (WHERE p."value"::numeric >= 0.8) AS "near",
           count(*) FILTER (WHERE p."value"::numeric >= 1) AS "reached"
      FROM "BusinessGrowthSnapshot" s
      JOIN "Tenant" t ON t."id" = s."tenantId"
      CROSS JOIN LATERAL jsonb_each_text(s."limitPressure") p
     WHERE s."day" = ${latest}::date AND ${liveTenant}
       AND jsonb_typeof(s."limitPressure") = 'object'
       AND p."value" ~ '^[0-9]+(\\.[0-9]+)?$'
     GROUP BY p."key"
     ORDER BY count(*) FILTER (WHERE p."value"::numeric >= 0.8) DESC, p."key"`
  return {
    latestDay: latest,
    limits: rows.map((r) => ({
      limit: r.limit,
      tracked: num(r.tracked),
      atOrAbove80: num(r.near),
      atOrAbove100: num(r.reached),
    })),
  }
}

export type GrowthLeadRow = Awaited<
  ReturnType<typeof growthProductQualifiedLeads>
>["leads"][number]

/**
 * Product-qualified leads: businesses in Expanding on the latest day, with the
 * limit closest to full and their milestones. A page of at most 100. Each row
 * carries `tenantId` so Oversight can open the business detail (and, later,
 * the operator console that sends a chosen message under the operator's name).
 */
export async function growthProductQualifiedLeads(
  db: DbClient,
  input: { latestDay?: string | null; take?: number; page?: number } = {},
) {
  const take = clamp(input.take, 1, 100, 50)
  const page = clamp(input.page, 0, 1000, 0)
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  if (!latest) return { latestDay: null, total: 0, page, take, leads: [] }
  const [rows, totals] = await Promise.all([
    db.$queryRaw<
      {
        tenantId: string
        name: string
        slug: string
        planId: string
        ordersLast7: number
        ordersThisMonth: number
        salesMinorThisMonth: bigint
        currencyCode: string
        staffCount: number
        businessesOwned: number
        catalogItems: number
        storefrontPublished: boolean
        lastActiveAt: Date | null
        businessCreatedAt: Date
        topLimit: string | null
        topPressure: string | null
      }[]
    >`
      SELECT s."tenantId", t."name", t."slug", s."planId", s."ordersLast7",
             s."ordersThisMonth", s."salesMinorThisMonth", s."currencyCode",
             s."staffCount", s."businessesOwned", s."catalogItems",
             s."storefrontPublished", s."lastActiveAt", s."businessCreatedAt",
             top."key" AS "topLimit", top."value" AS "topPressure"
        FROM "BusinessGrowthSnapshot" s
        JOIN "Tenant" t ON t."id" = s."tenantId"
        LEFT JOIN LATERAL (
          SELECT p."key", p."value"
            FROM jsonb_each_text(
              CASE WHEN jsonb_typeof(s."limitPressure") = 'object'
                   THEN s."limitPressure" ELSE '{}'::jsonb END) p
           WHERE p."value" ~ '^[0-9]+(\\.[0-9]+)?$'
           ORDER BY p."value"::numeric DESC, p."key"
           LIMIT 1
        ) top ON TRUE
       WHERE s."day" = ${latest}::date AND s."stage" = 'expanding' AND ${liveTenant}
       ORDER BY top."value"::numeric DESC NULLS LAST, s."ordersLast7" DESC, s."tenantId"
       LIMIT ${take} OFFSET ${page * take}`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS "n"
        FROM "BusinessGrowthSnapshot" s
        JOIN "Tenant" t ON t."id" = s."tenantId"
       WHERE s."day" = ${latest}::date AND s."stage" = 'expanding' AND ${liveTenant}`,
  ])
  return {
    latestDay: latest,
    total: num(totals[0]?.n),
    page,
    take,
    leads: rows.map((r) => ({
      tenantId: r.tenantId,
      name: r.name,
      slug: r.slug,
      planId: r.planId,
      topLimit: r.topLimit,
      topLimitPressure: r.topPressure === null ? null : Number(r.topPressure),
      ordersLast7: num(r.ordersLast7),
      ordersThisMonth: num(r.ordersThisMonth),
      salesMinorThisMonth: num(r.salesMinorThisMonth),
      currencyCode: r.currencyCode,
      staffCount: num(r.staffCount),
      businessesOwned: num(r.businessesOwned),
      catalogItems: num(r.catalogItems),
      storefrontPublished: r.storefrontPublished,
      lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
      businessCreatedAt: r.businessCreatedAt.toISOString(),
    })),
  }
}

/** % of businesses with each adoption milestone on the latest day. */
export async function growthFeatureAdoption(
  db: DbClient,
  input: { latestDay?: string | null } = {},
) {
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  if (!latest) return { latestDay: null, businesses: 0, features: [] }
  const rows = await db.$queryRaw<
    {
      businesses: bigint
      site: bigint
      domain: bigint
      money: bigint
      staff: bigint
      channel: bigint
      whatsapp: bigint
      telegram: bigint
      multi: bigint
    }[]
  >`
    SELECT count(*) AS "businesses",
           count(*) FILTER (WHERE s."storefrontPublished") AS "site",
           count(*) FILTER (WHERE s."customDomain") AS "domain",
           count(*) FILTER (WHERE s."moneyAccounts" >= 2) AS "money",
           count(*) FILTER (WHERE s."staffCount" >= 1) AS "staff",
           count(*) FILTER (WHERE s."whatsappLinked" OR s."telegramLinked") AS "channel",
           count(*) FILTER (WHERE s."whatsappLinked") AS "whatsapp",
           count(*) FILTER (WHERE s."telegramLinked") AS "telegram",
           count(*) FILTER (WHERE s."businessesOwned" >= 2) AS "multi"
      FROM "BusinessGrowthSnapshot" s
      JOIN "Tenant" t ON t."id" = s."tenantId"
     WHERE s."day" = ${latest}::date AND ${liveTenant}`
  const r = rows[0]
  const businesses = num(r?.businesses)
  const feature = (key: string, label: string, count: unknown) => ({
    key,
    label,
    count: num(count),
    percent: pct(num(count), businesses),
  })
  return {
    latestDay: latest,
    businesses,
    features: [
      feature("site", "Site published", r?.site),
      feature("money_accounts", "2+ money accounts", r?.money),
      feature("staff", "Has staff", r?.staff),
      feature("channel", "Assistant channel linked", r?.channel),
      feature("telegram", "Telegram linked", r?.telegram),
      feature("whatsapp", "WhatsApp linked", r?.whatsapp),
      feature("custom_domain", "Custom domain", r?.domain),
      feature("second_business", "2+ businesses", r?.multi),
    ],
  }
}

export const WHATSAPP_USAGE_BUCKETS = [
  { key: "0-25", min: 0, max: 0.25 },
  { key: "25-50", min: 0.25, max: 0.5 },
  { key: "50-80", min: 0.5, max: 0.8 },
  { key: "80-100", min: 0.8, max: 1 },
  { key: "exhausted", min: 1, max: null },
] as const

/**
 * WhatsApp reply usage against the monthly cap on the latest day. Empty-safe:
 * until the quota ledger fills `waRepliesUsed/waRepliesCap`, `tracked` is 0.
 */
export async function growthWhatsAppUsage(
  db: DbClient,
  input: { latestDay?: string | null } = {},
) {
  const latest =
    input.latestDay === undefined
      ? await latestGrowthSnapshotDay(db)
      : input.latestDay
  const empty = {
    latestDay: latest,
    tracked: 0,
    buckets: WHATSAPP_USAGE_BUCKETS.map((b) => ({ key: b.key, count: 0 })),
    atOrAbove80Percent: null as number | null,
    exhaustedPercent: null as number | null,
    cappedWithTelegram: 0,
  }
  if (!latest) return empty
  const rows = await db.$queryRaw<
    { bucket: string; n: bigint; telegram: bigint }[]
  >`
    SELECT CASE
             WHEN s."waRepliesUsed"::numeric / s."waRepliesCap" >= 1 THEN 'exhausted'
             WHEN s."waRepliesUsed"::numeric / s."waRepliesCap" >= 0.8 THEN '80-100'
             WHEN s."waRepliesUsed"::numeric / s."waRepliesCap" >= 0.5 THEN '50-80'
             WHEN s."waRepliesUsed"::numeric / s."waRepliesCap" >= 0.25 THEN '25-50'
             ELSE '0-25'
           END AS "bucket",
           count(*) AS "n",
           count(*) FILTER (WHERE s."telegramLinked") AS "telegram"
      FROM "BusinessGrowthSnapshot" s
      JOIN "Tenant" t ON t."id" = s."tenantId"
     WHERE s."day" = ${latest}::date AND ${liveTenant}
       AND s."waRepliesUsed" IS NOT NULL AND s."waRepliesCap" > 0
     GROUP BY 1`
  if (!rows.length) return empty
  const counts = new Map(rows.map((r) => [r.bucket, r]))
  const tracked = rows.reduce((sum, r) => sum + num(r.n), 0)
  const high = num(counts.get("80-100")?.n) + num(counts.get("exhausted")?.n)
  return {
    latestDay: latest,
    tracked,
    buckets: WHATSAPP_USAGE_BUCKETS.map((b) => ({
      key: b.key,
      count: num(counts.get(b.key)?.n),
    })),
    atOrAbove80Percent: pct(high, tracked),
    exhaustedPercent: pct(num(counts.get("exhausted")?.n), tracked),
    cappedWithTelegram:
      num(counts.get("80-100")?.telegram) +
      num(counts.get("exhausted")?.telegram),
  }
}

/**
 * Per-play scorecard over messages created in the last `days` (max 180).
 * Ledger play ids like `P08_limit:products` roll up to `P08_limit`.
 * Lift = treated conversion % minus holdout conversion %, in percentage
 * points, shown only with at least PLAY_MIN_TREATED treated businesses.
 */
export async function growthPlayScorecard(
  db: DbClient,
  input: { days?: number; now?: Date } = {},
) {
  const days = clamp(input.days, 1, 180, 56)
  const since = new Date((input.now ?? new Date()).getTime() - days * DAY_MS)
  const rows = await db.$queryRaw<
    {
      play: string
      sent: bigint
      emailSent: bigint
      delivered: bigint
      clicked: bigint
      suppressed: bigint
      treated: bigint
      treatedConverted: bigint
      holdout: bigint
      holdoutConverted: bigint
    }[]
  >`
    SELECT split_part(m."playId", ':', 1) AS "play",
           count(*) FILTER (WHERE m."sentAt" IS NOT NULL) AS "sent",
           count(*) FILTER (WHERE m."sentAt" IS NOT NULL AND m."channel" = 'email') AS "emailSent",
           count(*) FILTER (WHERE m."sentAt" IS NOT NULL AND m."channel" = 'email' AND m."deliveredAt" IS NOT NULL) AS "delivered",
           count(*) FILTER (WHERE m."sentAt" IS NOT NULL AND m."clickedAt" IS NOT NULL) AS "clicked",
           count(*) FILTER (WHERE m."status" = 'suppressed') AS "suppressed",
           count(DISTINCT m."tenantId") FILTER (WHERE m."sentAt" IS NOT NULL) AS "treated",
           count(DISTINCT m."tenantId") FILTER (WHERE m."sentAt" IS NOT NULL AND m."convertedAt" IS NOT NULL) AS "treatedConverted",
           count(DISTINCT m."tenantId") FILTER (WHERE m."status" = 'holdout') AS "holdout",
           count(DISTINCT m."tenantId") FILTER (WHERE m."status" = 'holdout' AND m."convertedAt" IS NOT NULL) AS "holdoutConverted"
      FROM "LifecycleMessage" m
      JOIN "Tenant" t ON t."id" = m."tenantId"
     WHERE m."createdAt" >= ${since} AND ${liveTenant}
     GROUP BY 1
     ORDER BY 1
     LIMIT 100`
  return {
    days,
    since: since.toISOString(),
    minTreated: PLAY_MIN_TREATED,
    plays: rows.map((r) => {
      const sent = num(r.sent)
      const treated = num(r.treated)
      const holdout = num(r.holdout)
      const conversion = pct(num(r.treatedConverted), treated)
      const holdoutConversion = pct(num(r.holdoutConverted), holdout)
      const enoughData = treated >= PLAY_MIN_TREATED && holdout > 0
      return {
        play: r.play,
        sent,
        suppressed: num(r.suppressed),
        treated,
        holdout,
        /** Email only: in-app and channel footers have no delivery event. */
        deliveredPercent: pct(num(r.delivered), num(r.emailSent)),
        clickPercent: pct(num(r.clicked), sent),
        conversionPercent: conversion,
        holdoutConversionPercent: holdoutConversion,
        enoughData,
        /** Percentage points; null means "not enough data". */
        lift:
          enoughData && conversion !== null && holdoutConversion !== null
            ? Math.round((conversion - holdoutConversion) * 10) / 10
            : null,
      }
    }),
  }
}

/**
 * MRR, new paid subscriptions and churn from owner billing (Paystack web and
 * store receipts). Production environment only, so sandbox checkouts never
 * count. Empty-safe: `live` is false until a production subscription exists.
 */
export async function growthRevenue(
  db: DbClient,
  input: { days?: number; now?: Date } = {},
) {
  const days = clamp(input.days, 1, 365, 30)
  const now = input.now ?? new Date()
  const since = new Date(now.getTime() - days * DAY_MS)
  const [plans, period, attributed] = await Promise.all([
    db.$queryRaw<
      {
        planId: string
        currencyCode: string | null
        active: bigint
        mrrMinor: bigint | null
      }[]
    >`
      SELECT o."planId",
             max(p."currencyCode") AS "currencyCode",
             count(*) AS "active",
             sum(p."monthlyPriceMinor")::bigint AS "mrrMinor"
        FROM "OwnerBillingSubscription" o
        LEFT JOIN "SubscriptionPlan" p ON p."key" = o."planId"
       WHERE o."environment" = 'production' AND o."status" = 'ACTIVE'
         AND o."currentPeriodEndsAt" > ${now}
       GROUP BY o."planId"
       ORDER BY o."planId"`,
    db.$queryRaw<{ any: bigint; started: bigint; churned: bigint }[]>`
      SELECT count(*) AS "any",
             count(*) FILTER (WHERE o."createdAt" >= ${since}) AS "started",
             count(*) FILTER (WHERE o."status" = 'CANCELLED' AND o."cancelledAt" >= ${since}) AS "churned"
        FROM "OwnerBillingSubscription" o
       WHERE o."environment" = 'production'`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT m."tenantId") AS "n"
        FROM "LifecycleMessage" m
       WHERE m."convertedAt" >= ${since}
         AND m."sentAt" IS NOT NULL
         AND split_part(m."playId", '_', 1) = ANY(${REVENUE_PLAYS}::text[])`,
  ])
  const p = period[0]
  const upgrades = num(p?.started)
  return {
    days,
    live: num(p?.any) > 0,
    currencyCode: plans.find((r) => r.currencyCode)?.currencyCode ?? "NGN",
    activeSubscriptions: plans.reduce((s, r) => s + num(r.active), 0),
    mrrMinor: plans.reduce((s, r) => s + num(r.mrrMinor), 0),
    byPlan: plans.map((r) => ({
      planId: r.planId,
      active: num(r.active),
      mrrMinor: num(r.mrrMinor),
    })),
    upgrades,
    churned: num(p?.churned),
    /** Not derivable until plan-change history exists. */
    downgrades: null as number | null,
    playAttributedUpgrades: num(attributed[0]?.n),
    playAttributedPercent: pct(num(attributed[0]?.n), upgrades),
  }
}

/** Everything the Growth page shows above the fold, in one bounded round. */
export async function growthOverview(db: DbClient, now = new Date()) {
  const latestDay = await latestGrowthSnapshotDay(db)
  const [
    wasb,
    funnel,
    activation,
    retention,
    limits,
    adoption,
    whatsapp,
    plays,
    revenue,
  ] = await Promise.all([
    growthWeeklyActiveSellingBusinesses(db, { latestDay }),
    growthStageFunnel(db, { latestDay }),
    growthActivationCohorts(db, { now }),
    growthRetentionCurve(db, { now }),
    growthLimitPressure(db, { latestDay }),
    growthFeatureAdoption(db, { latestDay }),
    growthWhatsAppUsage(db, { latestDay }),
    growthPlayScorecard(db, { now }),
    growthRevenue(db, { now }),
  ])
  return {
    version: 1 as const,
    asOf: now.toISOString(),
    latestDay,
    wasb,
    funnel,
    activation,
    retention,
    limits,
    adoption,
    whatsapp,
    plays,
    revenue,
  }
}

/**
 * One business for Oversight: latest snapshot, a 12-week stage/activity trail,
 * its lifecycle messages and "See plans" intent. Base for the later operator
 * console (pick a snapshot, send a chosen message as `senderUserId`).
 */
export async function growthBusinessDetail(db: DbClient, tenantId: string) {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, dataClassification: "LIVE", qaPurgeStartedAt: null },
    select: { id: true, name: true, slug: true, createdAt: true },
  })
  if (!tenant) return null
  const [snapshots, messages, intents] = await Promise.all([
    db.businessGrowthSnapshot.findMany({
      where: { tenantId },
      orderBy: { day: "desc" },
      take: 84,
    }),
    db.lifecycleMessage.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        playId: true,
        periodKey: true,
        variant: true,
        channel: true,
        status: true,
        suppressedReason: true,
        senderUserId: true,
        sentAt: true,
        deliveredAt: true,
        clickedAt: true,
        dismissedAt: true,
        convertedAt: true,
        createdAt: true,
      },
    }),
    db.growthFeatureIntent.findMany({
      where: { tenantId },
      orderBy: [{ month: "desc" }, { taps: "desc" }],
      take: 24,
      select: { feature: true, month: true, taps: true, lastAt: true },
    }),
  ])
  const latest = snapshots[0] ?? null
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt.toISOString(),
    },
    snapshot: latest
      ? {
          day: isoDay(latest.day),
          stage: latest.stage,
          planId: latest.planId,
          activeDays28: latest.activeDays28,
          ordersLast7: latest.ordersLast7,
          ordersThisMonth: latest.ordersThisMonth,
          ordersTotal: latest.ordersTotal,
          salesMinorThisMonth: Number(latest.salesMinorThisMonth),
          currencyCode: latest.currencyCode,
          catalogItems: latest.catalogItems,
          staffCount: latest.staffCount,
          businessesOwned: latest.businessesOwned,
          moneyAccounts: latest.moneyAccounts,
          storefrontPublished: latest.storefrontPublished,
          customDomain: latest.customDomain,
          whatsappLinked: latest.whatsappLinked,
          telegramLinked: latest.telegramLinked,
          waRepliesUsed: latest.waRepliesUsed,
          waRepliesCap: latest.waRepliesCap,
          limitPressure: limitPressureOf(latest.limitPressure),
          lastActiveAt: latest.lastActiveAt?.toISOString() ?? null,
        }
      : null,
    /** Weekly points (every 7th day back from the latest), oldest first. */
    trail: snapshots
      .filter(
        (s) =>
          latest &&
          (latest.day.getTime() - s.day.getTime()) % (7 * DAY_MS) === 0,
      )
      .slice(0, 12)
      .reverse()
      .map((s) => ({
        day: isoDay(s.day),
        stage: s.stage,
        ordersLast7: s.ordersLast7,
        activeDays28: s.activeDays28,
      })),
    messages: messages.map((m) => ({
      ...m,
      sentAt: m.sentAt?.toISOString() ?? null,
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      clickedAt: m.clickedAt?.toISOString() ?? null,
      dismissedAt: m.dismissedAt?.toISOString() ?? null,
      convertedAt: m.convertedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    intents: intents.map((i) => ({ ...i, lastAt: i.lastAt.toISOString() })),
  }
}

function limitPressureOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value))
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw
  return out
}
