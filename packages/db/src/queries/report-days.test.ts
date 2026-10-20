import { describe, expect, test } from "bun:test"

import { countByUtcDay, utcDayKeys } from "./report-days"

const window = {
  from: new Date("2026-10-18T00:00:00.000Z"),
  to: new Date("2026-10-20T00:00:00.000Z"),
}

describe("countByUtcDay", () => {
  test("counts each series per UTC day and keeps empty days", () => {
    expect(
      countByUtcDay(window, {
        amountPaidMinor: [
          { amountMinor: 500, at: new Date("2026-10-19T08:00:00.000Z") },
        ],
        requests: [
          { at: new Date("2026-10-18T23:30:00.000Z") },
          { at: new Date("2026-10-19T00:10:00.000Z") },
          { at: new Date("2026-10-20T00:00:00.000Z") },
          { at: null },
        ],
      }),
    ).toEqual([
      { amountPaidMinor: 0, date: "2026-10-18", requests: 1 },
      { amountPaidMinor: 500, date: "2026-10-19", requests: 1 },
    ])
  })

  test("lists the days of a window that starts mid-day", () => {
    expect(utcDayKeys(new Date("2026-10-18T12:00:00.000Z"), window.to)).toEqual(
      ["2026-10-18", "2026-10-19"],
    )
  })
})
