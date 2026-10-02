import { describe, expect, test } from "bun:test"
import { getDatePresets, parseDateOnly, shiftDateOnly } from "./date-range"

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
})
