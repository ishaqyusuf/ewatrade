// Plan catalogue shared by the API, dashboard, mobile and marketing pricing.
// Pure data: safe to import from client components (no Prisma imports).

export type RetailOpsPlanId = "free" | "starter" | "growth" | "pro"

/** Plans that can be bought through the App Store or Google Play; never Free. */
export type RetailOpsPaidPlanId = Exclude<RetailOpsPlanId, "free">

export type RetailOpsPlanLimits = {
  businesses: number
  offlineDevices: number
  /** Commercial orders created per calendar month; null means unlimited. */
  ordersPerMonth: number | null
  products: number
  reportsHistoryDays: number
  staff: number
}

/** Paid-tier capabilities the Free plan leaves out. */
export type RetailOpsPlanFeature =
  | "advancedReports"
  | "finance"
  | "invoices"
  | "multipleBusinesses"
  | "staff"
  | "suppliers"

export type RetailOpsSubscriptionPlan = {
  description: string
  features: RetailOpsPlanFeature[]
  id: RetailOpsPlanId
  limits: RetailOpsPlanLimits
  name: string
  priceLabel: string
  supportLabel: string
}

const PAID_FEATURES: RetailOpsPlanFeature[] = [
  "advancedReports",
  "finance",
  "invoices",
  "multipleBusinesses",
  "staff",
  "suppliers",
]

export const RETAIL_OPS_SUBSCRIPTION_PLANS: RetailOpsSubscriptionPlan[] = [
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

export const RETAIL_OPS_PLAN_IDS: RetailOpsPlanId[] =
  RETAIL_OPS_SUBSCRIPTION_PLANS.map((plan) => plan.id)

/** Short names for plan cards; "invoices" are Order receipts in the product. */
export const RETAIL_OPS_PLAN_FEATURE_LABELS: Record<
  RetailOpsPlanFeature,
  string
> = {
  advancedReports: "Advanced reports",
  finance: "Finance",
  invoices: "Receipts and invoices",
  multipleBusinesses: "More than one business",
  staff: "Staff accounts",
  suppliers: "Suppliers and purchases",
}

/** Completes "Upgrade from Free to …" in server errors and locked UI. */
export const RETAIL_OPS_PLAN_FEATURE_ACTIONS: Record<
  RetailOpsPlanFeature,
  string
> = {
  advancedReports: "use advanced reports",
  finance: "use finance",
  invoices: "generate receipts",
  multipleBusinesses: "add another business",
  staff: "add staff",
  suppliers: "manage suppliers and purchases",
}

export function isRetailOpsPlanId(value: unknown): value is RetailOpsPlanId {
  return RETAIL_OPS_PLAN_IDS.includes(value as RetailOpsPlanId)
}

export function findRetailOpsPlan(planId: RetailOpsPlanId) {
  return RETAIL_OPS_SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)
}

export function planHasFeature(
  plan: Pick<RetailOpsSubscriptionPlan, "features">,
  feature: RetailOpsPlanFeature,
) {
  return plan.features.includes(feature)
}

export function getRetailOpsPlanFeatureUpgradeMessage(
  plan: Pick<RetailOpsSubscriptionPlan, "name">,
  feature: RetailOpsPlanFeature,
) {
  return `Upgrade from ${plan.name} to ${RETAIL_OPS_PLAN_FEATURE_ACTIONS[feature]}.`
}

/**
 * Monthly order caps count calendar months in UTC, so every API region and
 * device agrees on when the allowance resets.
 */
export function getRetailOpsOrderPeriodStart(now: Date = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
