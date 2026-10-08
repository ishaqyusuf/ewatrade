import { describe, expect, test } from "bun:test"
import {
  COUNTRIES,
  countryFlag,
  currencyForCountry,
  getCountry,
  searchCountries,
  toInternationalPhone,
  toLocalPhone,
} from "./countries"

describe("countries", () => {
  test("lists supported markets first and each code once", () => {
    expect(COUNTRIES.slice(0, 5).map((country) => country.code)).toEqual([
      "NG",
      "GH",
      "KE",
      "ZA",
      "EG",
    ])
    const codes = COUNTRIES.map((country) => country.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
      expect(country.dialCode).toMatch(/^\d{1,3}$/)
    }
  })

  test("falls back to Nigeria for unknown codes", () => {
    expect(getCountry("xx").code).toBe("NG")
    expect(getCountry("gh").dialCode).toBe("233")
  })

  test("builds flag emoji from the country code", () => {
    expect(countryFlag("NG")).toBe("🇳🇬")
    expect(countryFlag("n")).toBe("")
  })

  test("maps countries to supported currencies only", () => {
    expect(currencyForCountry("KE")).toBe("KES")
    expect(currencyForCountry("FR")).toBeNull()
  })

  test("searches by name, code and dialling code", () => {
    expect(searchCountries("ghan").map((country) => country.code)).toEqual([
      "GH",
    ])
    expect(searchCountries("ke")[0]?.code).toBe("KE")
    expect(searchCountries("+234").map((country) => country.code)).toContain(
      "NG",
    )
  })

  test("joins and splits international phone numbers", () => {
    expect(toInternationalPhone("234", "0803 123 4567")).toBe("+2348031234567")
    expect(toInternationalPhone("234", "+44 20 7946 0000")).toBe(
      "+442079460000",
    )
    expect(toInternationalPhone("234", "  ")).toBe("")
    expect(toLocalPhone("234", "+2348031234567")).toBe("8031234567")
    expect(toLocalPhone("234", "+44 20 7946 0000")).toBe("+44 20 7946 0000")
  })
})
