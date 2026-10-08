import {
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
  RETAIL_OPS_SUBSCRIPTION_PLANS,
  type RetailOpsPlanFeature,
  type RetailOpsSubscriptionPlan,
} from "@ewatrade/db/subscription-plans"
import { type CreateStoreCta, getCreateStoreCta } from "./create-store-url"

export const PLAN_FEATURE_LABELS: Record<RetailOpsPlanFeature, string> = {
  invoices: "Invoices",
  finance: "Finance",
  staff: "Staff accounts",
  suppliers: "Suppliers",
  advancedReports: "Advanced reports",
  multipleBusinesses: "More than one business",
}

const FEATURE_ORDER: RetailOpsPlanFeature[] = [
  "invoices",
  "finance",
  "staff",
  "suppliers",
  "advancedReports",
  "multipleBusinesses",
]

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("en-NG")} ${value === 1 ? one : many}`
}

export function formatReportHistory(days: number) {
  if (days >= 365 && days % 365 === 0)
    return `${count(days / 365, "year", "years")} of reports`
  if (days >= 60 && days % 30 === 0)
    return `${count(days / 30, "month", "months")} of reports`
  return `${count(days, "day", "days")} of reports`
}

export type PlanLimitLabel = { key: string; label: string }

export function getPlanLimitLabels(
  plan: Pick<RetailOpsSubscriptionPlan, "id" | "limits">,
): PlanLimitLabel[] {
  const { limits } = plan
  return [
    {
      key: "businesses",
      label: count(limits.businesses, "business", "businesses"),
    },
    {
      key: "products",
      label:
        plan.id === "free"
          ? count(limits.products, "catalog item", "catalog items")
          : "No product cap during launch",
    },
    {
      key: "staff",
      label:
        limits.staff === 0
          ? "Just you"
          : `You + ${count(limits.staff, "staff member", "staff")}`,
    },
    {
      key: "orders",
      label:
        limits.ordersPerMonth === null
          ? "Unlimited orders"
          : `${count(limits.ordersPerMonth, "order", "orders")} a month`,
    },
  ]
}

/** Human labels for features other plans include but this one leaves out. */
export function getMissingFeatureLabels(
  plan: Pick<RetailOpsSubscriptionPlan, "features">,
  plans: Pick<
    RetailOpsSubscriptionPlan,
    "features"
  >[] = RETAIL_OPS_SUBSCRIPTION_PLANS,
) {
  const offered = new Set(plans.flatMap((item) => item.features))
  const ordered = [
    ...FEATURE_ORDER,
    ...[...offered].filter((feature) => !FEATURE_ORDER.includes(feature)),
  ]
  return ordered
    .filter((feature) => offered.has(feature))
    .filter((feature) => !plan.features.includes(feature))
    .map((feature) => PLAN_FEATURE_LABELS[feature] ?? feature)
}

export function getPlanCta(
  plan: Pick<RetailOpsSubscriptionPlan, "id">,
  signupEnabled: boolean,
): CreateStoreCta {
  if (plan.id === "free" || plan.id === "starter")
    return getCreateStoreCta(signupEnabled)
  return { href: "/contact", label: "Talk to us", kind: "contact" }
}

export type PricingPlanView = {
  id: RetailOpsSubscriptionPlan["id"]
  name: string
  priceLabel: string
  description: string
  popular: boolean
  limits: PlanLimitLabel[]
  notIncluded: string[]
  cta: CreateStoreCta
}

export function getPricingPlans(
  signupEnabled: boolean,
  plans: RetailOpsSubscriptionPlan[] = RETAIL_OPS_SUBSCRIPTION_PLANS,
): PricingPlanView[] {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceLabel: plan.priceLabel,
    description:
      plan.id === "free"
        ? "For one owner. Products, services and drafts count toward your item limit."
        : plan.description,
    popular: plan.id === "growth",
    limits: getPlanLimitLabels(plan),
    notIncluded: getMissingFeatureLabels(plan, plans),
    cta: getPlanCta(plan, signupEnabled),
  }))
}

/** Name of the plan new businesses start on during launch. */
export function getLaunchDefaultPlanName(
  plans: RetailOpsSubscriptionPlan[] = RETAIL_OPS_SUBSCRIPTION_PLANS,
) {
  return (
    plans.find((plan) => plan.id === RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID)?.name ??
    "Starter"
  )
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

/** "Starter, Growth and Pro": every plan except Free. */
export function getPaidLaunchPlanNames(
  plans: RetailOpsSubscriptionPlan[] = RETAIL_OPS_SUBSCRIPTION_PLANS,
) {
  return joinNames(
    plans.filter((plan) => plan.id !== "free").map((plan) => plan.name),
  )
}
