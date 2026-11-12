// P16 Feature intent: one email, 24h after the third "See plans" tap on the
// locked-feature sheets (attachments, finance, customer messages, …).
//
// Source: a server-side tap counter (`FeatureIntentTap`), not Logly. Logly
// events leave through the analytics outbox and are erased once delivered,
// and mobile sends straight to the collector, so the server cannot count
// them per business. The engine loads `PlayContext.featureIntent` from the
// counter (`getFeatureIntentSummaries` in @ewatrade/db).

import { RETAIL_OPS_PLAN_FEATURE_LABELS } from "@ewatrade/db/subscription-plans"
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

function eligible(ctx: PlayContext): PlayDecision | null {
  const intent = ctx.featureIntent
  if (!intent || intent.taps < FEATURE_INTENT_TAPS || !intent.thirdTapAt)
    return null
  const age = ctx.now.getTime() - intent.thirdTapAt.getTime()
  if (age < FEATURE_INTENT_DELAY_MS || age > FEATURE_INTENT_MAX_AGE_MS)
    return null
  const current = catalogPlan(ctx.snapshot.planId)
  // The most recent tapped feature the plan still lacks; none = already unlocked.
  const feature = intent.features
    .filter(isPlanFeature)
    .find((key) => !current.features.includes(key))
  if (!feature) return null
  const recommended = smallestPlanWithFeature(ctx.snapshot.planId, feature)
  if (!recommended) return null
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
      featureLabel: RETAIL_OPS_PLAN_FEATURE_LABELS[feature],
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
