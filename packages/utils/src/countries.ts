import { type OperatingCurrencyCode, isOperatingCurrencyCode } from "./currency"

export type Country = {
  /** ISO 3166-1 alpha-2, such as NG. */
  code: string
  /** International dialling code without the plus, such as 234. */
  dialCode: string
  name: string
}

/** Countries whose currency the app supports, in market order. */
const PRIMARY_COUNTRIES: readonly Country[] = [
  { code: "NG", dialCode: "234", name: "Nigeria" },
  { code: "GH", dialCode: "233", name: "Ghana" },
  { code: "KE", dialCode: "254", name: "Kenya" },
  { code: "ZA", dialCode: "27", name: "South Africa" },
  { code: "EG", dialCode: "20", name: "Egypt" },
]

const OTHER_COUNTRIES: readonly Country[] = [
  { code: "DZ", dialCode: "213", name: "Algeria" },
  { code: "AO", dialCode: "244", name: "Angola" },
  { code: "AR", dialCode: "54", name: "Argentina" },
  { code: "AU", dialCode: "61", name: "Australia" },
  { code: "BD", dialCode: "880", name: "Bangladesh" },
  { code: "BE", dialCode: "32", name: "Belgium" },
  { code: "BJ", dialCode: "229", name: "Benin" },
  { code: "BW", dialCode: "267", name: "Botswana" },
  { code: "BR", dialCode: "55", name: "Brazil" },
  { code: "BF", dialCode: "226", name: "Burkina Faso" },
  { code: "BI", dialCode: "257", name: "Burundi" },
  { code: "CM", dialCode: "237", name: "Cameroon" },
  { code: "CA", dialCode: "1", name: "Canada" },
  { code: "CV", dialCode: "238", name: "Cape Verde" },
  { code: "CF", dialCode: "236", name: "Central African Republic" },
  { code: "TD", dialCode: "235", name: "Chad" },
  { code: "CN", dialCode: "86", name: "China" },
  { code: "KM", dialCode: "269", name: "Comoros" },
  { code: "CG", dialCode: "242", name: "Congo" },
  { code: "CD", dialCode: "243", name: "Congo (DRC)" },
  { code: "CI", dialCode: "225", name: "Côte d’Ivoire" },
  { code: "DK", dialCode: "45", name: "Denmark" },
  { code: "DJ", dialCode: "253", name: "Djibouti" },
  { code: "GQ", dialCode: "240", name: "Equatorial Guinea" },
  { code: "ER", dialCode: "291", name: "Eritrea" },
  { code: "SZ", dialCode: "268", name: "Eswatini" },
  { code: "ET", dialCode: "251", name: "Ethiopia" },
  { code: "FR", dialCode: "33", name: "France" },
  { code: "GA", dialCode: "241", name: "Gabon" },
  { code: "GM", dialCode: "220", name: "Gambia" },
  { code: "DE", dialCode: "49", name: "Germany" },
  { code: "GN", dialCode: "224", name: "Guinea" },
  { code: "GW", dialCode: "245", name: "Guinea-Bissau" },
  { code: "IN", dialCode: "91", name: "India" },
  { code: "ID", dialCode: "62", name: "Indonesia" },
  { code: "IE", dialCode: "353", name: "Ireland" },
  { code: "IT", dialCode: "39", name: "Italy" },
  { code: "JP", dialCode: "81", name: "Japan" },
  { code: "KW", dialCode: "965", name: "Kuwait" },
  { code: "LS", dialCode: "266", name: "Lesotho" },
  { code: "LR", dialCode: "231", name: "Liberia" },
  { code: "LY", dialCode: "218", name: "Libya" },
  { code: "MG", dialCode: "261", name: "Madagascar" },
  { code: "MW", dialCode: "265", name: "Malawi" },
  { code: "MY", dialCode: "60", name: "Malaysia" },
  { code: "ML", dialCode: "223", name: "Mali" },
  { code: "MR", dialCode: "222", name: "Mauritania" },
  { code: "MU", dialCode: "230", name: "Mauritius" },
  { code: "MX", dialCode: "52", name: "Mexico" },
  { code: "MA", dialCode: "212", name: "Morocco" },
  { code: "MZ", dialCode: "258", name: "Mozambique" },
  { code: "NA", dialCode: "264", name: "Namibia" },
  { code: "NL", dialCode: "31", name: "Netherlands" },
  { code: "NZ", dialCode: "64", name: "New Zealand" },
  { code: "NE", dialCode: "227", name: "Niger" },
  { code: "NO", dialCode: "47", name: "Norway" },
  { code: "PK", dialCode: "92", name: "Pakistan" },
  { code: "PH", dialCode: "63", name: "Philippines" },
  { code: "PT", dialCode: "351", name: "Portugal" },
  { code: "QA", dialCode: "974", name: "Qatar" },
  { code: "RW", dialCode: "250", name: "Rwanda" },
  { code: "ST", dialCode: "239", name: "São Tomé and Príncipe" },
  { code: "SA", dialCode: "966", name: "Saudi Arabia" },
  { code: "SN", dialCode: "221", name: "Senegal" },
  { code: "SC", dialCode: "248", name: "Seychelles" },
  { code: "SL", dialCode: "232", name: "Sierra Leone" },
  { code: "SG", dialCode: "65", name: "Singapore" },
  { code: "SO", dialCode: "252", name: "Somalia" },
  { code: "KR", dialCode: "82", name: "South Korea" },
  { code: "SS", dialCode: "211", name: "South Sudan" },
  { code: "ES", dialCode: "34", name: "Spain" },
  { code: "SD", dialCode: "249", name: "Sudan" },
  { code: "SE", dialCode: "46", name: "Sweden" },
  { code: "CH", dialCode: "41", name: "Switzerland" },
  { code: "TZ", dialCode: "255", name: "Tanzania" },
  { code: "TG", dialCode: "228", name: "Togo" },
  { code: "TN", dialCode: "216", name: "Tunisia" },
  { code: "TR", dialCode: "90", name: "Turkey" },
  { code: "UG", dialCode: "256", name: "Uganda" },
  { code: "AE", dialCode: "971", name: "United Arab Emirates" },
  { code: "GB", dialCode: "44", name: "United Kingdom" },
  { code: "US", dialCode: "1", name: "United States" },
  { code: "ZM", dialCode: "260", name: "Zambia" },
  { code: "ZW", dialCode: "263", name: "Zimbabwe" },
]

/** Supported markets first, then every other country by name. */
export const COUNTRIES: readonly Country[] = [
  ...PRIMARY_COUNTRIES,
  ...OTHER_COUNTRIES,
]

export const DEFAULT_COUNTRY_CODE = "NG"

const COUNTRY_BY_CODE = new Map(
  COUNTRIES.map((country) => [country.code, country]),
)

const COUNTRY_CURRENCY: Record<string, OperatingCurrencyCode> = {
  EG: "EGP",
  GH: "GHS",
  KE: "KES",
  NG: "NGN",
  US: "USD",
  ZA: "ZAR",
}

export function findCountry(code?: string | null) {
  return (
    COUNTRY_BY_CODE.get(
      String(code ?? "")
        .trim()
        .toUpperCase(),
    ) ?? null
  )
}

export function getCountry(code?: string | null): Country {
  return findCountry(code) ?? (findCountry(DEFAULT_COUNTRY_CODE) as Country)
}

/** The flag emoji for an ISO country code, built from regional indicators. */
export function countryFlag(code: string) {
  const letters = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(letters)) return ""
  return String.fromCodePoint(
    ...Array.from(letters, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  )
}

/** The operating currency for a country, or null when it has none of its own. */
export function currencyForCountry(
  code?: string | null,
): OperatingCurrencyCode | null {
  const currency =
    COUNTRY_CURRENCY[
      String(code ?? "")
        .trim()
        .toUpperCase()
    ]
  return currency && isOperatingCurrencyCode(currency) ? currency : null
}

export function searchCountries(query: string) {
  const term = query.trim().toLowerCase().replace(/^\+/, "")
  if (!term) return COUNTRIES
  return COUNTRIES.filter(
    (country) =>
      country.name.toLowerCase().includes(term) ||
      country.code.toLowerCase() === term ||
      country.dialCode.startsWith(term),
  )
}

/**
 * The full international number for a local entry, such as 0803 123 4567
 * with 234 → +2348031234567. An entry that already starts with + is kept.
 */
export function toInternationalPhone(dialCode: string, local: string) {
  const value = local.trim()
  if (!value) return ""
  if (value.startsWith("+")) return `+${value.replace(/\D/g, "")}`
  const digits = value.replace(/\D/g, "").replace(/^0+/, "")
  return digits ? `+${dialCode}${digits}` : ""
}

/** The local part of a stored number for the phone field beside a +code. */
export function toLocalPhone(dialCode: string, value?: string | null) {
  const phone = String(value ?? "").trim()
  const compact = phone.replace(/[^\d+]/g, "")
  if (compact.startsWith(`+${dialCode}`))
    return compact.slice(dialCode.length + 1)
  return phone
}
