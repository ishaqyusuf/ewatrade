import { describe, expect, test } from "bun:test"
import {
  businessDayKey,
  businessDayKeys,
  businessDayStart,
  shiftDayKey,
} from "./business-day"

describe("business days", () => {
  test("Lagos days start at 23:00 UTC the evening before", () => {
    expect(businessDayStart("2026-11-15", "Africa/Lagos").toISOString()).toBe(
      "2026-11-14T23:00:00.000Z",
    )
    // 00:30 in Lagos on the 15th is still the 14th in UTC.
    expect(
      businessDayKey(new Date("2026-11-14T23:30:00.000Z"), "Africa/Lagos"),
    ).toBe("2026-11-15")
    expect(
      businessDayKeys(
        businessDayStart("2026-11-14", "Africa/Lagos"),
        businessDayStart("2026-11-16", "Africa/Lagos"),
        "Africa/Lagos",
      ),
    ).toEqual(["2026-11-14", "2026-11-15"])
  })

  test("DST days keep local midnight (London, 29 March and 25 October 2026)", () => {
    const zone = "Europe/London"
    expect(businessDayStart("2026-03-29", zone).toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    )
    expect(businessDayStart("2026-03-30", zone).toISOString()).toBe(
      "2026-03-29T23:00:00.000Z",
    )
    expect(businessDayStart("2026-10-26", zone).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    )
    // 23-hour and 25-hour days still come out as one key each.
    expect(
      businessDayKeys(
        businessDayStart("2026-03-28", zone),
        businessDayStart("2026-03-31", zone),
        zone,
      ),
    ).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"])
    expect(
      businessDayKeys(
        businessDayStart("2026-10-24", zone),
        businessDayStart("2026-10-27", zone),
        zone,
      ),
    ).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"])
  })

  test("shifts across months and leaves UTC alone", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28")
    expect(businessDayStart("2026-11-15", "UTC").toISOString()).toBe(
      "2026-11-15T00:00:00.000Z",
    )
  })
})
