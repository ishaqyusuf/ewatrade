/**
 * Pure helpers for manual bank-transfer payment links (approved Business
 * banking 02 design). Customers' "I have paid" is a claim the business checks;
 * nothing here records money.
 */

/** Nigerian account numbers (NUBAN): exactly 10 digits, leading zeros kept. */
export function bankAccountNumberProblem(value: string) {
  const digits = value.trim()
  if (!digits) return "Enter the 10-digit account number."
  if (!/^\d+$/.test(digits)) return "Use digits only."
  if (digits.length !== 10)
    return `Account numbers in Nigeria have 10 digits. This one has ${digits.length}.`
  return null
}

/** "0123456789" → "012 345 6789", the way banks print it. */
export function spacedAccountNumber(value: string) {
  return value.length === 10
    ? `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}`
    : value
}

export function maskedAccountSuffix(suffix: string) {
  return suffix ? `••${suffix}` : ""
}

/** Common Nigerian banks and wallets; any other name can still be typed. */
export const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank",
  "Ecobank",
  "Fidelity Bank",
  "First Bank",
  "FCMB",
  "Globus Bank",
  "GTBank",
  "Heritage Bank",
  "Jaiz Bank",
  "Keystone Bank",
  "Kuda",
  "Moniepoint",
  "OPay",
  "PalmPay",
  "Polaris Bank",
  "Providus Bank",
  "Stanbic IBTC",
  "Standard Chartered",
  "Sterling Bank",
  "SunTrust Bank",
  "Titan Trust Bank",
  "UBA",
  "Union Bank",
  "Unity Bank",
  "VFD Microfinance Bank",
  "Wema Bank",
  "Zenith Bank",
] as const

/** Stable idempotency ids: one per form or create attempt. */
export function newOperationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

/** How long a payment link works; the API allows 10 minutes to 72 hours. */
export const LINK_LIFETIMES = [
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
  { value: "4320", label: "72 hours" },
] as const
export const DEFAULT_LINK_LIFETIME = "1440"

/** The text inside a wa.me link, or "" when there is none. */
export function whatsAppText(url: string | null) {
  if (!url) return ""
  try {
    return new URL(url).searchParams.get("text") ?? ""
  } catch {
    return ""
  }
}

/**
 * The same wa.me phone with edited text. Returns null when the URL isn't a
 * wa.me link with a phone, so callers fall back to Copy only.
 */
export function rebuildWhatsAppUrl(url: string | null, text: string) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "wa.me") return null
    const phone = parsed.pathname.replace(/\D/g, "")
    if (!/^[1-9]\d{7,14}$/.test(phone)) return null
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  } catch {
    return null
  }
}

/** "+234 803 000 4521" style label for the wa.me phone shown above the message. */
export function whatsAppPhoneLabel(url: string | null) {
  if (!url) return null
  try {
    const phone = new URL(url).pathname.replace(/\D/g, "")
    return phone ? `+${phone}` : null
  } catch {
    return null
  }
}

/** Message for a link when the order has no saved phone (Copy only). */
export function paymentLinkMessage(input: {
  orderNumber: string
  url: string
}) {
  return `Hello, here is your payment link for order ${input.orderNumber}: ${input.url}`
}

export const NOT_RECEIVED_REASONS = [
  "Not in our account yet.",
  "Please send the transfer receipt.",
  "It went to an account we don't use for this order.",
] as const

export const NOT_RECEIVED_NOTE_MAX = 500

/** "YYYY-MM-DD" for today in the business time zone. */
export function businessToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

/**
 * The received date as an instant the server accepts (never in the future):
 * today means now-ish, earlier days mean midday that day. Callers keep the
 * result stable across retries so a replay matches the first decision.
 */
export function receivedAtFromDay(day: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const midday = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 11),
  )
  if (Number.isNaN(midday.getTime())) return null
  return midday.getTime() > now.getTime() ? now : midday
}

/** The live line under "What arrived in your account". */
export function receivedLine(input: {
  receivedMinor: number | null
  claimedMinor: number
  balanceMinor: number
}):
  | { kind: "empty" }
  | { kind: "over" }
  | { kind: "records"; lessBy: number; left: number } {
  const { receivedMinor, claimedMinor, balanceMinor } = input
  if (!receivedMinor || receivedMinor <= 0) return { kind: "empty" }
  if (receivedMinor > balanceMinor) return { kind: "over" }
  return {
    kind: "records",
    lessBy: Math.max(0, claimedMinor - receivedMinor),
    left: balanceMinor - receivedMinor,
  }
}

/** A tRPC-style error code, when the error carries one. */
export function errorCode(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { code?: unknown } | null }).data
    if (data && typeof data.code === "string") return data.code
  }
  return null
}
