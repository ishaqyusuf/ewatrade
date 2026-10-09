import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max"
import examples from "libphonenumber-js/mobile/examples"

export function phoneCountry(
  value: string | null | undefined,
): CountryCode | undefined {
  const code = value?.toUpperCase()
  return code && isSupportedCountry(code) ? (code as CountryCode) : undefined
}

const names = new Intl.DisplayNames(["en"], { type: "region" })
export const PHONE_COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: names.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"))

export function phoneFlag(country: CountryCode) {
  return String.fromCodePoint(
    ...[...country].map((letter) => letter.charCodeAt(0) + 127397),
  )
}

export function phonePlaceholder(country?: CountryCode) {
  if (!country) return "Select country"
  const example = getExampleNumber(country, examples)
  return (
    example
      ?.formatInternational()
      .replace(/^\+\d+\s*/, "")
      .replace(/\d/g, "0") ?? "Phone number"
  )
}

export function normalizeInternationalPhone(value: string, country: string) {
  const code = phoneCountry(country)
  if (!code) return null
  const parsed = parsePhoneNumberFromString(value.trim().replace(/^00/, "+"), {
    defaultCountry: code,
    extract: false,
  })
  if (
    !parsed ||
    parsed.ext ||
    !parsed.isValid() ||
    parsed.countryCallingCode !== getCountryCallingCode(code)
  )
    return null
  // Shared calling codes (for example US/Canada) still need a matching region.
  if (parsed.country && parsed.country !== code) return null
  return parsed.number
}
