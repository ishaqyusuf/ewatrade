import { describe, expect, test } from "bun:test"

import {
  formatCurrencyInput,
  formatMinorMoney,
  getCurrencySymbol,
  majorToMinor,
  minorToMajorInput,
  normalizeCurrencyInput,
  suggestCurrencyForCountry,
} from "./currency"

describe("currency utilities", () => {
  test("resolves launch symbols and falls back to the currency code", () => {
    expect(getCurrencySymbol("NGN")).toBe("₦")
    expect(getCurrencySymbol("GHS")).toBe("GH₵")
    expect(getCurrencySymbol("XOF")).toBe("XOF")
  })

  test("suggests a currency from country while keeping an international fallback", () => {
    expect(suggestCurrencyForCountry("ng")).toBe("NGN")
    expect(suggestCurrencyForCountry("GH")).toBe("GHS")
    expect(suggestCurrencyForCountry("GB")).toBe("USD")
  })

  test("groups editable values and preserves typing states", () => {
    expect(formatCurrencyInput("1234567.5")).toBe("1,234,567.5")
    expect(formatCurrencyInput("1000.")).toBe("1,000.")
    expect(formatCurrencyInput("")).toBe("")
    expect(normalizeCurrencyInput("₦ 1,234.567")).toBe("1234.56")
    expect(normalizeCurrencyInput("")).toBe("")
  })

  test("converts explicitly between major and minor units", () => {
    expect(majorToMinor("1,234.5")).toBe(123_450)
    expect(majorToMinor("0")).toBe(0)
    expect(majorToMinor("")).toBe(null)
    expect(minorToMajorInput(123_450)).toBe("1234.5")
  })

  test("formats negative minor-unit values", () => {
    expect(formatMinorMoney(-123_456, "KES")).toBe("-KSh1,234.56")
    expect(formatMinorMoney(123_456, "XOF")).toBe("XOF1,234.56")
  })
})
