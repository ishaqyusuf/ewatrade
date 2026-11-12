// P16 Feature intent: one email, 24h after the third "See plans" tap on the
// locked-feature sheets (attachments, finance, customer messages, …).
//
// Source: W4's first-party tap counter (`GrowthFeatureIntent`, per business,
// feature label and month), not Logly. Logly is ingest-only: dashboard events
// leave through the analytics outbox and are erased once delivered, and
// mobile sends straight to the collector, so the server cannot count them.
// The engine fills `PlayContext.featureIntent` from that counter:
//   taps       = lock-sheet taps over the current and previous month
//   thirdTapAt = latest tap once taps >= 3 (so the wait is >= 24h after the third)
//   features   = intent labels, most recent first
// Labels are W4's GROWTH_INTENT_FEATURES (packages/events/src/growth-intent.ts);
// catalogue feature keys are accepted too.

import {
  RETAIL_OPS_PLAN_FEATURE_LABELS,
  type RetailOpsPlanFeature,
  type RetailOpsSubscriptionPlan,
} from "@ewatrade/db/subscription-plans"
import type { FeatureIntentSummary, GrowthPlanId } from "../../contract"
import type { LifecyclePlay, PlayContext, PlayDecision } from "../../contract"
import {
  catalogPlan,
  isPlanFeature,
  recommendedPlanData,
  smallestPlanWithFeature,
  upgradeCta,
  upgradedSince,
} from "./plans"

export const FEATURE_INTENT_TAPS = 3
export const FEATURE_INTENT_DELAY_MS = 24 * 60 * 60 * 1000
/** Past this, the intent is stale: never email weeks after the taps. */
export const FEATURE_INTENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Intent labels that come from a locked-feature sheet, mapped to the plan
 * feature that unlocks them. Limit labels (products, orders, storefront) are
 * P08's job and are ignored here. Payment alerts are gated by the operator's
 * payment-notification policy, not a catalogue feature, so they point at the
 * first paid plan.
 */
const INTENT_LABEL_FEATURES: Record<
  string,
  RetailOpsPlanFeature | "first_paid_plan"
> = {
  attachments: "attachments",
  staff: "staff",
  businesses: "multipleBusinesses",
  stores: "multipleBusinesses",
  finance: "finance",
  customer_messages: "customerMessages",
  suppliers: "suppliers",
  invoices: "invoices",
  receipts: "invoices",
  advanced_reports: "advancedReports",
  order_reminders: "orderReminders",
  payment_alerts: "first_paid_plan",
}

type IntentTarget = {
  label: string
  plan: RetailOpsSubscriptionPlan
}

/** The plan that unlocks a tapped label for this business, or null. */
export function intentTarget(
  planId: GrowthPlanId,
  label: string,
): IntentTarget | null {
  const current = catalogPlan(planId)
  const mapped = isPlanFeature(label) ? label : INTENT_LABEL_FEATURES[label]
  if (!mapped) return null
  if (mapped === "first_paid_plan") {
    if (planId !== "free") return null
    return { label: "Payment alerts", plan: catalogPlan("starter") }
  }
  if (current.features.includes(mapped)) return null
  const plan = smallestPlanWithFeature(planId, mapped)
  return plan ? { label: RETAIL_OPS_PLAN_FEATURE_LABELS[mapped], plan } : null
}

/**
 * Build `PlayContext.featureIntent` from W4's counter rows
 * (`featureIntentTapsForTenant` in @ewatrade/db/growth-intent, this month).
 * Only labels that a plan unlocks count toward the three taps.
 */
export function featureIntentSummaryFromTaps(
  rows: readonly { feature: string; taps: number; lastAt: Date }[],
): FeatureIntentSummary | null {
  const counted = rows
    .filter(
      (row) =>
        isPlanFeature(row.feature) || row.feature in INTENT_LABEL_FEATURES,
    )
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
  if (counted.length === 0) return null
  const taps = counted.reduce((sum, row) => sum + row.taps, 0)
  return {
    taps,
    // Rows keep only the latest tap; waiting from it is >= 24h after the third.
    thirdTapAt:
      taps >= FEATURE_INTENT_TAPS ? (counted[0]?.lastAt ?? null) : null,
    features: counted.map((row) => row.feature),
  }
}

function eligible(ctx: PlayContext): PlayDecision | null {
  const intent = ctx.featureIntent
  if (!intent || intent.taps < FEATURE_INTENT_TAPS || !intent.thirdTapAt)
    return null
  const age = ctx.now.getTime() - intent.thirdTapAt.getTime()
  if (age < FEATURE_INTENT_DELAY_MS || age > FEATURE_INTENT_MAX_AGE_MS)
    return null
  const current = catalogPlan(ctx.snapshot.planId)
  // The most recent tapped label the plan still lacks; none = already unlocked.
  let feature: string | null = null
  let target: IntentTarget | null = null
  for (const label of intent.features) {
    target = intentTarget(ctx.snapshot.planId, label)
    if (target) {
      feature = label
      break
    }
  }
  if (!feature || !target) return null
  const recommended = target.plan
  const { ctaPath, ctaLabel } = upgradeCta({
    plan: recommended,
    checkoutAvailable: ctx.checkoutAvailable,
    playId: "P16_feature_intent",
  })
  return {
    periodKey: "once",
    templateKey: "lifecycle-feature-intent",
    ctaPath,
    data: {
      feature,
      featureLabel: target.label,
      taps: intent.taps,
      planName: current.name,
      ctaLabel,
      ...recommendedPlanData(recommended, ctx.checkoutAvailable),
    },
  }
}

export const featureIntentPlay: LifecyclePlay = {
  id: "P16_feature_intent",
  family: "revenue",
  consent: "offers",
  channels: ["email"],
  realtime: false,
  eligible,
  success: {
    windowDays: 7,
    achieved: (sentOn, current) => upgradedSince(sentOn.planId, current.planId),
  },
}
