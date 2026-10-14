import {
  type CountryCode,
  getCountries,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max"

export interface NormalizedWhatsAppPhone {
  phoneE164: string
  digits: string
  display: string
}

const extensionPattern = /(?:\bext\.?\s*\d+|\bx\s*\d+|;\s*ext\s*=)/i

export function normalizeWhatsAppPhone(
  phone: string,
  countryCode?: string,
): NormalizedWhatsAppPhone | null {
  if (typeof phone !== "string") return null
  const input = phone.trim()
  if (!input || extensionPattern.test(input)) return null

  const explicitInternational = input.startsWith("+") || input.startsWith("00")
  let normalizedInput = input
  if (input.startsWith("00")) {
    normalizedInput = `+${input.slice(2)}`
  }

  let defaultCountry: CountryCode | undefined
  if (!explicitInternational) {
    if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return null
    const candidate = countryCode.toUpperCase() as CountryCode
    if (!getCountries().includes(candidate)) return null
    defaultCountry = candidate
  }

  const parsed = parsePhoneNumberFromString(normalizedInput, {
    defaultCountry,
    extract: false,
  })
  if (!parsed || parsed.ext || !parsed.isValid()) return null

  return {
    phoneE164: parsed.number,
    digits: parsed.number.slice(1),
    display: parsed.formatInternational(),
  }
}
