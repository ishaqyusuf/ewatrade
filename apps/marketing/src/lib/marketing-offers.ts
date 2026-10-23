import { getCreateStoreCta } from "./create-store-url"

// Approved marketing offer. Runtime entitlements/billing are owned by the separately reviewed pricing rollout.
export const MARKETING_OFFERS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "For one owner getting started.",
    businesses: 1,
    items: 10,
    orders: 50,
    staff: 0,
    included: [
      "Sales, orders, stock and customer balances",
      "Simple sales for money received",
      "Public storefront, up to 10 items",
      "Mobile app with offline sales",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 5000,
    description: "For one shop with a small team.",
    businesses: 1,
    items: 100,
    orders: null,
    staff: 2,
    included: [
      "Storefront shows your full catalog",
      "Invoices and finance",
      "Expenses and suppliers",
      "Staff accounts with roles",
      "Photos, videos and documents",
      "Advanced reports",
      "Order reminder emails",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 15000,
    description: "For growing teams and more than one business.",
    businesses: 3,
    items: 1000,
    orders: null,
    staff: 10,
    included: [
      "Customer messages",
      "Offline sales on 5 devices",
      "Priority support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 30000,
    description: "For multi-branch businesses with heavier operations.",
    businesses: 10,
    items: null,
    orders: null,
    staff: 50,
    included: ["Offline sales on 20 devices", "Dedicated support"],
  },
] as const
export type MarketingPlanId = (typeof MARKETING_OFFERS)[number]["id"]
export function getMarketingPlanCta(
  id: MarketingPlanId,
  signupEnabled: boolean,
) {
  if (id === "free") {
    const cta = getCreateStoreCta(signupEnabled)
    return { ...cta, label: signupEnabled ? "Start free" : cta.label }
  }
  return {
    href: "/contact",
    kind: "contact" as const,
    label: `Choose ${MARKETING_OFFERS.find((p) => p.id === id)?.name ?? id}`,
  }
}
