import { describe, expect, test } from "bun:test"

import {
  publicBookingFailureMessage,
  publicBookingWindowStart,
} from "./booking-public-state"

describe("public booking recovery state", () => {
  test("keeps capacity conflicts safe and actionable", () => {
    expect(publicBookingFailureMessage(new Error("Capacity conflict"))).toBe(
      "That time is no longer available. Choose another slot and try again.",
    )
  })

  test("does not expose unknown public booking failures", () => {
    expect(publicBookingFailureMessage(new Error("database detail"))).toBe(
      "This booking action is unavailable right now. Refresh and try again.",
    )
  })

  test("keeps public availability paging within a safe forward window", () => {
    const now = new Date("2026-08-11T10:00:00.000Z")
    expect(publicBookingWindowStart("not-a-date", now)).toEqual(now)
    expect(publicBookingWindowStart("2026-08-10T10:00:00.000Z", now)).toEqual(
      now,
    )
    expect(publicBookingWindowStart("2026-08-18T10:00:00.000Z", now)).toEqual(
      new Date("2026-08-18T10:00:00.000Z"),
    )
  })
})
