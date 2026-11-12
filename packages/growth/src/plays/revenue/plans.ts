// Plan catalogue helpers shared by the revenue plays (W3).
// The catalogue itself lives in @ewatrade/db/subscription-plans (pure data);
// these helpers only pick from it, so prices and limits never drift.

import {
  RETAIL_OPS_PLAN_FEATURE_LABELS,
  RETAIL_OPS_SUBSCRIPTION_PLANS,
  type RetailOpsPlanFeature,
  type RetailOpsPlanLimits,
  type RetailOpsSubscriptionPlan,
} from "@ewatrade/db/subscription-plans"
import type { GrowthPlanId, PlayId } from "../../contract"

export const PLAN_BILLING_PATH = "/settings/billing"
export const TELEGRAM_CONNECT_PATH = "/account/telegram"
export const ADD_BUSINESS_PATH = "/settings/stores"

export function planRank(planId: GrowthPlanId) {
  return RETAIL_OPS_SUBSCRIPTION_PLANS.findIndex((plan) => plan.id === planId)
}

export function catalogPlan(planId: GrowthPlanId): RetailOpsSubscriptionPlan {
  const plan = RETAIL_OPS_SUBSCRIPTION_PLANS[planRank(planId)]
  if (!plan) throw new Error(`Unknown plan ${planId}`)
  return plan
}

/** The plan straight after this one, or null on the top plan. */
export function nextPlan(planId: GrowthPlanId) {
  return RETAIL_OPS_SUBSCRIPTION_PLANS[planRank(planId) + 1] ?? null
}

/** True once the business moved to a higher plan than it had at send time. */
export function upgradedSince(sentOn: GrowthPlanId, current: GrowthPlanId) {
  return planRank(current) > planRank(sentOn)
}

/**
 * The smallest plan above `current` whose `limit` leaves room for one more
 * than `used`. Never skips a tier that would do: Free at the order cap gets
 * Starter, not Pro. Null when no higher plan lifts the limit.
 */
export function smallestPlanAbove(
  current: GrowthPlanId,
  limit: keyof RetailOpsPlanLimits,
  used: number,
) {
  return (
    RETAIL_OPS_SUBSCRIPTION_PLANS.slice(planRank(current) + 1).find((plan) => {
      const value = plan.limits[limit]
      return value === null || value > used
    }) ?? null
  )
}

/** The smallest plan above `current` that includes `feature`. */
export function smallestPlanWithFeature(
  current: GrowthPlanId,
  feature: RetailOpsPlanFeature,
) {
  return (
    RETAIL_OPS_SUBSCRIPTION_PLANS.slice(planRank(current) + 1).find((plan) =>
      plan.features.includes(feature),
    ) ?? null
  )
}

export function isPlanFeature(value: string): value is RetailOpsPlanFeature {
  return value in RETAIL_OPS_PLAN_FEATURE_LABELS
}

/**
 * Where an upgrade CTA goes. With checkout live, Plan and billing opens with
 * the recommended plan preselected; otherwise it opens Plan and billing as is,
 * so the email never promises a button that cannot take payment.
 */
export function upgradeCta(input: {
  plan: RetailOpsSubscriptionPlan
  checkoutAvailable: boolean
  playId: PlayId
}) {
  if (!input.checkoutAvailable)
    return { ctaPath: PLAN_BILLING_PATH, ctaLabel: "See plans" }
  const query = new URLSearchParams({ plan: input.plan.id, from: input.playId })
  return {
    ctaPath: `${PLAN_BILLING_PATH}?${query}`,
    ctaLabel: `Upgrade to ${input.plan.name}`,
  }
}

/** Template data every upgrade email shares. */
export function recommendedPlanData(
  plan: RetailOpsSubscriptionPlan,
  checkoutAvailable: boolean,
) {
  return {
    recommendedPlanId: plan.id,
    recommendedPlanName: plan.name,
    recommendedPriceLabel: plan.priceLabel,
    checkoutAvailable,
  }
}

const LIMIT_NOUNS: Record<keyof RetailOpsPlanLimits, [string, string]> = {
  storefrontItems: ["site item", "site items"],
  businesses: ["business", "businesses"],
  offlineDevices: ["offline device", "offline devices"],
  ordersPerMonth: ["order a month", "orders a month"],
  products: ["product", "products"],
  reportsHistoryDays: ["day of reports", "days of reports"],
  staff: ["staff account", "staff accounts"],
}

export function limitNoun(limit: keyof RetailOpsPlanLimits, count: number) {
  const [one, many] = LIMIT_NOUNS[limit]
  return count === 1 ? one : many
}

/** "100 products", "unlimited orders a month". */
export function limitLabel(
  limit: keyof RetailOpsPlanLimits,
  value: number | null,
) {
  if (value === null) return `unlimited ${LIMIT_NOUNS[limit][1]}`
  return `${value.toLocaleString("en-NG")} ${limitNoun(limit, value)}`
}

const PITCH_LIMITS: (keyof RetailOpsPlanLimits)[] = [
  "ordersPerMonth",
  "products",
  "staff",
  "businesses",
  "reportsHistoryDays",
]

/**
 * One line on what the next plan adds, from the catalogue: up to three limit
 * raises, then any new features. "Growth adds 1,000 products, 10 staff
 * accounts and 3 businesses, plus customer messages."
 */
export function nextPlanPitch(current: GrowthPlanId) {
  const from = catalogPlan(current)
  const to = nextPlan(current)
  if (!to) return null
  const raises = PITCH_LIMITS.filter((key) => {
    const before = from.limits[key]
    const after = to.limits[key]
    return before !== null && (after === null || after > before)
  })
    .slice(0, 3)
    .map((key) => limitLabel(key, to.limits[key]))
  const added = to.features
    .filter((feature) => !from.features.includes(feature))
    .map((feature) => RETAIL_OPS_PLAN_FEATURE_LABELS[feature].toLowerCase())
  const features =
    added.length > 2 ? "every paid feature" : joinList(added) || ""
  const pitch = joinList(raises)
  return {
    plan: to,
    line: `${to.name} adds ${pitch}${features ? `, plus ${features}` : ""}.`,
  }
}

export function joinList(items: readonly string[]) {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** "₦1,250,000" from integer minor units. */
export function formatMoney(minor: bigint, currencyCode: string) {
  const major = Number(minor / BigInt(100))
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(major)
  } catch {
    return `${currencyCode} ${major.toLocaleString("en-NG")}`
  }
}

/** "1 Dec": the first day of the month after `now`, in UTC. */
export function nextMonthStartLabel(now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  )
  return start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}
