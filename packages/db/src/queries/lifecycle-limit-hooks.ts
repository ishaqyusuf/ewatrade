// Real-time P08 hook (docs/plans/2026-11-12-lifecycle-marketing-plan.md §4,
// workstream W3). The write that pushes a plan limit to 80%, 90% or 100%
// writes the lifecycle ledger row in the same transaction, so the nudge never
// waits for the daily sweep and never outlives a rolled-back write.
//
// The decision and send policy live in @ewatrade/growth, which depends on
// this package, so @ewatrade/db cannot import it. Instead the API registers a
// handler at startup (`installLimitPressureHook` in @ewatrade/growth). With no
// handler, or with GROWTH_LIFECYCLE_ENABLED off, every hook returns at once
// and costs no query.
//
// Storefront items have no write-time check (the storefront read truncates
// to the plan's count, and on Free that count equals the product cap), so
// they are covered by the products hook plus the daily sweep.

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { getRetailOpsOrderPeriodStart } from "./retail-ops-subscription-plans"
import { getRetailOpsTenantPlan } from "./retail-ops-subscriptions"

type Db = PrismaClient | Prisma.TransactionClient

export type LimitPressureLimit = "ordersPerMonth" | "products" | "staff"

/** Usage after the write that just happened inside `tx`. */
export type LimitPressureUsage = {
  tenantId: string
  planId: "free" | "starter" | "growth" | "pro"
  limit: LimitPressureLimit
  used: number
  cap: number
  now: Date
}

export type LimitPressureHandler = (
  tx: Prisma.TransactionClient,
  usage: LimitPressureUsage,
) => Promise<void>

let handler: LimitPressureHandler | null = null

/** Called once at process start by the API. Pass null to remove (tests). */
export function setLimitPressureHandler(next: LimitPressureHandler | null) {
  handler = next
}

function hookActive() {
  return handler !== null && process.env.GROWTH_LIFECYCLE_ENABLED === "true"
}

/** Below 80% nothing can be due, so skip the handler entirely. */
function belowPressure(used: number, cap: number) {
  return cap <= 0 || used / cap + 1e-9 < 0.8
}

/**
 * Run the handler inside a savepoint: a marketing failure must never abort
 * the order, product or staff write that called it.
 */
async function runHandler(tx: Db, usage: LimitPressureUsage) {
  const run = handler
  if (!run || belowPressure(usage.used, usage.cap)) return
  const client = tx as Prisma.TransactionClient
  await client.$executeRawUnsafe("SAVEPOINT lifecycle_limit_pressure")
  try {
    await run(client, usage)
    await client.$executeRawUnsafe("RELEASE SAVEPOINT lifecycle_limit_pressure")
  } catch (error) {
    await client.$executeRawUnsafe(
      "ROLLBACK TO SAVEPOINT lifecycle_limit_pressure",
    )
    console.error("lifecycle limit-pressure hook failed", {
      tenantId: usage.tenantId,
      limit: usage.limit,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** After a commercial order is created in `tx`. */
export async function reportOrderLimitUsage(
  tx: Db,
  input: { tenantId: string; now: Date },
) {
  if (!hookActive()) return
  const { plan } = await getRetailOpsTenantPlan(tx, input)
  const cap = plan.limits.ordersPerMonth
  if (cap === null) return
  const used = await tx.commercialOrder.count({
    where: {
      createdAt: { gte: getRetailOpsOrderPeriodStart(input.now) },
      tenantId: input.tenantId,
    },
  })
  await runHandler(tx, {
    tenantId: input.tenantId,
    planId: plan.id,
    limit: "ordersPerMonth",
    used,
    cap,
    now: input.now,
  })
}

/**
 * After a catalog item is created in `tx`. Mirrors the product allowance:
 * only Free, zero-access and owner-paid caps are enforced, so only those warn.
 */
export async function reportProductLimitUsage(
  tx: Db,
  input: { tenantId: string; now?: Date },
) {
  if (!hookActive()) return
  const { plan, subscription } = await getRetailOpsTenantPlan(tx, input)
  const cap = plan.limits.products
  if (
    cap === null ||
    (plan.id !== "free" &&
      cap !== 0 &&
      subscription.source !== "owner_subscription")
  )
    return
  const used = await tx.catalogItem.count({
    where: {
      tenantId: input.tenantId,
      status: { not: "ARCHIVED" },
      systemRole: null,
    },
  })
  await runHandler(tx, {
    tenantId: input.tenantId,
    planId: plan.id,
    limit: "products",
    used,
    cap,
    now: input.now ?? new Date(),
  })
}

/** After a staff seat is taken in `tx`; the caller already knows the usage. */
export async function reportStaffLimitUsage(
  tx: Db,
  input: {
    tenantId: string
    planId: LimitPressureUsage["planId"]
    used: number
    cap: number | null
    now?: Date
  },
) {
  if (!hookActive() || input.cap === null) return
  await runHandler(tx, {
    tenantId: input.tenantId,
    planId: input.planId,
    limit: "staff",
    used: input.used,
    cap: input.cap,
    now: input.now ?? new Date(),
  })
}
