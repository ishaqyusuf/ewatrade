// P08 Tier upgrade: limit pressure.
// 80% of a plan limit: in-app banner. 90%: email. 100%: plan comparison email
// (transactional, so opt-out does not hide it). Each threshold is its own
// ledger message, deduped per limit per month.

import type { RetailOpsPlanLimits } from "@ewatrade/db/subscription-plans"
import {
  type ConsentCategory,
  type GrowthLimitName,
  type GrowthPlanId,
  type LifecycleChannel,
  type LifecyclePlay,
  type PlayContext,
  type PlayDecision,
  monthKey,
} from "../../contract"
import {
  catalogPlan,
  limitLabel,
  limitNoun,
  nextMonthStartLabel,
  recommendedPlanData,
  smallestPlanAbove,
  upgradeCta,
  upgradedSince,
} from "./plans"

export const LIMIT_STAGES = [100, 90, 80] as const
export type LimitStage = (typeof LIMIT_STAGES)[number]

/**
 * Limits P08 watches, in tie-break order. Businesses belong to P12 (second
 * business); staff at 0 is a locked feature, not a limit (feature intent).
 */
export const P08_LIMITS = [
  "ordersPerMonth",
  "products",
  "staff",
  "storefrontItems",
  "offlineDevices",
] as const satisfies readonly (GrowthLimitName & keyof RetailOpsPlanLimits)[]
export type P08Limit = (typeof P08_LIMITS)[number]

// Ratios like 40/50 must land on 0.8, not 0.7999….
const EPSILON = 1e-9

/** Highest threshold reached by `used` of `limit`, or null below 80%. */
export function limitStage(used: number, limit: number): LimitStage | null {
  if (limit <= 0) return null
  const ratio = used / limit
  return LIMIT_STAGES.find((stage) => ratio + EPSILON >= stage / 100) ?? null
}

export function p08LedgerPlayId(limit: P08Limit) {
  return `P08_limit:${limit}`
}

/** `<limit>:<YYYY-MM>:<stage>`: one message per limit, month and threshold. */
export function p08PeriodKey(limit: P08Limit, now: Date, stage: LimitStage) {
  return `${limit}:${monthKey(now)}:${stage}`
}

const STAGE_DELIVERY: Record<
  LimitStage,
  { channels: readonly LifecycleChannel[]; consent: ConsentCategory }
> = {
  80: { channels: ["in_app"], consent: "offers" },
  90: { channels: ["email"], consent: "offers" },
  100: { channels: ["email"], consent: "transactional" },
}

/**
 * The P08 decision for one limit at a known usage. Shared by the daily sweep
 * (usage from the snapshot) and the real-time hook (usage from the write
 * transaction), so both produce the same ledger keys.
 */
export function limitPressureDecision(input: {
  planId: GrowthPlanId
  limit: P08Limit
  used: number
  now: Date
  checkoutAvailable: boolean
}): (PlayDecision & { stage: LimitStage }) | null {
  const current = catalogPlan(input.planId)
  const cap = current.limits[input.limit]
  if (cap === null) return null
  const stage = limitStage(input.used, cap)
  if (!stage) return null
  const recommended = smallestPlanAbove(input.planId, input.limit, input.used)
  // Pro at a limit has nowhere to go; support handles it, not a nudge.
  if (!recommended) return null
  const { ctaPath, ctaLabel } = upgradeCta({
    plan: recommended,
    checkoutAvailable: input.checkoutAvailable,
    playId: "P08_limit",
  })
  return {
    stage,
    ledgerPlayId: p08LedgerPlayId(input.limit),
    periodKey: p08PeriodKey(input.limit, input.now, stage),
    templateKey:
      stage === 100 ? "lifecycle-limit-reached" : "lifecycle-limit-warning",
    inAppKey: stage === 80 ? "limit-pressure" : undefined,
    consent: STAGE_DELIVERY[stage].consent,
    channels: STAGE_DELIVERY[stage].channels,
    ctaPath,
    data: {
      limit: input.limit,
      stage,
      used: input.used,
      cap,
      left: Math.max(cap - input.used, 0),
      noun: limitNoun(input.limit, cap),
      planName: current.name,
      recommendedLimitLabel: limitLabel(
        input.limit,
        recommended.limits[input.limit],
      ),
      resetsOn:
        input.limit === "ordersPerMonth"
          ? nextMonthStartLabel(input.now)
          : null,
      ctaLabel,
      ...recommendedPlanData(recommended, input.checkoutAvailable),
    },
  }
}

/** Usage behind a snapshot pressure ratio (the snapshot stores used / limit). */
function usedFromPressure(
  planId: GrowthPlanId,
  limit: P08Limit,
  ratio: number,
) {
  const cap = catalogPlan(planId).limits[limit]
  return cap === null ? null : Math.round(ratio * cap)
}

function eligible(ctx: PlayContext) {
  const { snapshot } = ctx
  let best: (PlayDecision & { stage: LimitStage; ratio: number }) | null = null
  for (const limit of P08_LIMITS) {
    const ratio = snapshot.limitPressure[limit]
    if (ratio === undefined || !Number.isFinite(ratio)) continue
    const used = usedFromPressure(snapshot.planId, limit, ratio)
    if (used === null) continue
    const decision = limitPressureDecision({
      planId: snapshot.planId,
      limit,
      used,
      now: ctx.now,
      checkoutAvailable: ctx.checkoutAvailable,
    })
    if (!decision) continue
    // Highest threshold first, then the fuller limit; P08_LIMITS order breaks ties.
    if (
      !best ||
      decision.stage > best.stage ||
      (decision.stage === best.stage && ratio > best.ratio + EPSILON)
    )
      best = { ...decision, ratio }
  }
  if (!best) return null
  const { stage: _stage, ratio: _ratio, ...decision } = best
  return decision
}

export const limitPressurePlay: LifecyclePlay = {
  id: "P08_limit",
  family: "revenue",
  // Below 100% this is an offer; each decision overrides it per threshold.
  consent: "offers",
  channels: ["in_app", "email"],
  realtime: true,
  eligible,
  success: {
    windowDays: 14,
    achieved: (sentOn, current) => upgradedSince(sentOn.planId, current.planId),
  },
}
