import { describe, expect, test } from "bun:test"

import {
  buildReportFunnel,
  formatReportDuration,
  metricTone,
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

  test("funnel ratios compare with the step above and stay empty after zero", () => {
    expect(
      buildReportFunnel([
        { count: 4, label: "Requests" },
        { count: 6, label: "Quotes" },
        { count: 0, label: "Accepted" },
        { count: 1, label: "Paid" },
      ]),
    ).toEqual([
      { count: 4, label: "Requests" },
      { count: 6, label: "Quotes", ratio: 150 },
      { count: 0, label: "Accepted", ratio: 0 },
      { count: 1, label: "Paid", ratio: null },
    ])
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
