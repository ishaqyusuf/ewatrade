import { describe, expect, test } from "bun:test"
import { getPlan } from "@/lib/retail-ops-subscription"
import {
  SUBSCRIPTION_SCREEN_COPY,
  getSubscriptionPlanPresentation,
  getSubscriptionStatusTone,
  getSubscriptionUsagePresentation,
} from "./subscription-plan-presentation"

describe("subscription plan presentation", () => {
  test("uses one concise Plan and billing title and purpose", () => {
    expect(SUBSCRIPTION_SCREEN_COPY).toEqual({
      description: "See your limits and compare plans for this business.",
      title: "Plan & billing",
    })
  })

  test("calls out a reached usage limit without hiding the exact count", () => {
    expect(getSubscriptionUsagePresentation(1, 1)).toEqual({
      isAtLimit: true,
      statusLabel: "At limit",
      valueLabel: "1 / 1",
    })
  })

  test("keeps the current plan informational", () => {
    expect(
      getSubscriptionPlanPresentation({
        canRequestCheckout: true,
        currentPlanId: "starter",
        isCheckoutPending: false,
        plan: getPlan("starter"),
      }),
    ).toMatchObject({
      actionLabel: null,
      badgeLabel: "Current",
      canSelect: false,
      current: true,
    })
  })

  test("keeps an eligible noncurrent plan available for upgrade", () => {
    expect(
      getSubscriptionPlanPresentation({
        canRequestCheckout: true,
        currentPlanId: "starter",
        isCheckoutPending: false,
        plan: getPlan("growth"),
      }),
    ).toMatchObject({
      actionLabel: "Request upgrade",
      badgeLabel: "Most popular",
      canSelect: true,
      current: false,
    })
  })

  test("does not present a cancelled subscription as healthy", () => {
    expect(getSubscriptionStatusTone("cancelled")).toBe("destructive")
    expect(getSubscriptionStatusTone("past_due")).toBe("warning")
    expect(getSubscriptionStatusTone("active")).toBe("success")
  })
})
