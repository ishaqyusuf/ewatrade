import { describe, expect, test } from "bun:test"
import { customerAgingBucket } from "./aging"

const asOf = new Date("2026-11-02T12:00:00.000Z")
const daysAgo = (days: number) => new Date(asOf.getTime() - days * 86_400_000)

describe("customerAgingBucket", () => {
  test("puts whole days owed into 0–30, 31–60, 61–90 and over 90", () => {
    expect(customerAgingBucket(daysAgo(0), asOf)).toBe("DAYS_0_30")
    expect(customerAgingBucket(daysAgo(30), asOf)).toBe("DAYS_0_30")
    expect(customerAgingBucket(daysAgo(31), asOf)).toBe("DAYS_31_60")
    expect(customerAgingBucket(daysAgo(60), asOf)).toBe("DAYS_31_60")
    expect(customerAgingBucket(daysAgo(61), asOf)).toBe("DAYS_61_90")
    expect(customerAgingBucket(daysAgo(90), asOf)).toBe("DAYS_61_90")
    expect(customerAgingBucket(daysAgo(91), asOf)).toBe("DAYS_OVER_90")
    expect(customerAgingBucket(daysAgo(800), asOf)).toBe("DAYS_OVER_90")
  })

  test("counts a part day as not yet a whole day and future dates as today", () => {
    expect(customerAgingBucket(new Date(daysAgo(31).getTime() + 1), asOf)).toBe(
      "DAYS_0_30",
    )
    expect(customerAgingBucket(daysAgo(-3), asOf)).toBe("DAYS_0_30")
  })
})
