import { describe, expect, test } from "bun:test"
import {
  formatInclusiveRangeLabel,
  getDatePresets,
  parseDateOnly,
  shiftDateOnly,
} from "./date-range"

describe("date range URL and calendar boundaries", () => {
  test("rejects invalid dates instead of normalizing them", () => {
    expect(parseDateOnly("2026-02-30")).toBeUndefined()
    expect(parseDateOnly("2026-10-01T00:00:00Z")).toBeUndefined()
    expect(parseDateOnly("2024-02-29")).toBeDefined()
  })
  test("exclusive ends round-trip across month and leap-year boundaries", () => {
    expect(shiftDateOnly("2026-10-01", -1)).toBe("2026-09-30")
    expect(shiftDateOnly("2024-02-29", 1)).toBe("2024-03-01")
    expect(shiftDateOnly(shiftDateOnly("2026-01-01", -1), 1)).toBe("2026-01-01")
  })
  test("calendar presets retain exact month and quarter boundaries", () => {
    const presets = getDatePresets(new Date(2026, 9, 1))
    expect(presets.find((preset) => preset.label === "Last month")).toEqual({
      label: "Last month",
      start: "2026-09-01",
      end: "2026-09-30",
    })
    expect(presets.find((preset) => preset.label === "Last quarter")).toEqual({
      label: "Last quarter",
      start: "2026-07-01",
      end: "2026-09-30",
    })
  })
  test("labels an exclusive-end range by its last included day", () => {
    expect(formatInclusiveRangeLabel("2026-09-07", "2026-10-07")).toBe(
      "7 Sep – 6 Oct 2026 · 30 days",
    )
    expect(formatInclusiveRangeLabel("2025-12-20", "2026-01-04")).toBe(
      "20 Dec 2025 – 3 Jan 2026 · 15 days",
    )
    expect(formatInclusiveRangeLabel("2026-10-06", "2026-10-07")).toBe(
      "6 Oct 2026 · 1 day",
    )
    expect(formatInclusiveRangeLabel("bad", "2026-10-07")).toBe(
      "bad – 2026-10-07",
    )
  })
})
