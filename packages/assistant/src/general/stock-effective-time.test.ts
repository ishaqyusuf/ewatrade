import { expect, test } from "bun:test"
import {
  StockEffectiveTimeError,
  parseStockEffectiveTime,
} from "./stock-effective-time"

test("stock times cross the native Date boundary without rounding an instant", () => {
  for (const [raw, expected] of [
    ["2026-10-15T09:00:00Z", "2026-10-15T09:00:00.000Z"],
    ["2026-10-15T09:00:00.1Z", "2026-10-15T09:00:00.100Z"],
    ["2026-10-15T09:00:00.12Z", "2026-10-15T09:00:00.120Z"],
    ["2026-10-15T09:00:00.123Z", "2026-10-15T09:00:00.123Z"],
    ["2026-10-15T09:00:00.123000000Z", "2026-10-15T09:00:00.123Z"],
    ["2024-02-29T23:59:59.999000Z", "2024-02-29T23:59:59.999Z"],
    ["0000-01-01T00:00:00Z", "0000-01-01T00:00:00.000Z"],
  ]) {
    expect(parseStockEffectiveTime(raw).toISOString()).toBe(expected)
  }
})

test("non-zero sub-millisecond digits refuse rather than committing another time", () => {
  for (const raw of [
    "2026-10-15T09:00:00.123456Z",
    "2026-10-15T09:00:00.000000001Z",
    "2026-10-15T09:00:00.9999Z",
  ]) {
    // Demonstrate the actual native limitation, not a decimal-string guess.
    expect(new Date(raw).toISOString()).not.toBe(raw)
    try {
      parseStockEffectiveTime(raw)
      throw Error("Unsupported precision was admitted")
    } catch (error) {
      expect(error).toBeInstanceOf(StockEffectiveTimeError)
      expect(error instanceof StockEffectiveTimeError && error.reason).toBe(
        "unrepresentable_precision",
      )
    }
  }
})

test("invalid calendar dates and implicit timezones never normalize into stock time", () => {
  for (const raw of [
    undefined,
    null,
    {},
    "",
    " 2026-10-15T09:00:00Z",
    "2026-02-29T09:00:00Z",
    "2026-04-31T09:00:00Z",
    "2026-10-15T24:00:00Z",
    "2026-10-15T09:00:60Z",
    "2026-10-15T09:00:00+01:00",
    "2026-10-15T09:00:00",
    "2026-10-15T09:00Z",
    "2026-10-15T09:00:00.0000000000Z",
  ])
    expect(() => parseStockEffectiveTime(raw)).toThrow(StockEffectiveTimeError)
})
