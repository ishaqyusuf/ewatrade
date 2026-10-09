// @ts-expect-error Bun test runtime types are outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test"
import {
  RETAIL_OPS_SUBSCRIPTION_PLANS,
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID as SHARED_LAUNCH_DEFAULT_PLAN_ID,
} from "../../../../packages/db/src/queries/retail-ops-subscription-plans"
import {
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
  RETAIL_OPS_PLANS,
  getBusinessSubscription,
  getDefaultSubscription,
  getPlan,
  getUsageLimitState,
} from "./retail-ops-subscription"

describe("retail ops subscription helpers", () => {
  test("mirrors the shared server plan catalogue exactly", () => {
    expect(RETAIL_OPS_PLANS).toEqual(RETAIL_OPS_SUBSCRIPTION_PLANS)
    expect(RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID).toBe(
      SHARED_LAUNCH_DEFAULT_PLAN_ID,
    )
  })

  test("exposes Free below the three launch tiers", () => {
    expect(RETAIL_OPS_PLANS.map((plan) => plan.id)).toEqual([
      "free",
      "starter",
      "growth",
      "pro",
    ])
    expect(getPlan("free")).toMatchObject({
      features: [],
      limits: { ordersPerMonth: 30, products: 2, staff: 0 },
      priceLabel: "Free forever",
    })
    expect(getPlan("starter").limits.ordersPerMonth).toBeNull()
    expect(getPlan("starter").priceLabel).toBe("Free during launch")
    expect(getPlan("starter").limits).toMatchObject({
      businesses: 1,
      offlineDevices: 1,
      products: 25,
      staff: 2,
    })
    expect(getPlan("growth").limits.staff).toBeGreaterThan(
      getPlan("starter").limits.staff,
    )
    expect(getPlan("pro").limits.products).toBeGreaterThan(
      getPlan("growth").limits.products,
    )
  })

  test("defaults to the launch Starter plan without a trial end", () => {
    const now = new Date("2026-07-12T09:00:00.000Z")
    const subscription = getDefaultSubscription("business-1", now)

    expect(subscription).toEqual({
      businessId: "business-1",
      planId: "starter",
      status: "active",
      updatedAt: "2026-07-12T09:00:00.000Z",
    })
  })

  test("resolves business subscriptions with local-business fallback", () => {
    const existing = {
      "business-1": {
        businessId: "business-1",
        planId: "growth" as const,
        status: "active" as const,
        updatedAt: "2026-07-12T09:00:00.000Z",
      },
    }

    expect(getBusinessSubscription(existing, "business-1")).toBe(
      existing["business-1"],
    )
    expect(getBusinessSubscription({}, null)).toMatchObject({
      businessId: "local-business",
      planId: "starter",
      status: "active",
    })
  })

  test("reports usage limit labels and at-limit state", () => {
    expect(getUsageLimitState(1, 2)).toEqual({
      isAtLimit: false,
      label: "1/2",
    })
    expect(getUsageLimitState(2, 2)).toEqual({
      isAtLimit: true,
      label: "2/2",
    })
    expect(getUsageLimitState(3, 2)).toEqual({
      isAtLimit: true,
      label: "3/2",
    })
    expect(getUsageLimitState(400, null)).toEqual({
      isAtLimit: false,
      label: "400",
    })
  })
})
