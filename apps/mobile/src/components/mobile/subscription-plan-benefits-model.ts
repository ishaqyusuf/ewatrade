import type { IconKeys } from "@/components/ui/icon"
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
} from "@/lib/retail-ops-subscription"

export type PlanBenefitRow = {
  key: string
  label: string
  value?: string
  note?: string
  added?: boolean
}
export type PlanBenefitGroup = {
  key: string
  title: string
  icon: IconKeys
  rows: PlanBenefitRow[]
}

export function getUpgradePlans(current: RetailOpsPlanId | null) {
  const index = RETAIL_OPS_PLANS.findIndex((plan) => plan.id === current)
  return index < 0 ? [] : RETAIL_OPS_PLANS.slice(index + 1)
}

/** Only shorten a complete simple monthly term; preserve phased/translated offers. */
export function formatPlanBillingDisclosure(disclosure: string | null) {
  return disclosure && !disclosure.includes(", then ")
    ? disclosure.replace(/ every 1 month$/, " per month")
    : disclosure
}

export function getPlanSummary(plan: RetailOpsPlan) {
  if (plan.id === "free") return "Sales and stock for one owner."
  const { businesses, staff, products } = plan.limits
  if (plan.features.includes("customerMessages"))
    return `Up to ${businesses} businesses, ${staff} staff and ${products === null ? "no catalog item limit" : "customer messages"}.`
  return "Invoices, finance and staff roles for one business."
}

export function getPlanBenefitGroups(
  plan: RetailOpsPlan,
  current: RetailOpsPlan | null,
): PlanBenefitGroup[] {
  const n = (value: number | null) =>
    value === null ? "Unlimited" : value.toLocaleString()
  const capacity = (
    key: keyof RetailOpsPlan["limits"],
    label: string,
    value: string,
    note?: string,
  ): PlanBenefitRow => ({
    key,
    label,
    value,
    note,
    added: current ? current.limits[key] !== plan.limits[key] : false,
  })
  const includes = (feature: RetailOpsPlan["features"][number]) =>
    plan.features.includes(feature)
  const feature = (
    key: RetailOpsPlan["features"][number],
    label: string,
  ): PlanBenefitRow[] =>
    includes(key)
      ? [
          {
            key: `feature:${key}`,
            label,
            added: current ? !current.features.includes(key) : false,
          },
        ]
      : []
  return [
    {
      key: "capacity",
      title: "Capacity",
      icon: "Package",
      rows: [
        capacity("businesses", "Businesses", n(plan.limits.businesses)),
        capacity("products", "Catalog items", n(plan.limits.products)),
        capacity(
          "ordersPerMonth",
          "Monthly orders",
          n(plan.limits.ordersPerMonth),
        ),
        capacity(
          "storefrontItems",
          "Storefront",
          plan.limits.storefrontItems === null
            ? "Full catalog"
            : `${n(plan.limits.storefrontItems)} items`,
        ),
      ],
    },
    {
      key: "team",
      title: "Team and devices",
      icon: "Users",
      rows: [
        capacity(
          "staff",
          "Staff",
          plan.limits.staff === 0 ? "Just you" : n(plan.limits.staff),
        ),
        capacity(
          "offlineDevices",
          "Offline sales",
          `${plan.limits.offlineDevices} ${plan.limits.offlineDevices === 1 ? "device" : "devices"}`,
          "Coming soon",
        ),
        ...feature("staff", "Staff accounts & roles"),
      ],
    },
    {
      key: "selling",
      title: "Selling",
      icon: "Store",
      rows: [
        { key: "sales", label: "Sales, orders, stock and customer balances" },
        { key: "received", label: "Sales for money received" },
        ...feature("attachments", "Photos, videos and documents"),
        ...feature("orderReminders", "Order reminder emails"),
        ...feature("customerMessages", "Customer messages"),
      ],
    },
    {
      key: "money",
      title: "Money and reports",
      icon: "BarChart3",
      rows: [
        capacity(
          "reportsHistoryDays",
          "Report history",
          `${n(plan.limits.reportsHistoryDays)} days`,
        ),
        ...(includes("invoices") && includes("finance")
          ? feature("finance", "Invoices and finance")
          : [
              ...feature("invoices", "Invoices"),
              ...feature("finance", "Finance"),
            ]),
        ...feature("suppliers", "Expenses and suppliers"),
        ...feature("advancedReports", "Advanced reports"),
      ],
    },
    {
      key: "help",
      title: "Help",
      icon: "MessageCircle",
      rows: [
        {
          key: "support",
          label: "Support",
          value: plan.supportLabel.replace(/ support$/, ""),
          added: current ? current.supportLabel !== plan.supportLabel : false,
        },
        { key: "assistant", label: "Monthly assistant questions & drafts" },
      ],
    },
  ]
}
