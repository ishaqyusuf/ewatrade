import { describe, expect, test } from "bun:test"
import type { SalesHistory } from "../../contract"
import { makeContext } from "../../fixtures"
import { featureIntentPlay } from "./feature-intent"
import { nextPlanPitch } from "./plans"
import { secondBusinessPlay } from "./second-business"
import { successMilestonePlay } from "./success-milestones"

const naira = (n: number) => BigInt(n * 100)
const history = (over: Partial<SalesHistory> = {}): SalesHistory => ({
  priorMonths: 4,
  bestPriorMonthMinor: naira(400_000),
  medianPriorMonthMinor: naira(150_000),
  ...over,
})

describe("P09 success milestones", () => {
  test("100th order in the week it happens", () => {
    const decision = successMilestonePlay.eligible(
      makeContext({ ordersTotal: 103, ordersLast7: 12 }),
    )
    expect(decision).toMatchObject({
      periodKey: "orders_100",
      templateKey: "lifecycle-success-milestone",
      ctaPath: "/settings/billing?plan=starter&from=P09_success",
    })
    expect(decision?.data.milestone).toBe("orders_100")
    expect(decision?.data.nextPlanLine).toBe(
      "Starter adds unlimited orders a month, 100 products and 2 staff accounts, plus every paid feature.",
    )
  })

  test("99 orders is not a milestone; a business long past 100 is not congratulated late", () => {
    expect(
      successMilestonePlay.eligible(
        makeContext({ ordersTotal: 99, ordersLast7: 12 }),
      ),
    ).toBeNull()
    expect(
      successMilestonePlay.eligible(
        makeContext({ ordersTotal: 900, ordersLast7: 40 }),
      ),
    ).toBeNull()
  })

  test("3× the usual month leads with their numbers", () => {
    const decision = successMilestonePlay.eligible(
      makeContext(
        { planId: "starter", salesMinorThisMonth: naira(450_000) },
        { salesHistory: history() },
      ),
    )
    expect(decision?.periodKey).toBe("sales:2026-11")
    expect(decision?.data).toMatchObject({
      milestone: "sales_3x",
      salesThisMonth: "₦450,000",
      usualMonth: "₦150,000",
      recommendedPlanId: "growth",
    })
    expect(String(decision?.data.nextPlanLine)).toContain("customer messages")
  })

  test("just under 3× but above the best month is a best month", () => {
    const decision = successMilestonePlay.eligible(
      makeContext(
        { salesMinorThisMonth: naira(449_999) },
        { salesHistory: history({ bestPriorMonthMinor: naira(300_000) }) },
      ),
    )
    expect(decision?.data.milestone).toBe("best_month")
  })

  test("best month needs two prior months; 3× needs three", () => {
    const sales = { salesMinorThisMonth: naira(900_000) }
    expect(
      successMilestonePlay.eligible(
        makeContext(sales, { salesHistory: history({ priorMonths: 1 }) }),
      ),
    ).toBeNull()
    expect(
      successMilestonePlay.eligible(
        makeContext(sales, { salesHistory: history({ priorMonths: 2 }) }),
      )?.data.milestone,
    ).toBe("best_month")
  })

  test("no sales history loaded: only the order milestone can fire", () => {
    expect(
      successMilestonePlay.eligible(
        makeContext({ salesMinorThisMonth: naira(9_000_000) }),
      ),
    ).toBeNull()
  })

  test("Pro has no next plan", () => {
    expect(
      successMilestonePlay.eligible(
        makeContext({ planId: "pro", ordersTotal: 100, ordersLast7: 5 }),
      ),
    ).toBeNull()
    expect(nextPlanPitch("pro")).toBeNull()
  })
})

describe("P12 second business", () => {
  const busy = {
    stage: "habit" as const,
    ordersLast7: 100,
    businessesOwned: 1,
  }

  test("99 orders a week is not two stores' worth", () => {
    expect(
      secondBusinessPlay.eligible(makeContext({ ...busy, ordersLast7: 99 })),
    ).toBeNull()
  })

  test("Free and Starter need Growth for a second business", () => {
    for (const planId of ["free", "starter"] as const) {
      const decision = secondBusinessPlay.eligible(
        makeContext({ ...busy, planId }),
      )
      expect(decision?.data).toMatchObject({
        needsUpgrade: true,
        recommendedPlanId: "growth",
        businessesIncluded: 3,
      })
      expect(decision?.periodKey).toBe("once")
    }
  })

  test("Growth already allows it: a product tip straight to Add business", () => {
    const decision = secondBusinessPlay.eligible(
      makeContext({ ...busy, planId: "growth" }),
    )
    expect(decision).toMatchObject({
      consent: "productTips",
      ctaPath: "/settings/stores",
    })
    expect(decision?.data.needsUpgrade).toBe(false)
  })

  test("owners with two businesses, or new businesses, are skipped", () => {
    expect(
      secondBusinessPlay.eligible(makeContext({ ...busy, businessesOwned: 2 })),
    ).toBeNull()
    expect(
      secondBusinessPlay.eligible(makeContext({ ...busy, stage: "activated" })),
    ).toBeNull()
  })
})

describe("P16 feature intent", () => {
  const now = new Date("2026-11-12T10:00:00Z")
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
  const intent = (
    taps: number,
    thirdTapHoursAgo: number | null,
    features = ["attachments"],
  ) => ({
    featureIntent: {
      taps,
      thirdTapAt: thirdTapHoursAgo === null ? null : hoursAgo(thirdTapHoursAgo),
      features,
    },
  })

  test("two taps never send", () => {
    expect(
      featureIntentPlay.eligible(makeContext({}, intent(2, null))),
    ).toBeNull()
  })

  test("third tap: waits 24h, then sends once", () => {
    expect(
      featureIntentPlay.eligible(makeContext({}, intent(3, 23.9))),
    ).toBeNull()
    const decision = featureIntentPlay.eligible(makeContext({}, intent(3, 24)))
    expect(decision).toMatchObject({
      periodKey: "once",
      templateKey: "lifecycle-feature-intent",
      ctaPath: "/settings/billing?plan=starter&from=P16_feature_intent",
    })
    expect(decision?.data.featureLabel).toBe("Photos, videos and documents")
  })

  test("stale intent (over 7 days) is dropped", () => {
    expect(
      featureIntentPlay.eligible(makeContext({}, intent(5, 24 * 8))),
    ).toBeNull()
  })

  test("customer messages on Starter recommends Growth", () => {
    const decision = featureIntentPlay.eligible(
      makeContext(
        { planId: "starter" },
        intent(3, 30, ["attachments", "customerMessages"]),
      ),
    )
    expect(decision?.data).toMatchObject({
      feature: "customerMessages",
      recommendedPlanId: "growth",
    })
  })

  test("already unlocked or unknown features do not send", () => {
    expect(
      featureIntentPlay.eligible(
        makeContext({ planId: "starter" }, intent(3, 30, ["finance"])),
      ),
    ).toBeNull()
    expect(
      featureIntentPlay.eligible(makeContext({}, intent(3, 30, ["teleport"]))),
    ).toBeNull()
  })

  test("not loaded is not eligible", () => {
    expect(featureIntentPlay.eligible(makeContext())).toBeNull()
  })
})
