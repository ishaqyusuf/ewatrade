export const OPERATING_CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "EGP", label: "Egyptian Pound", symbol: "E£" },
] as const

export type OperatingCurrencyCode =
  (typeof OPERATING_CURRENCIES)[number]["code"]

export const OPERATING_CURRENCY_CODES = OPERATING_CURRENCIES.map(
  ({ code }) => code,
) as [OperatingCurrencyCode, ...OperatingCurrencyCode[]]

const CURRENCY_BY_CODE = new Map<string, (typeof OPERATING_CURRENCIES)[number]>(
  OPERATING_CURRENCIES.map((currency) => [currency.code, currency]),
)

const COUNTRY_CURRENCY: Record<string, OperatingCurrencyCode> = {
  EG: "EGP",
  GH: "GHS",
  KE: "KES",
  NG: "NGN",
  ZA: "ZAR",
}

function normalizedCode(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

export function isOperatingCurrencyCode(
  value?: string | null,
): value is OperatingCurrencyCode {
  return CURRENCY_BY_CODE.has(normalizedCode(value))
}

export function normalizeOperatingCurrencyCode(
  value?: string | null,
  fallback: OperatingCurrencyCode = "NGN",
) {
  const code = normalizedCode(value)
  return isOperatingCurrencyCode(code) ? code : fallback
}

export function suggestCurrencyForCountry(
  countryCode?: string | null,
): OperatingCurrencyCode {
  return COUNTRY_CURRENCY[normalizedCode(countryCode)] ?? "USD"
}

export function getCurrencySymbol(currencyCode?: string | null) {
  const code = normalizedCode(currencyCode) || "NGN"
  return CURRENCY_BY_CODE.get(code)?.symbol ?? code
}

export function normalizeCurrencyInput(value?: string | number | null) {
  const input = String(value ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "")
  const isNegative = input.startsWith("-")
  const unsigned = input.replace(/-/g, "")
  const [whole = "", ...decimalParts] = unsigned.split(".")
  const decimal = decimalParts.join("").slice(0, 2)
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "")
  const sign = isNegative && (normalizedWhole || decimalParts.length) ? "-" : ""

  if (!normalizedWhole && decimalParts.length === 0) return ""
  if (decimalParts.length > 0) {
    return `${sign}${normalizedWhole || "0"}.${decimal}`
  }

  return `${sign}${normalizedWhole}`
}

export function formatCurrencyInput(value?: string | number | null) {
  const normalized = normalizeCurrencyInput(value)
  if (!normalized) return ""

  const isNegative = normalized.startsWith("-")
  const unsigned = normalized.replace(/^-/, "")
  const [whole = "0", decimal] = unsigned.split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const sign = isNegative ? "-" : ""

  return decimal === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped}.${decimal}`
}

export function majorToMinor(value?: string | number | null): number | null {
  const normalized = normalizeCurrencyInput(value)
  if (!normalized || normalized === "-" || normalized === "-0.") return null
  const major = Number(normalized)
  return Number.isFinite(major) ? Math.round(major * 100) : null
}

export function minorToMajorInput(valueMinor?: number | null) {
  if (valueMinor === null || valueMinor === undefined) return ""
  if (!Number.isFinite(valueMinor)) return ""

  const major = Math.trunc(valueMinor) / 100
  return Number.isInteger(major)
    ? String(major)
    : major.toFixed(2).replace(/0$/, "")
}

export function formatMinorMoney(
  valueMinor?: number | null,
  currencyCode = "NGN",
) {
  const safeMinor = Number.isFinite(valueMinor) ? Number(valueMinor) : 0
  const code = normalizedCode(currencyCode) || "NGN"
  const symbol = getCurrencySymbol(code)
  const absolute = Math.abs(safeMinor) / 100
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(absolute)

  return `${safeMinor < 0 ? "-" : ""}${symbol}${amount}`
}

export function formatMajorMoney(
  value?: number | string | null,
  currencyCode = "NGN",
) {
  const major = Number(value ?? 0)
  return formatMinorMoney(
    Number.isFinite(major) ? Math.round(major * 100) : 0,
    currencyCode,
  )
}
