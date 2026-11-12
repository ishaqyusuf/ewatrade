// P12 Second business: "Run your second shop from the same account."
// Trigger: one business doing about two stores' worth of orders. A typical
// busy single shop records ~50 orders a week, so 100 in the last 7 days is
// the bar. Tune SECOND_BUSINESS_WEEKLY_ORDERS from the scorecard.
// The plan's other trigger (the owner asks the assistant about another shop)
// needs an assistant signal the snapshot does not carry yet.

import type { LifecyclePlay, PlayContext, PlayDecision } from "../../contract"
import {
  ADD_BUSINESS_PATH,
  catalogPlan,
  recommendedPlanData,
  smallestPlanAbove,
  upgradeCta,
} from "./plans"

export const SECOND_BUSINESS_WEEKLY_ORDERS = 100
const SETTLED_STAGES = new Set(["habit", "expanding", "paying"])

function eligible(ctx: PlayContext): PlayDecision | null {
  const { snapshot } = ctx
  if (snapshot.businessesOwned !== 1) return null
  if (!SETTLED_STAGES.has(snapshot.stage)) return null
  if (snapshot.ordersLast7 < SECOND_BUSINESS_WEEKLY_ORDERS) return null
  const current = catalogPlan(snapshot.planId)
  const shared = {
    periodKey: "once",
    templateKey: "lifecycle-second-business",
  }
  const base = {
    ordersLast7: snapshot.ordersLast7,
    planName: current.name,
  }
  // Growth and Pro already allow more than one business: no upgrade needed.
  if (current.limits.businesses >= 2)
    return {
      ...shared,
      consent: "productTips",
      ctaPath: ADD_BUSINESS_PATH,
      data: {
        ...base,
        needsUpgrade: false,
        ctaLabel: "Add a business",
        businessesIncluded: current.limits.businesses,
      },
    }
  const recommended = smallestPlanAbove(snapshot.planId, "businesses", 1)
  if (!recommended) return null
  const { ctaPath, ctaLabel } = upgradeCta({
    plan: recommended,
    checkoutAvailable: ctx.checkoutAvailable,
    playId: "P12_second_business",
  })
  return {
    ...shared,
    ctaPath,
    data: {
      ...base,
      needsUpgrade: true,
      ctaLabel,
      businessesIncluded: recommended.limits.businesses,
      ...recommendedPlanData(recommended, ctx.checkoutAvailable),
    },
  }
}

export const secondBusinessPlay: LifecyclePlay = {
  id: "P12_second_business",
  family: "revenue",
  consent: "offers",
  channels: ["email"],
  realtime: false,
  eligible,
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.businessesOwned >= 2,
  },
}
