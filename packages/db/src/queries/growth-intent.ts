import type { DbClient } from "./types"

// "See plans" taps per business, feature and UTC month (GrowthFeatureIntent).
// Logly is ingest-only, so this counter is how the feature-intent play (W3)
// reads intent on the server. Callers pass a fixed GROWTH_INTENT_FEATURES label.

const FEATURE = /^[a-z][a-z_]{1,31}$/

function utcMonth(date: Date) {
  return date.toISOString().slice(0, 7)
}

/** Adds one tap. One upsert on the primary key; safe under concurrent taps. */
export async function recordFeatureIntentTap(
  db: DbClient,
  input: { tenantId: string; feature: string; now?: Date },
) {
  if (!FEATURE.test(input.feature)) throw new Error("Invalid intent feature")
  const now = input.now ?? new Date()
  const month = utcMonth(now)
  const row = await db.growthFeatureIntent.upsert({
    where: {
      tenantId_feature_month: {
        tenantId: input.tenantId,
        feature: input.feature,
        month,
      },
    },
    create: {
      tenantId: input.tenantId,
      feature: input.feature,
      month,
      taps: 1,
      firstAt: now,
      lastAt: now,
    },
    update: { taps: { increment: 1 }, lastAt: now },
    select: { taps: true },
  })
  return { month, taps: row.taps }
}

/** Taps per feature for one business in one month (`YYYY-MM`, default now). */
export async function featureIntentTapsForTenant(
  db: DbClient,
  tenantId: string,
  month = utcMonth(new Date()),
) {
  const rows = await db.growthFeatureIntent.findMany({
    where: { tenantId, month },
    select: { feature: true, taps: true, lastAt: true },
    orderBy: { taps: "desc" },
    take: 50,
  })
  return rows
}

/**
 * Businesses with at least `minTaps` taps on a feature this month, oldest
 * last tap first. Bounded page for a daily sweep; uses the month/feature/taps index.
 */
export async function businessesWithFeatureIntent(
  db: DbClient,
  input: {
    feature: string
    minTaps: number
    month?: string
    take?: number
    cursorTenantId?: string
  },
) {
  const take = Math.min(Math.max(input.take ?? 200, 1), 500)
  return db.growthFeatureIntent.findMany({
    where: {
      month: input.month ?? utcMonth(new Date()),
      feature: input.feature,
      taps: { gte: input.minTaps },
      ...(input.cursorTenantId
        ? { tenantId: { gt: input.cursorTenantId } }
        : {}),
    },
    select: { tenantId: true, taps: true, firstAt: true, lastAt: true },
    orderBy: { tenantId: "asc" },
    take,
  })
}
