import { describe, expect, test } from "bun:test"

import {
  buildReportFunnel,
  formatReportDuration,
  formatReportDurationPlain,
  metricTone,
  reportDelta,
  reportMetric,
  sectionTone,
} from "./report-metrics"

describe("shared report metrics", () => {
  test("formats durations compactly", () => {
    expect(formatReportDuration(42.4)).toBe("42s")
    expect(formatReportDuration(312)).toBe("5m 12s")
    expect(formatReportDuration(3_900)).toBe("1h 5m")
    expect(formatReportDuration(3 * 86_400 + 2 * 3_600)).toBe("3d 2h")
  })

  test("funnel steps are shares of the first step and stay empty after zero", () => {
    expect(
      buildReportFunnel([
        { count: 4, label: "Requests" },
        { count: 6, label: "Quotes" },
        { count: 0, label: "Accepted" },
      ]),
    ).toEqual([
      { count: 4, label: "Requests" },
      { count: 6, label: "Quotes", share: 150 },
      { count: 0, label: "Accepted", share: 0 },
    ])
    expect(
      buildReportFunnel([
        { count: 0, label: "Requests" },
        { count: 1, label: "Paid" },
      ]),
    ).toEqual([
      { count: 0, label: "Requests" },
      { count: 1, label: "Paid", share: null },
    ])
  })

  test("compares with the previous period", () => {
    expect(reportDelta(0, 0)).toBeNull()
    expect(reportDelta(3, 0)).toEqual({ kind: "new" })
    expect(reportDelta(100, 100)).toEqual({ kind: "same" })
    expect(reportDelta(112, 100)).toEqual({ kind: "up", percent: 12 })
    expect(reportDelta(0, 40)).toEqual({ kind: "down", percent: 100 })
  })

  test("plain durations", () => {
    expect(formatReportDurationPlain(42)).toBe("42 sec")
    expect(formatReportDurationPlain(312)).toBe("5 min")
    expect(formatReportDurationPlain(3_900)).toBe("1 hr 5 min")
    expect(formatReportDurationPlain(3 * 86_400 + 2 * 3_600)).toBe(
      "3 days 2 hr",
    )
  })

  test("tones apply only above zero and failures outrank blocks", () => {
    expect(metricTone(reportMetric("Blocked", 0, { tone: "block" }))).toBeNull()
    expect(metricTone(reportMetric("Gap", null, { tone: "block" }))).toBeNull()
    expect(metricTone(reportMetric("Blocked", 2, { tone: "block" }))).toBe(
      "block",
    )
    expect(
      sectionTone({
        groups: [
          {
            metrics: [
              reportMetric("Blocked", 2, { tone: "block" }),
              reportMetric("Failed", 1, { tone: "failure" }),
            ],
            title: "Mixed",
          },
        ],
      }),
    ).toBe("failure")
    expect(
      sectionTone({
        groups: [{ metrics: [reportMetric("A", 3)], title: "A" }],
      }),
    ).toBeNull()
  })
})
