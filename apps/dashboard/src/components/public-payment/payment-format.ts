import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils/currency"

export type PublicPaymentLink = RouterOutputs["businessBanking"]["paymentLink"]
export type PublicReportStatus =
  RouterOutputs["businessBanking"]["reportStatus"]
export type PaymentLinkItem = PublicPaymentLink["items"][number]

export function money(valueMinor: number, currencyCode: string) {
  return formatMinorMoney(valueMinor, currencyCode)
}

/** Plain digits a banking app accepts in its amount field, e.g. "15000" or "15000.5". */
export function copyableAmount(valueMinor: number) {
  return (valueMinor / 100).toFixed(2).replace(/\.00$/, "")
}

/** 0123456789 → 012 345 6789, the grouping Nigerian banks print. */
export function spacedAccountNumber(accountNumber: string) {
  return /^\d{10}$/.test(accountNumber)
    ? `${accountNumber.slice(0, 3)} ${accountNumber.slice(3, 6)} ${accountNumber.slice(6)}`
    : accountNumber
}

export function lastDigits(accountNumber: string) {
  return `••${accountNumber.slice(-4)}`
}

export function businessInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("")
  return letters || "E"
}

export function quantityLabel(quantity: string) {
  const value = Number(quantity)
  return Number.isFinite(value) ? String(value) : quantity
}

/** One line under the hero amount: "2 × Rice 5kg, 1 × Oil" (services by name). */
export function itemsSummary(items: PaymentLinkItem[]) {
  if (items.length === 0) return ""
  const parts = items
    .slice(0, 3)
    .map((item) =>
      item.kind === "SERVICE"
        ? item.name
        : `${quantityLabel(item.quantity)} × ${item.name}`,
    )
  const more = items.length - parts.length
  return more > 0 ? `${parts.join(", ")} and ${more} more` : parts.join(", ")
}

export function formatReportedAt(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}
