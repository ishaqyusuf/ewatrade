// Daily business growth snapshot (plan §4.1, §5.1 layer 2).
//
// One `BusinessGrowthSnapshot` per active business per UTC day. Facts come from
// a few grouped reads per page of tenants; plan, usage and limits come from the
// existing `getRetailOpsSubscriptionSnapshot` (never re-derived here).
//
// Stage is computed by `@ewatrade/growth/stage`, injected by the caller:
// `@ewatrade/growth` depends on this package, so this file must not import it.
//
// Activity: a UTC day counts as active when the business created an order, a
// stock operation or a catalog item that day. `lastActiveAt` is the latest of
// those. (App opens are not stored durably, so they are not counted.)

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { getRetailOpsSubscriptionSnapshot } from "./retail-ops-subscriptions"

type Db = PrismaClient

const DAY_MS = 86_400_000

/** Finite plan limits tracked as pressure (used / limit). */
export const GROWTH_LIMIT_KEYS = [
  "products",
  "staff",
  "businesses",
  "ordersPerMonth",
  "storefrontItems",
  "offlineDevices",
] as const
export type GrowthLimitKey = (typeof GROWTH_LIMIT_KEYS)[number]

export type GrowthStageName =
  | "signed_up"
  | "activated"
  | "habit"
  | "expanding"
  | "paying"
  | "at_risk"
  | "dormant"

/** Structurally equal to `@ewatrade/growth/stage` `StageInput`. */
export type GrowthStageInput = {
  now: Date
  previousStage: GrowthStageName | null
  paying: boolean
  activeDays28: number
  ordersTotal: number
  catalogItems: number
  limitPressure: Partial<Record<GrowthLimitKey, number>>
  lastActiveAt: Date | null
  businessCreatedAt: Date
}

export type ComputeGrowthStage = (input: GrowthStageInput) => GrowthStageName

/** UTC midnight of `now` (the snapshot's `day`). */
export function growthSnapshotDay(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

const PAYING_SOURCES = new Set(["tenant_subscription", "owner_subscription"])
const PAYING_STATUSES = new Set(["active", "past_due"])

type CountRow = { tenantId: string; value: bigint | number | null }
const toNumber = (value: bigint | number | null | undefined) =>
  value == null ? 0 : Number(value)
function byTenant<T extends { tenantId: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.tenantId, row]))
}

/** Active tenants, ordered by id, for paging. */
export async function listGrowthSnapshotTenants(
  db: Db,
  input: { cursor?: string | null; limit?: number } = {},
) {
  return db.tenant.findMany({
    where: {
      isActive: true,
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: input.limit ?? 200,
    select: { id: true, createdAt: true },
  })
}

/** Grouped facts for one page of tenants. */
export async function readGrowthFacts(
  db: Db,
  tenantIds: readonly string[],
  now: Date,
) {
  const ids = [...tenantIds]
  if (ids.length === 0) return new Map<string, GrowthFacts>()
  const week = new Date(now.getTime() - 7 * DAY_MS)
  const day28 = new Date(growthSnapshotDay(now).getTime() - 27 * DAY_MS)
  const month = monthStart(now)

  const [orders, activeDays, lastActive, money, sites, domains, wa, tg, owned] =
    await Promise.all([
      db.$queryRaw<
        Array<{
          tenantId: string
          last7: bigint
          total: bigint
          salesMonth: bigint | null
          currencyCode: string | null
        }>
      >`SELECT "tenantId",
          count(*) FILTER (WHERE "createdAt" >= ${week}) AS "last7",
          count(*) AS "total",
          sum("totalMinor") FILTER (WHERE "createdAt" >= ${month}
            AND status NOT IN ('DRAFT','CANCELLED','REFUNDED'))::bigint AS "salesMonth",
          (array_agg("currencyCode" ORDER BY "createdAt" DESC))[1] AS "currencyCode"
        FROM "CommercialOrder" WHERE "tenantId" = ANY(${ids})
        GROUP BY "tenantId"`,
      db.$queryRaw<
        CountRow[]
      >`SELECT "tenantId", count(DISTINCT d) AS value FROM (
          SELECT "tenantId", date_trunc('day', "createdAt") AS d FROM "CommercialOrder"
            WHERE "tenantId" = ANY(${ids}) AND "createdAt" >= ${day28}
          UNION ALL
          SELECT "tenantId", date_trunc('day', "createdAt") FROM "StockOperation"
            WHERE "tenantId" = ANY(${ids}) AND "createdAt" >= ${day28}
          UNION ALL
          SELECT "tenantId", date_trunc('day', "createdAt") FROM "CatalogItem"
            WHERE "tenantId" = ANY(${ids}) AND "createdAt" >= ${day28}
        ) activity GROUP BY "tenantId"`,
      db.$queryRaw<Array<{ tenantId: string; at: Date | null }>>`
        SELECT "tenantId", max(at) AS at FROM (
          SELECT "tenantId", max("createdAt") AS at FROM "CommercialOrder"
            WHERE "tenantId" = ANY(${ids}) GROUP BY "tenantId"
          UNION ALL
          SELECT "tenantId", max("createdAt") FROM "StockOperation"
            WHERE "tenantId" = ANY(${ids}) GROUP BY "tenantId"
          UNION ALL
          SELECT "tenantId", max("createdAt") FROM "CatalogItem"
            WHERE "tenantId" = ANY(${ids}) GROUP BY "tenantId"
        ) latest GROUP BY "tenantId"`,
      db.$queryRaw<CountRow[]>`SELECT b."tenantId", count(*) AS value
        FROM "FinanceAccount" a JOIN "FinanceBook" b ON b.id = a."bookId"
        WHERE b."tenantId" = ANY(${ids}) AND a."archivedAt" IS NULL
          AND a.purpose IN ('CASH','BANK')
        GROUP BY b."tenantId"`,
      db.$queryRaw<CountRow[]>`SELECT "tenantId", count(*) AS value FROM "Site"
        WHERE "tenantId" = ANY(${ids}) AND status = 'PUBLISHED' GROUP BY "tenantId"`,
      db.$queryRaw<
        CountRow[]
      >`SELECT "tenantId", count(*) AS value FROM "TenantHostname"
        WHERE "tenantId" = ANY(${ids}) AND "isCustom" = true AND "verifiedAt" IS NOT NULL
        GROUP BY "tenantId"`,
      db.$queryRaw<
        CountRow[]
      >`SELECT "tenantId", count(*) AS value FROM "AssistantWhatsAppGrant"
        WHERE "tenantId" = ANY(${ids}) AND "revokedAt" IS NULL AND "expiresAt" > ${now}
        GROUP BY "tenantId"`,
      db.$queryRaw<
        CountRow[]
      >`SELECT "tenantId", count(*) AS value FROM "AssistantTelegramGrant"
        WHERE "tenantId" = ANY(${ids}) AND "revokedAt" IS NULL AND "expiresAt" > ${now}
        GROUP BY "tenantId"`,
      // Businesses the owner of each tenant owns (active owner memberships).
      db.$queryRaw<CountRow[]>`SELECT m."tenantId", max(owned.value) AS value
        FROM "Membership" m
        JOIN LATERAL (
          SELECT count(DISTINCT m2."tenantId") AS value FROM "Membership" m2
          JOIN "Tenant" t2 ON t2.id = m2."tenantId" AND t2."isActive" = true
          WHERE m2."userId" = m."userId" AND m2.role = 'OWNER' AND m2.status = 'ACTIVE'
        ) owned ON true
        WHERE m."tenantId" = ANY(${ids}) AND m.role = 'OWNER' AND m.status = 'ACTIVE'
        GROUP BY m."tenantId"`,
    ])

  const maps = {
    orders: byTenant(orders),
    activeDays: byTenant(activeDays),
    lastActive: byTenant(lastActive),
    money: byTenant(money),
    sites: byTenant(sites),
    domains: byTenant(domains),
    wa: byTenant(wa),
    tg: byTenant(tg),
    owned: byTenant(owned),
  }
  const facts = new Map<string, GrowthFacts>()
  for (const tenantId of ids) {
    const order = maps.orders.get(tenantId)
    facts.set(tenantId, {
      ordersLast7: toNumber(order?.last7),
      ordersTotal: toNumber(order?.total),
      salesMinorThisMonth: BigInt(order?.salesMonth ?? 0),
      currencyCode: order?.currencyCode ?? null,
      activeDays28: toNumber(maps.activeDays.get(tenantId)?.value),
      lastActiveAt: maps.lastActive.get(tenantId)?.at ?? null,
      moneyAccounts: toNumber(maps.money.get(tenantId)?.value),
      storefrontPublished: toNumber(maps.sites.get(tenantId)?.value) > 0,
      customDomain: toNumber(maps.domains.get(tenantId)?.value) > 0,
      whatsappLinked: toNumber(maps.wa.get(tenantId)?.value) > 0,
      telegramLinked: toNumber(maps.tg.get(tenantId)?.value) > 0,
      businessesOwned: Math.max(1, toNumber(maps.owned.get(tenantId)?.value)),
    })
  }
  return facts
}

export type GrowthFacts = {
  ordersLast7: number
  ordersTotal: number
  salesMinorThisMonth: bigint
  currencyCode: string | null
  activeDays28: number
  lastActiveAt: Date | null
  moneyAccounts: number
  storefrontPublished: boolean
  customDomain: boolean
  whatsappLinked: boolean
  telegramLinked: boolean
  businessesOwned: number
}

/** Plan, usage and limit pressure from the existing subscription reader. */
export function projectGrowthPlan(
  snapshot: Awaited<ReturnType<typeof getRetailOpsSubscriptionSnapshot>>,
) {
  const limitPressure: Partial<Record<GrowthLimitKey, number>> = {}
  for (const entitlement of snapshot.entitlements) {
    const key = entitlement.key as GrowthLimitKey
    if (!GROWTH_LIMIT_KEYS.includes(key)) continue
    if (entitlement.limit == null || entitlement.limit <= 0) continue
    limitPressure[key] =
      Math.round((entitlement.used / entitlement.limit) * 1000) / 1000
  }
  return {
    planId: snapshot.plan.id,
    paying:
      snapshot.plan.id !== "free" &&
      PAYING_SOURCES.has(snapshot.subscription.source) &&
      PAYING_STATUSES.has(snapshot.subscription.status),
    catalogItems: snapshot.usage.products,
    staffCount: snapshot.usage.staff,
    ordersThisMonth: snapshot.usage.ordersThisMonth,
    limitPressure,
  }
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
) {
  const results: R[] = []
  let index = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const item = items[index++] as T
        results.push(await run(item))
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * Build (upsert) today's snapshots, one page of tenants per loop, until
 * `maxTenants` or the end. Returns the cursor to resume from when stopped
 * early. Idempotent per (tenant, day): a rerun overwrites the day's row.
 */
export async function buildGrowthSnapshots(
  db: Db,
  input: {
    now?: Date
    computeStage: ComputeGrowthStage
    cursor?: string | null
    pageSize?: number
    maxTenants?: number
    concurrency?: number
  },
) {
  const now = input.now ?? new Date()
  const day = growthSnapshotDay(now)
  const pageSize = input.pageSize ?? 200
  let cursor = input.cursor ?? null
  let written = 0
  let failed = 0
  for (;;) {
    const tenants = await listGrowthSnapshotTenants(db, {
      cursor,
      limit: pageSize,
    })
    if (tenants.length === 0) return { written, failed, nextCursor: null }
    const ids = tenants.map((tenant) => tenant.id)
    const [facts, previous] = await Promise.all([
      readGrowthFacts(db, ids, now),
      db.businessGrowthSnapshot.findMany({
        where: { tenantId: { in: ids }, day: { lt: day } },
        orderBy: { day: "desc" },
        distinct: ["tenantId"],
        select: { tenantId: true, stage: true },
      }),
    ])
    const previousStage = new Map(
      previous.map((row) => [row.tenantId, row.stage as GrowthStageName]),
    )
    await mapLimit(tenants, input.concurrency ?? 4, async (tenant) => {
      try {
        const plan = projectGrowthPlan(
          await getRetailOpsSubscriptionSnapshot(db, { tenantId: tenant.id }),
        )
        const fact = facts.get(tenant.id)
        if (!fact) return
        const stage = input.computeStage({
          now,
          previousStage: previousStage.get(tenant.id) ?? null,
          paying: plan.paying,
          activeDays28: fact.activeDays28,
          ordersTotal: fact.ordersTotal,
          catalogItems: plan.catalogItems,
          limitPressure: plan.limitPressure,
          lastActiveAt: fact.lastActiveAt,
          businessCreatedAt: tenant.createdAt,
        })
        const data = {
          stage,
          planId: plan.planId,
          businessCreatedAt: tenant.createdAt,
          activeDays28: fact.activeDays28,
          ordersLast7: fact.ordersLast7,
          ordersThisMonth: plan.ordersThisMonth,
          ordersTotal: fact.ordersTotal,
          salesMinorThisMonth: fact.salesMinorThisMonth,
          currencyCode: fact.currencyCode ?? "NGN",
          catalogItems: plan.catalogItems,
          staffCount: plan.staffCount,
          businessesOwned: fact.businessesOwned,
          moneyAccounts: fact.moneyAccounts,
          storefrontPublished: fact.storefrontPublished,
          customDomain: fact.customDomain,
          whatsappLinked: fact.whatsappLinked,
          telegramLinked: fact.telegramLinked,
          // Null until the WhatsApp reply quota ledger exists.
          waRepliesUsed: null,
          waRepliesCap: null,
          limitPressure: plan.limitPressure as Prisma.InputJsonObject,
          lastActiveAt: fact.lastActiveAt,
        }
        await db.businessGrowthSnapshot.upsert({
          where: { tenantId_day: { tenantId: tenant.id, day } },
          create: { tenantId: tenant.id, day, ...data },
          update: data,
        })
        written += 1
      } catch (error) {
        failed += 1
        console.error("[growth-snapshot] tenant failed", {
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : "unknown",
        })
      }
    })
    cursor = ids.at(-1) ?? null
    if (input.maxTenants && written + failed >= input.maxTenants)
      return { written, failed, nextCursor: cursor }
    if (tenants.length < pageSize) return { written, failed, nextCursor: null }
  }
}

export const growthSnapshotSelect = {
  tenantId: true,
  day: true,
  stage: true,
  planId: true,
  businessCreatedAt: true,
  activeDays28: true,
  ordersLast7: true,
  ordersThisMonth: true,
  ordersTotal: true,
  salesMinorThisMonth: true,
  currencyCode: true,
  catalogItems: true,
  staffCount: true,
  businessesOwned: true,
  moneyAccounts: true,
  storefrontPublished: true,
  customDomain: true,
  whatsappLinked: true,
  telegramLinked: true,
  waRepliesUsed: true,
  waRepliesCap: true,
  limitPressure: true,
  lastActiveAt: true,
} satisfies Prisma.BusinessGrowthSnapshotSelect

export type GrowthSnapshotRow = Prisma.BusinessGrowthSnapshotGetPayload<{
  select: typeof growthSnapshotSelect
}>

/** Plain snapshot shape (`@ewatrade/growth/contract` `GrowthSnapshot`, loosely typed). */
export function toPlainGrowthSnapshot(row: GrowthSnapshotRow) {
  return {
    ...row,
    day: row.day.toISOString().slice(0, 10),
    limitPressure: (row.limitPressure ?? {}) as Partial<
      Record<GrowthLimitKey, number>
    >,
  }
}
export type PlainGrowthSnapshot = ReturnType<typeof toPlainGrowthSnapshot>

/** A page of one day's snapshots with the matching week-earlier row. */
export async function listGrowthSnapshotsForDay(
  db: Db,
  input: { day: Date; cursor?: string | null; limit?: number },
) {
  const rows = await db.businessGrowthSnapshot.findMany({
    where: {
      day: input.day,
      ...(input.cursor ? { tenantId: { gt: input.cursor } } : {}),
    },
    orderBy: { tenantId: "asc" },
    take: input.limit ?? 200,
    select: growthSnapshotSelect,
  })
  const weekAgoDay = new Date(input.day.getTime() - 7 * DAY_MS)
  const weekAgo = rows.length
    ? await db.businessGrowthSnapshot.findMany({
        where: {
          day: weekAgoDay,
          tenantId: { in: rows.map((row) => row.tenantId) },
        },
        select: growthSnapshotSelect,
      })
    : []
  const weekAgoByTenant = new Map(
    weekAgo.map((row) => [row.tenantId, toPlainGrowthSnapshot(row)]),
  )
  return rows.map((row) => ({
    snapshot: toPlainGrowthSnapshot(row),
    weekAgo: weekAgoByTenant.get(row.tenantId) ?? null,
  }))
}

/** Snapshots for specific tenants on specific days (conversion check). */
export async function readGrowthSnapshots(
  db: Db,
  keys: ReadonlyArray<{ tenantId: string; day: Date }>,
) {
  if (keys.length === 0) return new Map<string, PlainGrowthSnapshot>()
  const rows = await db.businessGrowthSnapshot.findMany({
    where: {
      OR: keys.map((key) => ({ tenantId: key.tenantId, day: key.day })),
    },
    select: growthSnapshotSelect,
  })
  return new Map(
    rows.map((row) => [
      `${row.tenantId}|${row.day.toISOString().slice(0, 10)}`,
      toPlainGrowthSnapshot(row),
    ]),
  )
}

/** Owner/Admin recipients with their membership role, per tenant. */
export async function listGrowthRecipients(
  db: Db,
  tenantIds: readonly string[],
) {
  const members = tenantIds.length
    ? await db.membership.findMany({
        where: {
          tenantId: { in: [...tenantIds] },
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
          user: { emailVerified: true },
        },
        select: { tenantId: true, userId: true, role: true },
      })
    : []
  const byTenant = new Map<string, Array<{ userId: string; role: string }>>()
  for (const member of members) {
    const list = byTenant.get(member.tenantId) ?? []
    list.push({ userId: member.userId, role: member.role })
    byTenant.set(member.tenantId, list)
  }
  return byTenant
}

/** Delete snapshots older than the retention window (plan: 400 days). */
export async function pruneGrowthSnapshots(db: Db, now = new Date()) {
  const cutoff = new Date(growthSnapshotDay(now).getTime() - 400 * DAY_MS)
  const deleted = await db.businessGrowthSnapshot.deleteMany({
    where: { day: { lt: cutoff } },
  })
  return deleted.count
}
