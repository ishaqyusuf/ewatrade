// P09 Tier upgrade: success milestones.
// The owner is in a good mood and can see the value: lead with their numbers,
// then one line on what the next plan adds.

import {
  type LifecyclePlay,
  type PlayContext,
  type PlayDecision,
  monthKey,
} from "../../contract"
import {
  formatMoney,
  nextPlanPitch,
  recommendedPlanData,
  upgradeCta,
  upgradedSince,
} from "./plans"

export const ORDER_MILESTONE = 100
/** Months of history needed before "best month" means something. */
export const BEST_MONTH_MIN_PRIOR_MONTHS = 2
/** Months of history needed before a median is a fair baseline. */
export const MEDIAN_MIN_PRIOR_MONTHS = 3
export const SALES_MULTIPLE = 3

export type SuccessMilestone = "orders_100" | "sales_3x" | "best_month"

/**
 * Today's milestone, if any. The 100th order counts only in the week it was
 * crossed, so long-running businesses are not congratulated late.
 */
export function successMilestone(ctx: PlayContext): SuccessMilestone | null {
  const { snapshot, salesHistory } = ctx
  if (
    snapshot.ordersTotal >= ORDER_MILESTONE &&
    snapshot.ordersTotal - snapshot.ordersLast7 < ORDER_MILESTONE
  )
    return "orders_100"
  if (!salesHistory) return null
  const sales = snapshot.salesMinorThisMonth
  if (
    salesHistory.priorMonths >= MEDIAN_MIN_PRIOR_MONTHS &&
    salesHistory.medianPriorMonthMinor > BigInt(0) &&
    sales >= salesHistory.medianPriorMonthMinor * BigInt(SALES_MULTIPLE)
  )
    return "sales_3x"
  if (
    salesHistory.priorMonths >= BEST_MONTH_MIN_PRIOR_MONTHS &&
    salesHistory.bestPriorMonthMinor > BigInt(0) &&
    sales > salesHistory.bestPriorMonthMinor
  )
    return "best_month"
  return null
}

function eligible(ctx: PlayContext): PlayDecision | null {
  const { snapshot } = ctx
  const pitch = nextPlanPitch(snapshot.planId)
  if (!pitch) return null
  const milestone = successMilestone(ctx)
  if (!milestone) return null
  const { ctaPath, ctaLabel } = upgradeCta({
    plan: pitch.plan,
    checkoutAvailable: ctx.checkoutAvailable,
    playId: "P09_success",
  })
  const money = (minor: bigint) => formatMoney(minor, snapshot.currencyCode)
  return {
    // The order milestone happens once; sales milestones share one message a month.
    periodKey:
      milestone === "orders_100" ? "orders_100" : `sales:${monthKey(ctx.now)}`,
    templateKey: "lifecycle-success-milestone",
    ctaPath,
    data: {
      milestone,
      ordersTotal: snapshot.ordersTotal,
      ordersThisMonth: snapshot.ordersThisMonth,
      salesThisMonth: money(snapshot.salesMinorThisMonth),
      bestPriorMonth: ctx.salesHistory
        ? money(ctx.salesHistory.bestPriorMonthMinor)
        : null,
      usualMonth: ctx.salesHistory
        ? money(ctx.salesHistory.medianPriorMonthMinor)
        : null,
      nextPlanLine: pitch.line,
      ctaLabel,
      ...recommendedPlanData(pitch.plan, ctx.checkoutAvailable),
    },
  }
}

export const successMilestonePlay: LifecyclePlay = {
  id: "P09_success",
  family: "revenue",
  consent: "offers",
  channels: ["email"],
  realtime: false,
  eligible,
  success: {
    windowDays: 14,
    achieved: (sentOn, current) => upgradedSince(sentOn.planId, current.planId),
  },
}
