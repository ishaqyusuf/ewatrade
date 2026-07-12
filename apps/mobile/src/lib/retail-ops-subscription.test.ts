// @ts-expect-error Bun test runtime types are outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test"
import {
  RETAIL_OPS_PLANS,
  getBusinessSubscription,
  getDefaultSubscription,
  getPlan,
  getUsageLimitState,
} from "./retail-ops-subscription"

describe("retail ops subscription helpers", () => {
  test("exposes the three MVP subscription tiers in order", () => {
    expect(RETAIL_OPS_PLANS.map((plan) => plan.id)).toEqual([
      "starter",
      "growth",
      "pro",
    ])
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

  test("creates a deterministic local default trial subscription", () => {
    const now = new Date("2026-07-12T09:00:00.000Z")
    const subscription = getDefaultSubscription("business-1", now)

    expect(subscription).toMatchObject({
      businessId: "business-1",
      planId: "starter",
      status: "trialing",
      updatedAt: "2026-07-12T09:00:00.000Z",
    })
    expect(subscription.trialEndsAt).toBe("2026-07-26T09:00:00.000Z")
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
      status: "trialing",
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
  })
})
