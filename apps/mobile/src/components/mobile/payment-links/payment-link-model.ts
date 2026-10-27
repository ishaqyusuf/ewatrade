import { formatMinorMoney } from "@ewatrade/utils"

/** How long a new payment link works (server accepts 10 minutes to 72 hours). */
export const PAYMENT_LINK_LIFETIMES = [
  { minutes: 10, label: "10 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 360, label: "6 hours" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 2880, label: "48 hours" },
  { minutes: 4320, label: "72 hours" },
] as const
export const DEFAULT_PAYMENT_LINK_LIFETIME = 1440

/** Free-text reasons only prefill the box; the merchant can change them. */
export const NOT_RECEIVED_REASONS = [
  "Not in our account yet.",
  "Please send the transfer receipt.",
  "It went to an account we don't use for this order.",
] as const
export const NOT_RECEIVED_REASON_MAX = 500

/** A stable operation id for one create/review attempt. */
export function newOperationId(prefix: string, uuid: string) {
  return `${prefix}-${uuid}`.slice(0, 120)
}

/** The tRPC error code (FORBIDDEN, CONFLICT, …) of a failed request. */
export function errorCode(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { code?: unknown } | null }).data
    if (data && typeof data.code === "string") return data.code
  }
  return null
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Rebuilds the wa.me link for an edited message, keeping only the saved
 * Order phone digits the server put in its own link.
 */
export function whatsAppWithText(whatsappUrl: string | null, text: string) {
  if (!whatsappUrl) return null
  const phone = /^https:\/\/wa\.me\/(\d{8,15})(?:[/?#]|$)/.exec(
    whatsappUrl,
  )?.[1]
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/** "0123456789" → "012 345 6789". */
export function spacedAccountNumber(value: string) {
  return value.length === 10
    ? `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}`
    : value
}

export function accountSuffix(value: string | null | undefined) {
  return value ? `••${value.slice(-4)}` : ""
}

/** Keep digits only, at most ten, with leading zeros. */
export function accountNumberInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 10)
}

export function accountNumberError(value: string) {
  if (!value || value.length === 10) return undefined
  return `Account numbers in Nigeria have 10 digits. This one has ${value.length}.`
}

export function paymentNotificationText(item: {
  payerName: string
  amountMinor: number
  currencyCode: string
  orderNumber: string
}) {
  return `Payment notification from ${item.payerName}. ${formatMinorMoney(item.amountMinor, item.currencyCode)} for order ${item.orderNumber}.`
}

export function shortDateTime(value: Date | string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "12 min ago", "3 h ago", or a short date. */
export function ageLabel(value: Date | string, now = Date.now()) {
  const minutes = Math.max(
    0,
    Math.round((now - new Date(value).getTime()) / 60_000),
  )
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`
  return shortDateTime(value)
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

/**
 * When the money arrived. Today uses the moment the merchant moved to the
 * confirm step (never in the future); earlier days use midday so the
 * timezone can't move the date.
 */
export function receivedAtFor(day: string, confirmedAt: Date) {
  if (day === localDay(confirmedAt)) return confirmedAt
  const [year, month, date] = day.split("-").map(Number)
  const at = new Date(year, (month ?? 1) - 1, date ?? 1, 12, 0, 0, 0)
  return Number.isFinite(at.getTime()) && at <= confirmedAt ? at : confirmedAt
}

export type OrderPaymentAccount = {
  id: string
  name: string
  purpose: string
  paymentMethods: string[]
  paused: boolean
}

/** The Record payment accounts that can take a confirmed bank transfer. */
export function transferAccounts(accounts: readonly OrderPaymentAccount[]) {
  return accounts.filter(
    (account) =>
      account.purpose === "BANK" &&
      !account.paused &&
      account.paymentMethods.includes("bank_transfer"),
  )
}

export function isOwnerOrAdmin(role: string | null | undefined) {
  return ["OWNER", "ADMIN"].includes(role?.trim().toUpperCase() ?? "")
}
