import { describe, expect, test } from "bun:test"
import {
  countLabel,
  greenTillHomeStage,
  homeMoney,
  orderPaymentPill,
  recordAvatar,
  salesDelta,
  salesWindows,
  timeLabel,
} from "./green-till-home-model"

describe("Green Till Home model", () => {
  test("builds today and yesterday windows from local midnight", () => {
    const { today, yesterday } = salesWindows(new Date(2026, 9, 8, 14, 30))
    expect(today.createdAfter).toEqual(new Date(2026, 9, 8))
    expect(today.createdBefore).toEqual(new Date(2026, 9, 9))
    expect(yesterday.createdAfter).toEqual(new Date(2026, 9, 7))
    expect(yesterday.createdBefore).toEqual(new Date(2026, 9, 8))
  })

  test("compares with yesterday only when yesterday had sales", () => {
    expect(salesDelta(184_500, 164_700)).toEqual({
      direction: "up",
      value: "12%",
    })
    expect(salesDelta(50, 100)).toEqual({ direction: "down", value: "50%" })
    expect(salesDelta(100, 0)).toBeNull()
  })

  test("labels payment state on order rows", () => {
    expect(
      orderPaymentPill({
        amountPaidMinor: 10,
        balanceDueMinor: 0,
        status: "COMPLETED",
      }),
    ).toEqual({ label: "Paid", tone: "ok" })
    expect(
      orderPaymentPill({
        amountPaidMinor: 10,
        balanceDueMinor: 5,
        status: "CONFIRMED",
      }),
    ).toEqual({ label: "Part paid", tone: "warn" })
    expect(
      orderPaymentPill({
        amountPaidMinor: 0,
        balanceDueMinor: 5,
        status: "CONFIRMED",
      }),
    ).toEqual({ label: "Unpaid", tone: "danger" })
    expect(
      orderPaymentPill({
        amountPaidMinor: 0,
        balanceDueMinor: 5,
        status: "CANCELLED",
      }).tone,
    ).toBe("muted")
  })

  test("uses a store icon for walk-ins and initials otherwise", () => {
    expect(recordAvatar("Walk-in customer", 1)).toEqual({
      icon: "Store",
      tint: "sky",
    })
    expect(recordAvatar("Aisha Bello", 0)).toEqual({
      initials: "AB",
      tint: "mint",
    })
  })

  test("formats times and counts", () => {
    expect(timeLabel(new Date(2026, 9, 8, 9, 5))).toBe("09:05")
    expect(countLabel(1, "order")).toBe("1 order")
    expect(countLabel(14, "order")).toBe("14 orders")
  })

  test("chooses setup, first order or everyday Home", () => {
    const base = { hasOrderHistory: false, workspace: "available" as const }
    expect(greenTillHomeStage({ ...base, catalog: "empty" })).toBe("setup")
    expect(greenTillHomeStage({ ...base, catalog: "ready" })).toBe(
      "first-order",
    )
    expect(
      greenTillHomeStage({ ...base, catalog: "ready", hasOrderHistory: true }),
    ).toBe("everyday")
    expect(
      greenTillHomeStage({ ...base, catalog: "ready", workspace: "loading" }),
    ).toBe("loading")
    expect(
      greenTillHomeStage({
        ...base,
        catalog: "ready",
        workspace: "offline-unknown",
      }),
    ).toBe("blocked")
  })

  test("drops .00 on whole amounts only", () => {
    expect(homeMoney(18_450_000, "NGN")).toBe("₦184,500")
    expect(homeMoney(150, "NGN")).toBe("₦1.50")
    expect(homeMoney(0, "NGN")).toBe("₦0")
  })
})
