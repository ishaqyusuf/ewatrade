import type { RetailOpsPlanId } from "../retail-ops-subscription-plans"

/** Approved paid-launch offer. Not the active legacy catalog or a cutover flag. */
export const OWNER_BILLING_OFFERS = {
  free: {
    monthlyPriceMinor: 0,
    businesses: 1,
    products: 10,
    ordersPerMonth: 50,
    staff: 0,
  },
  starter: {
    monthlyPriceMinor: 500_000,
    businesses: 1,
    products: 100,
    ordersPerMonth: null,
    staff: 2,
  },
  growth: {
    monthlyPriceMinor: 1_500_000,
    businesses: 3,
    products: 1_000,
    ordersPerMonth: null,
    staff: 10,
  },
  pro: {
    monthlyPriceMinor: 3_000_000,
    businesses: 10,
    products: null,
    ordersPerMonth: null,
    staff: 50,
  },
} as const satisfies Record<
  RetailOpsPlanId,
  {
    monthlyPriceMinor: number
    businesses: number
    products: number | null
    ordersPerMonth: number | null
    staff: number
  }
>

// The owner approved separate allowances for each covered Tenant, 27 October.
export const OWNER_BILLING_QUOTA_SCOPE = "business" as const
