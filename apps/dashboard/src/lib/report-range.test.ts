import { describe, expect, test } from "bun:test"

import {
  formatReportDay,
  formatReportDayLong,
  formatReportRangeBetween,
  formatReportRangeLabel,
  matchReportRangePreset,
  previousReportRange,
  reportPresetRange,
  reportRangeDays,
  reportRangeFileDates,
  resolveReportRange,
} from "./report-range"

const now = new Date("2026-10-19T14:30:00.000Z")

describe("report ranges", () => {
  test("last 30 days ends with today and has an exclusive end", () => {
    const range = reportPresetRange(30, now)
    expect(range.from.toISOString()).toBe("2026-09-20T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2026-10-20T00:00:00.000Z")
    expect(reportRangeDays(range)).toBe(30)
    expect(formatReportRangeLabel(range, now)).toBe(
      "Last 30 days · 20 Sep – 19 Oct",
    )
    expect(matchReportRangePreset(range, now)).toBe(30)
    expect(formatReportRangeBetween(range, now)).toBe(
      "between 20 Sep and 19 Oct",
    )
  })

  test("the previous period is the same length just before", () => {
    const previous = previousReportRange(reportPresetRange(7, now))
    expect(previous.from.toISOString()).toBe("2026-10-06T00:00:00.000Z")
    expect(previous.to.toISOString()).toBe("2026-10-13T00:00:00.000Z")
  })

  test("custom ranges name their length and show the year when needed", () => {
    const range = {
      from: new Date("2025-12-20T00:00:00.000Z"),
      to: new Date("2026-01-04T00:00:00.000Z"),
    }
    expect(matchReportRangePreset(range, now)).toBeNull()
    expect(formatReportRangeLabel(range, now)).toBe(
      "15 days · 20 Dec 2025 – 3 Jan 2026",
    )
    expect(reportRangeFileDates(range)).toBe("2025-12-20_to_2026-01-03")
  })

  test("invalid or oversized URL ranges fall back to the last 30 days", () => {
    const fallback = reportPresetRange(30, now)
    for (const params of [
      { from: null, to: null },
      {
        from: new Date("2026-10-10T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        from: new Date("2024-01-01T00:00:00.000Z"),
        to: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        from: new Date("2026-10-01T05:00:00.000Z"),
        to: new Date("2026-10-08T00:00:00.000Z"),
      },
    ]) {
      expect(resolveReportRange(params, now)).toEqual(fallback)
    }
  })

  test("formats day keys", () => {
    expect(formatReportDay("2026-10-19")).toBe("19 Oct")
    expect(formatReportDayLong("2026-10-19")).toBe("Mon 19 Oct 2026")
  })
})
