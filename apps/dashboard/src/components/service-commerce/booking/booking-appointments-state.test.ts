import { describe, expect, test } from "bun:test"

import {
  bookingActions,
  bookingCommandError,
  bookingStatusLabel,
  formatBookingWhen,
  operationIdFor,
  upcomingDayKeys,
  zonedDayKey,
  zonedDayWindow,
} from "./booking-appointments-state"

describe("staff booking actions", () => {
  test("only a confirmed booking can move; live ones can be cancelled", () => {
    expect(bookingActions("confirmed")).toEqual({
      canCancel: true,
      canReschedule: true,
    })
    expect(bookingActions("scheduled")).toEqual({
      canCancel: true,
      canReschedule: false,
    })
    for (const status of ["cancelled", "completed", "no_show", "in_service"])
      expect(bookingActions(status)).toEqual({
        canCancel: false,
        canReschedule: false,
      })
    expect(bookingStatusLabel("cancelled")).toBe("Cancelled")
  })
})

describe("booking time zone windows", () => {
  test("a Lagos day is 23:00Z to 23:00Z", () => {
    expect(zonedDayWindow("2026-11-02", "Africa/Lagos")).toEqual({
      from: new Date("2026-11-01T23:00:00.000Z"),
      to: new Date("2026-11-02T23:00:00.000Z"),
    })
  })

  test("follows daylight saving changes", () => {
    // London leaves summer time on 25 Oct 2026: that day lasts 25 hours.
    const { from, to } = zonedDayWindow("2026-10-25", "Europe/London")
    expect(from.toISOString()).toBe("2026-10-24T23:00:00.000Z")
    expect(to.toISOString()).toBe("2026-10-26T00:00:00.000Z")
  })

  test("days start from today in the booking's zone, not the browser's", () => {
    const lateUtc = new Date("2026-10-27T23:30:00.000Z")
    expect(zonedDayKey(lateUtc, "Africa/Lagos")).toBe("2026-10-28")
    expect(upcomingDayKeys(lateUtc, "Africa/Lagos", 3)).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ])
  })

  test("shows the booking in its own zone", () => {
    expect(
      formatBookingWhen({
        endAt: "2026-11-02T14:00:00.000Z",
        startAt: "2026-11-02T13:30:00.000Z",
        timezone: "Africa/Lagos",
      }),
    ).toBe("Mon 2 Nov, 14:30–15:00")
  })
})

describe("booking command errors", () => {
  test("a taken time asks for another time", () => {
    expect(
      bookingCommandError({
        data: { code: "CONFLICT" },
        message: "Rescheduled slot is no longer available.",
      }),
    ).toEqual({
      kind: "slot_taken",
      message: "That time was just taken. Pick another open time.",
    })
  })

  test("a stale revision says it refreshed", () => {
    expect(
      bookingCommandError({
        data: { code: "CONFLICT" },
        message: "Booking changed. Refresh and try again.",
      }).kind,
    ).toBe("stale")
  })

  test("access and other failures stay readable", () => {
    expect(
      bookingCommandError({
        data: { code: "FORBIDDEN" },
        message: "Current accepted Store booking access is required.",
      }).kind,
    ).toBe("forbidden")
    expect(
      bookingCommandError({
        data: { code: "FORBIDDEN" },
        message: "Only a confirmed booking can be rescheduled.",
      }),
    ).toEqual({
      kind: "other",
      message: "Only a confirmed booking can be rescheduled.",
    })
    expect(bookingCommandError(null).message).toBe(
      "That didn’t save. Try again.",
    )
  })
})

describe("operation ids", () => {
  test("a retry of the same change reuses its id; a new change gets a new one", () => {
    let next = 0
    const create = () => `op-${++next}`
    const first = operationIdFor(null, { a: 1 }, create)
    expect(first.id).toBe("op-1")
    expect(operationIdFor(first, { a: 1 }, create)).toBe(first)
    expect(operationIdFor(first, { a: 2 }, create).id).toBe("op-2")
  })
})
