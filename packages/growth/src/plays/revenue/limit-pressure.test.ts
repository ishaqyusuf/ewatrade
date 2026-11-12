import { describe, expect, test } from "bun:test"
import { makeContext } from "../../fixtures"
import {
  limitPressureDecision,
  limitPressurePlay,
  limitStage,
} from "./limit-pressure"

const now = new Date("2026-11-12T10:00:00Z")

describe("P08 limit stage boundaries", () => {
  test.each([
    [79, null],
    [80, 80],
    [89, 80],
    [90, 90],
    [99, 90],
    [100, 100],
    [120, 100],
  ] as const)("%i of 100 → %p", (used, stage) => {
    expect(limitStage(used, 100)).toBe(stage)
  })

  test("ratios that are not exact in floating point still land on the threshold", () => {
    expect(limitStage(40, 50)).toBe(80)
    expect(limitStage(45, 50)).toBe(90)
    expect(limitStage(8, 10)).toBe(80)
    expect(limitStage(9, 10)).toBe(90)
  })

  test("a zero limit is a locked feature, not pressure", () => {
    expect(limitStage(0, 0)).toBeNull()
    expect(limitStage(3, 0)).toBeNull()
  })
})

describe("P08 decision per threshold", () => {
  const decide = (used: number, limit = "ordersPerMonth" as const) =>
    limitPressureDecision({
      planId: "free",
      limit,
      used,
      now,
      checkoutAvailable: true,
    })

  test("79% is quiet", () => {
    expect(decide(39)).toBeNull()
  })

  test("80% is an in-app banner under the offers consent", () => {
    const decision = decide(40)
    expect(decision?.channels).toEqual(["in_app"])
    expect(decision?.consent).toBe("offers")
    expect(decision?.inAppKey).toBe("limit-pressure")
    expect(decision?.periodKey).toBe("ordersPerMonth:2026-11:80")
    expect(decision?.ledgerPlayId).toBe("P08_limit:ordersPerMonth")
  })

  test("89% stays at the banner", () => {
    expect(decide(44.5)?.stage).toBe(80)
  })

  test("90% is an email under the offers consent", () => {
    const decision = decide(45)
    expect(decision?.channels).toEqual(["email"])
    expect(decision?.consent).toBe("offers")
    expect(decision?.templateKey).toBe("lifecycle-limit-warning")
    expect(decision?.periodKey).toBe("ordersPerMonth:2026-11:90")
  })

  test("100% is a transactional plan comparison email, never silent", () => {
    const decision = decide(50)
    expect(decision?.consent).toBe("transactional")
    expect(decision?.templateKey).toBe("lifecycle-limit-reached")
    expect(decision?.periodKey).toBe("ordersPerMonth:2026-11:100")
    expect(decision?.data).toMatchObject({
      used: 50,
      cap: 50,
      left: 0,
      planName: "Free",
      recommendedPlanName: "Starter",
      recommendedPriceLabel: "₦5,000/month",
      resetsOn: "1 Dec",
    })
  })
})

describe("P08 recommends the smallest plan that removes the hit", () => {
  const recommend = (
    planId: "free" | "starter" | "growth" | "pro",
    limit: "ordersPerMonth" | "products" | "staff" | "offlineDevices",
    used: number,
  ) =>
    limitPressureDecision({
      planId,
      limit,
      used,
      now,
      checkoutAvailable: true,
    })?.data.recommendedPlanId ?? null

  test("Free at the order cap gets Starter, never Pro", () => {
    expect(recommend("free", "ordersPerMonth", 50)).toBe("starter")
  })

  test("Starter at 85 of 100 products gets Growth", () => {
    expect(recommend("starter", "products", 85)).toBe("growth")
  })

  test("Starter staff 2 of 2 gets Growth", () => {
    expect(recommend("starter", "staff", 2)).toBe("growth")
  })

  test("Growth at 5 of 5 offline devices gets Pro", () => {
    expect(recommend("growth", "offlineDevices", 5)).toBe("pro")
  })

  test("Pro at a limit has no upgrade, so no nudge", () => {
    expect(recommend("pro", "staff", 50)).toBeNull()
  })

  test("Free staff limit is 0: a locked feature, not P08", () => {
    expect(recommend("free", "staff", 0)).toBeNull()
  })

  test("unlimited orders on Starter never pressure", () => {
    expect(recommend("starter", "ordersPerMonth", 5000)).toBeNull()
  })
})

describe("P08 CTA and checkout", () => {
  test("with checkout live, Plan and billing opens with the plan preselected", () => {
    const decision = limitPressureDecision({
      planId: "free",
      limit: "products",
      used: 9,
      now,
      checkoutAvailable: true,
    })
    expect(decision?.ctaPath).toBe(
      "/settings/billing?plan=starter&from=P08_limit",
    )
    expect(decision?.data.ctaLabel).toBe("Upgrade to Starter")
  })

  test("without checkout, the CTA falls back to Plan and billing", () => {
    const decision = limitPressureDecision({
      planId: "free",
      limit: "products",
      used: 9,
      now,
      checkoutAvailable: false,
    })
    expect(decision?.ctaPath).toBe("/settings/billing")
    expect(decision?.data.ctaLabel).toBe("See plans")
    expect(decision?.data.checkoutAvailable).toBe(false)
  })
})

describe("P08 from the daily snapshot", () => {
  test("no pressure is not eligible", () => {
    expect(limitPressurePlay.eligible(makeContext())).toBeNull()
  })

  test("picks the highest threshold across limits", () => {
    const decision = limitPressurePlay.eligible(
      makeContext({ limitPressure: { products: 0.8, ordersPerMonth: 0.9 } }),
    )
    expect(decision?.ledgerPlayId).toBe("P08_limit:ordersPerMonth")
    expect(decision?.periodKey).toBe("ordersPerMonth:2026-11:90")
  })

  test("same threshold: the fuller limit wins", () => {
    const decision = limitPressurePlay.eligible(
      makeContext({ limitPressure: { ordersPerMonth: 0.82, products: 0.88 } }),
    )
    expect(decision?.ledgerPlayId).toBe("P08_limit:products")
  })

  test("the businesses limit belongs to P12, not P08", () => {
    expect(
      limitPressurePlay.eligible(
        makeContext({ limitPressure: { businesses: 1 } }),
      ),
    ).toBeNull()
  })

  test("success means a higher plan", () => {
    const sentOn = makeContext().snapshot
    expect(
      limitPressurePlay.success.achieved(sentOn, {
        ...sentOn,
        planId: "starter",
      }),
    ).toBe(true)
    expect(limitPressurePlay.success.achieved(sentOn, sentOn)).toBe(false)
  })
})
