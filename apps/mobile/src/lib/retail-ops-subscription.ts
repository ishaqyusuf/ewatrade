// Mirrors packages/db/src/queries/retail-ops-subscription-plans.ts (the Expo
// bundle cannot import @ewatrade/db). retail-ops-subscription.test.ts asserts
// both catalogues stay identical, so change them together.

export type RetailOpsPlanId = "free" | "starter" | "growth" | "pro"

export type RetailOpsPlanLimits = {
  businesses: number
  offlineDevices: number
  /** Commercial orders created per calendar month (UTC); null means unlimited. */
  ordersPerMonth: number | null
  products: number
  reportsHistoryDays: number
  staff: number
}

export type RetailOpsPlanFeature =
  | "advancedReports"
  | "finance"
  | "invoices"
  | "multipleBusinesses"
  | "staff"
  | "suppliers"

export type RetailOpsPlan = {
  description: string
  features: RetailOpsPlanFeature[]
  id: RetailOpsPlanId
  limits: RetailOpsPlanLimits
  name: string
  priceLabel: string
  supportLabel: string
}

export type RetailOpsSubscription = {
  businessId: string
  currentPeriodEndsAt?: string
  planId: RetailOpsPlanId
  status: "trialing" | "active" | "past_due" | "cancelled"
  trialEndsAt?: string
  updatedAt: string
}

const PAID_FEATURES: RetailOpsPlanFeature[] = [
  "advancedReports",
  "finance",
  "invoices",
  "multipleBusinesses",
  "staff",
  "suppliers",
]

export const RETAIL_OPS_PLANS: RetailOpsPlan[] = [
  {
    description: "For one owner selling a couple of products, free forever.",
    features: [],
    id: "free",
    limits: {
      businesses: 1,
      offlineDevices: 1,
      ordersPerMonth: 30,
      products: 2,
      reportsHistoryDays: 30,
      staff: 0,
    },
    name: "Free",
    priceLabel: "Free forever",
    supportLabel: "Community support",
  },
  {
    description: "For one shop starting with simple sales and stock tracking.",
    features: PAID_FEATURES,
    id: "starter",
    limits: {
      businesses: 1,
      offlineDevices: 1,
      ordersPerMonth: null,
      products: 25,
      reportsHistoryDays: 30,
      staff: 2,
    },
    name: "Starter",
    priceLabel: "Free during launch",
    supportLabel: "Standard support",
  },
  {
    description: "For growing teams that need more attendants and history.",
    features: PAID_FEATURES,
    id: "growth",
    limits: {
      businesses: 3,
      offlineDevices: 5,
      ordersPerMonth: null,
      products: 150,
      reportsHistoryDays: 180,
      staff: 10,
    },
    name: "Growth",
    priceLabel: "Free during launch",
    supportLabel: "Priority support",
  },
  {
    description: "For multi-branch businesses with heavier operations.",
    features: PAID_FEATURES,
    id: "pro",
    limits: {
      businesses: 10,
      offlineDevices: 20,
      ordersPerMonth: null,
      products: 500,
      reportsHistoryDays: 730,
      staff: 50,
    },
    name: "Pro",
    priceLabel: "Free during launch",
    supportLabel: "Dedicated support",
  },
]

/** Plan a new business starts on while paid billing is off (launch period). */
export const RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID: RetailOpsPlanId = "starter"

export function getPlan(planId: RetailOpsPlanId) {
  return (
    RETAIL_OPS_PLANS.find((plan) => plan.id === planId) ??
    (RETAIL_OPS_PLANS.find(
      (plan) => plan.id === RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
    ) as RetailOpsPlan)
  )
}

/** Local stand-in for the server's launch plan: Starter, free, no trial end. */
export function getDefaultSubscription(
  businessId: string,
  now: Date = new Date(),
): RetailOpsSubscription {
  return {
    businessId,
    planId: RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
    status: "active",
    updatedAt: now.toISOString(),
  }
}

export function getBusinessSubscription(
  subscriptions: Record<string, RetailOpsSubscription>,
  businessId: string | null | undefined,
) {
  const resolvedBusinessId = businessId || "local-business"

  return (
    subscriptions[resolvedBusinessId] ??
    getDefaultSubscription(resolvedBusinessId)
  )
}

export function getUsageLimitState(used: number, limit: number | null) {
  if (limit === null) {
    return { isAtLimit: false, label: `${used}` }
  }

  return {
    isAtLimit: used >= limit,
    label: `${used}/${limit}`,
  }
}
