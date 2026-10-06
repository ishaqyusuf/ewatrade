// Calling codes: https://www.itu.int/oth/t0202/en
// Côte d'Ivoire's leading 0 is significant, not a national trunk prefix:
// https://www.ituob.org/issues/1212-en/
const CALLING_CODES: Record<string, string> = {
  NG: "+234",
  GH: "+233",
  KE: "+254",
  ZA: "+27",
  EG: "+20",
  TZ: "+255",
  UG: "+256",
  SN: "+221",
  CI: "+225",
  ET: "+251",
}
const TRUNK_ZERO_COUNTRIES = new Set([
  "NG",
  "GH",
  "KE",
  "ZA",
  "EG",
  "TZ",
  "UG",
  "ET",
])

export function getCountryCallingCode(country: string) {
  return CALLING_CODES[country] ?? ""
}

function compactPhone(phone: string) {
  return phone
    .trim()
    .replace(/[\s().-]/g, "")
    .replace(/^00/, "+")
}

export function getNationalSignupPhone(phone: string, country: string) {
  const compact = compactPhone(phone)
  const prefix = getCountryCallingCode(country)
  if (prefix && compact.startsWith(prefix)) return compact.slice(prefix.length)
  if (country === "OTHER" && compact.startsWith("+")) return compact.slice(1)
  return phone
}

export function resolveSignupPhone(
  phone: string,
  country: string,
): string | null {
  const compact = compactPhone(phone)
  const prefix = getCountryCallingCode(country)
  if (!prefix && country !== "OTHER") return null
  if (prefix && compact.startsWith("+") && !compact.startsWith(prefix))
    return null
  let national =
    prefix && compact.startsWith(prefix)
      ? compact.slice(prefix.length)
      : compact.replace(/^\+/, "")
  if (TRUNK_ZERO_COUNTRIES.has(country)) national = national.replace(/^0/, "")
  const formatted = `${prefix || "+"}${national}`
  return /^\+[1-9]\d{6,14}$/.test(formatted) ? formatted : null
}

export function getSignupPhoneForCountry(
  phone: string,
  previousCountry: string,
  nextCountry: string,
) {
  if (nextCountry === "OTHER")
    return resolveSignupPhone(phone, previousCountry) ?? phone
  if (previousCountry === "OTHER")
    return getNationalSignupPhone(
      resolveSignupPhone(phone, "OTHER") ?? phone,
      nextCountry,
    )
  return getNationalSignupPhone(phone, previousCountry)
}
