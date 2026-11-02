import { expect, test } from "bun:test"
import {
  financeReportPresets,
  financeReportRangeLabel,
  matchFinanceReportPreset,
} from "./report-date-presets"

// Thursday 15 October 2026 (UTC); the books start on 2 March 2026.
const now = new Date("2026-10-15T14:00:00.000Z")
const books = new Date("2026-03-02T00:00:00.000Z")

test("presets cover the dashboard list, clamped to the books and today", () => {
  const presets = financeReportPresets(books, now)
  expect(
    presets.map((preset) => [preset.key, preset.from, preset.through]),
  ).toEqual([
    ["today", "2026-10-15", "2026-10-15"],
    ["week", "2026-10-12", "2026-10-15"],
    ["month", "2026-10-01", "2026-10-15"],
    ["last-month", "2026-09-01", "2026-09-30"],
    ["quarter", "2026-10-01", "2026-10-15"],
    ["last-quarter", "2026-07-01", "2026-09-30"],
    ["year", "2026-03-02", "2026-10-15"],
    ["30-days", "2026-09-16", "2026-10-15"],
    ["90-days", "2026-07-18", "2026-10-15"],
    ["all", "2026-03-02", "2026-10-15"],
  ])
  expect(presets.find((preset) => preset.key === "year")?.clamped).toBe(true)
  expect(presets.find((preset) => preset.key === "month")?.clamped).toBe(false)
})

test("a preset that ends before the books start is left out", () => {
  const keys = financeReportPresets(books, now).map((preset) => preset.key)
  expect(keys).not.toContain("last-year")
  const older = financeReportPresets("2024-06-01T00:00:00.000Z", now)
  expect(older.find((preset) => preset.key === "last-year")).toMatchObject({
    clamped: false,
    from: "2025-01-01",
    through: "2025-12-31",
  })
})

test("weeks start on Monday and January rolls back a year", () => {
  const sunday = new Date("2026-11-01T09:00:00.000Z")
  expect(
    financeReportPresets("2020-01-01", sunday).find(
      (preset) => preset.key === "week",
    )?.from,
  ).toBe("2026-10-26")
  const january = financeReportPresets(
    "2020-01-01",
    new Date("2027-01-10T09:00:00.000Z"),
  )
  const range = (key: string) => {
    const preset = january.find((entry) => entry.key === key)
    return [preset?.from, preset?.through]
  }
  expect(range("last-month")).toEqual(["2026-12-01", "2026-12-31"])
  expect(range("last-quarter")).toEqual(["2026-10-01", "2026-12-31"])
})

test("the picked preset wins when two share the same dates", () => {
  const presets = financeReportPresets(books, now)
  const october = { from: "2026-10-01", through: "2026-10-15" }
  expect(matchFinanceReportPreset(presets, october)?.key).toBe("month")
  expect(matchFinanceReportPreset(presets, october, "quarter")?.key).toBe(
    "quarter",
  )
  expect(
    matchFinanceReportPreset(presets, {
      from: "2026-10-02",
      through: "2026-10-15",
    }),
  ).toBeNull()
})

test("range labels", () => {
  expect(
    financeReportRangeLabel({ from: "2026-10-15", through: "2026-10-15" }, now),
  ).toBe("15 Oct")
  expect(
    financeReportRangeLabel({ from: "2026-09-01", through: "2026-09-30" }, now),
  ).toBe("1 – 30 Sep")
  expect(
    financeReportRangeLabel({ from: "2026-07-01", through: "2026-09-30" }, now),
  ).toBe("1 Jul – 30 Sep")
  expect(
    financeReportRangeLabel({ from: "2025-12-01", through: "2026-01-31" }, now),
  ).toBe("1 Dec 2025 – 31 Jan 2026")
})
