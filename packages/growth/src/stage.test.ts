import { describe, expect, test } from "bun:test"
import { type StageInput, computeStage } from "./stage"

const now = new Date("2026-11-12T06:00:00Z")
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)

function input(overrides: Partial<StageInput> = {}): StageInput {
  return {
    now,
    previousStage: null,
    paying: false,
    activeDays28: 0,
    ordersTotal: 0,
    catalogItems: 0,
    limitPressure: {},
    lastActiveAt: daysAgo(0),
    businessCreatedAt: daysAgo(2),
    ...overrides,
  }
}

describe("computeStage", () => {
  test("new business is signed up until first order and 3 items", () => {
    expect(computeStage(input())).toBe("signed_up")
    expect(computeStage(input({ ordersTotal: 1, catalogItems: 2 }))).toBe(
      "signed_up",
    )
    expect(computeStage(input({ ordersTotal: 1, catalogItems: 3 }))).toBe(
      "activated",
    )
  })

  test("habit at 8 active days in 28", () => {
    const activated = { ordersTotal: 5, catalogItems: 5 }
    expect(computeStage(input({ ...activated, activeDays28: 7 }))).toBe(
      "activated",
    )
    expect(computeStage(input({ ...activated, activeDays28: 8 }))).toBe("habit")
  })

  test("expanding at 80% of any limit, even before activation", () => {
    expect(computeStage(input({ limitPressure: { products: 0.79 } }))).toBe(
      "signed_up",
    )
    expect(computeStage(input({ limitPressure: { products: 0.8 } }))).toBe(
      "expanding",
    )
  })

  test("paying outranks expanding", () => {
    expect(
      computeStage(input({ paying: true, limitPressure: { staff: 1 } })),
    ).toBe("paying")
  })

  test("at risk only after Habit, at 10 idle days", () => {
    const habit = {
      ordersTotal: 20,
      catalogItems: 10,
      activeDays28: 9,
      previousStage: "habit" as const,
    }
    expect(computeStage(input({ ...habit, lastActiveAt: daysAgo(9) }))).toBe(
      "habit",
    )
    expect(computeStage(input({ ...habit, lastActiveAt: daysAgo(10) }))).toBe(
      "at_risk",
    )
    expect(
      computeStage(
        input({
          ...habit,
          previousStage: "activated",
          activeDays28: 2,
          lastActiveAt: daysAgo(10),
        }),
      ),
    ).toBe("activated")
    // Stays at risk while idle, until it turns dormant.
    expect(
      computeStage(
        input({
          ...habit,
          previousStage: "at_risk",
          lastActiveAt: daysAgo(20),
        }),
      ),
    ).toBe("at_risk")
  })

  test("dormant after 30 idle days, counted from signup when never active", () => {
    expect(
      computeStage(input({ lastActiveAt: daysAgo(30), paying: true })),
    ).toBe("dormant")
    expect(
      computeStage(
        input({ lastActiveAt: null, businessCreatedAt: daysAgo(31) }),
      ),
    ).toBe("dormant")
    expect(
      computeStage(
        input({ lastActiveAt: null, businessCreatedAt: daysAgo(29) }),
      ),
    ).toBe("signed_up")
  })
})
