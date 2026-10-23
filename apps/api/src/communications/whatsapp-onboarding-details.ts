import { COUNTRIES } from "@ewatrade/utils/countries"
import { isOperatingCurrencyCode } from "@ewatrade/utils/currency"
import type { WhatsAppOnboardingSignup } from "./whatsapp-onboarding"

type Details = Pick<
  WhatsAppOnboardingSignup,
  "name" | "businessName" | "ageBand" | "countryCode" | "currencyCode"
> & { email: string }
type Field = keyof Details

/** Exact identity intents only. Optional labeled details may follow a newline or colon. */
export function whatsAppRegistrationEntry(text: string): string | null {
  const match =
    /^(?:register(?: chat| form| my business)?|open registration form|create (?:my )?(?:business )?account)(?:[.!]?\s*$|\s*[:\n]\s*([\s\S]+)$)/i.exec(
      text.trim(),
    )
  return match ? (match[1]?.trim() ?? "") : null
}

export const whatsAppRegistrationFields: Record<Field, string> = {
  businessName: "Business name",
  name: "Your full name",
  email: "Email address",
  ageBand: "Age group: 13–15, 16–17, or 18+ (minimum age 13)",
  countryCode: "Country, for example Nigeria or NG",
  currencyCode: "Currency: NGN, USD, GHS, KES, ZAR or EGP",
}

export function whatsAppRegistrationMissing(details: Partial<Details>) {
  return (Object.keys(whatsAppRegistrationFields) as Field[]).filter(
    (field) => !details[field],
  )
}

function age(value: string): Details["ageBand"] | undefined {
  const normalized = value.toLowerCase().replace(/[–—]/g, "-").trim()
  if (/^(?:13\s*-\s*15|age_13_to_15)$/.test(normalized)) return "AGE_13_TO_15"
  if (/^(?:16\s*-\s*17|age_16_to_17)$/.test(normalized)) return "AGE_16_TO_17"
  if (
    /^(?:18\+|18 or (?:older|over)|adult|18 and (?:older|over))$/.test(
      normalized,
    )
  )
    return "ADULT"
}

function country(value: string) {
  return COUNTRIES.find(
    (entry) =>
      entry.code.toLowerCase() === value.toLowerCase() ||
      entry.name.toLowerCase() === value.toLowerCase(),
  )?.code
}

/** Identity details stay deterministic and server-private, never model input. */
export function collectWhatsAppRegistrationDetails(
  text: string,
  fallback?: Field,
) {
  const values = new Map<Field, string>()
  const invalid: Field[] = []
  const patch: Partial<Details> = {}
  if (
    text.length > 4096 ||
    /^\d{6}$/.test(text) ||
    /\b(?:password|passcode|otp|verification\s+code)\b/i.test(text)
  )
    return { patch, invalid, underAge: false, sensitive: true }

  const parts = text.split(
    /\r?\n|;|,(?=\s*(?:(?:business|company)(?: name)?|(?:my|your|full) name|name|email(?: address)?|country|currency|age(?: group| band)?)\s*(?::|=| is\b))/i,
  )
  for (const part of parts) {
    const labeled =
      /^\s*(?:\d+[.)]\s*)?((?:business|company)(?: name)?|(?:my|your|full) name|name|email(?: address)?|country|currency|age(?: group| band)?)\s*(?::|=| is\b)\s*(.*?)\s*$/i.exec(
        part,
      )
    if (!labeled?.[1] || labeled[2] === undefined) continue
    const key = labeled[1].toLowerCase()
    const field: Field = /business|company/.test(key)
      ? "businessName"
      : /email/.test(key)
        ? "email"
        : /country/.test(key)
          ? "countryCode"
          : /currency/.test(key)
            ? "currencyCode"
            : /age/.test(key)
              ? "ageBand"
              : "name"
    const value = labeled[2].trim()
    // Conflicting values need an explicit correction, not an arbitrary last value.
    if (values.has(field) && values.get(field) !== value) {
      invalid.push(field)
    } else values.set(field, value)
  }
  if (!values.size) {
    const tuple = text.split(/\s*,\s*/)
    if (
      tuple.length === 6 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tuple[2] ?? "")
    ) {
      const fields: Field[] = [
        "businessName",
        "name",
        "email",
        "countryCode",
        "currencyCode",
        "ageBand",
      ]
      fields.forEach((field, index) => values.set(field, tuple[index] ?? ""))
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
      values.set("email", text)
    else {
      const location = /^(.*?)\s+([A-Za-z]{3})$/.exec(text)
      if (location?.[1] && location[2] && country(location[1])) {
        values.set("countryCode", location[1])
        values.set("currencyCode", location[2])
      } else if (age(text) || /^(?:under\s*13|12|under thirteen)$/i.test(text))
        values.set("ageBand", text)
      else if (/^[123]$/.test(text) && fallback === "ageBand")
        values.set(
          "ageBand",
          text === "1" ? "13–15" : text === "2" ? "16–17" : "18+",
        )
      // A single legacy answer is unambiguous only without separators/field markers.
      else if (fallback && !/[\n,:;=@]/.test(text)) values.set(fallback, text)
    }
  }
  let underAge = false
  for (const [field, value] of values) {
    if (invalid.includes(field)) continue
    if (field === "name" || field === "businessName") {
      if (
        !value ||
        value.length > 120 ||
        [...value].some(
          (point) =>
            (point.codePointAt(0) ?? 0) < 32 || point.codePointAt(0) === 127,
        )
      )
        invalid.push(field)
      else patch[field] = value
    } else if (field === "email") {
      if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        invalid.push(field)
      else patch.email = value.toLowerCase()
    } else if (field === "countryCode") {
      const code = country(value)
      if (!code) invalid.push(field)
      else patch.countryCode = code
    } else if (field === "currencyCode") {
      const code = value.toUpperCase()
      if (!isOperatingCurrencyCode(code)) invalid.push(field)
      else patch.currencyCode = code
    } else {
      underAge = /^(?:under\s*13|under thirteen|[0-9]|1[0-2])$/i.test(value)
      const band = age(value)
      if (!band) invalid.push(field)
      else patch.ageBand = band
    }
  }
  return { patch, invalid, underAge, sensitive: false }
}
