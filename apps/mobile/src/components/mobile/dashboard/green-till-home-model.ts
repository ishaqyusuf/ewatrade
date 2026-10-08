import type { GreenTillTint } from "@/lib/green-till-theme"
import { formatMinorMoney } from "@ewatrade/utils"
import type { StatusPillTone } from "../green-till/kit"

/** Local midnight for the day of `date`. */
export function startOfLocalDay(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

/** Today's and yesterday's windows as [start, end) pairs in local time. */
export function salesWindows(now: Date) {
  const today = startOfLocalDay(now)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  return {
    today: { createdAfter: today, createdBefore: tomorrow },
    yesterday: { createdAfter: yesterday, createdBefore: today },
  }
}

/** Order statuses that count as sales (not drafts, cancellations or refunds). */
export const SALE_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
] as const

/** Change vs yesterday, or null when yesterday had no sales to compare with. */
export function salesDelta(todayMinor: number, yesterdayMinor: number) {
  if (yesterdayMinor <= 0) return null
  const change = ((todayMinor - yesterdayMinor) / yesterdayMinor) * 100
  const rounded = Math.round(Math.abs(change))
  return {
    direction: change >= 0 ? ("up" as const) : ("down" as const),
    value: `${rounded}%`,
  }
}

export function timeLabel(date: Date | string) {
  const value = new Date(date)
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
}

export function countLabel(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

/** The payment pill on a recent order row. */
export function orderPaymentPill(order: {
  amountPaidMinor: number
  balanceDueMinor: number
  status: string
}): { label: string; tone: StatusPillTone } {
  if (order.status === "CANCELLED") return { label: "Cancelled", tone: "muted" }
  if (order.status === "REFUNDED") return { label: "Refunded", tone: "muted" }
  if (order.status === "DRAFT") return { label: "Draft", tone: "muted" }
  if (order.balanceDueMinor <= 0) return { label: "Paid", tone: "ok" }
  if (order.amountPaidMinor > 0) return { label: "Part paid", tone: "warn" }
  return { label: "Unpaid", tone: "danger" }
}

const AVATAR_TINTS: GreenTillTint[] = ["mint", "sky", "lilac", "amber"]

export function recordAvatar(name: string, index: number) {
  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length] as GreenTillTint
  const trimmed = name.trim()
  if (!trimmed || trimmed.toLowerCase() === "walk-in customer")
    return { icon: "Store" as const, tint }
  const initials = trimmed
    .split(/\s+/)
    .map((part) => Array.from(part)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return { initials, tint }
}

export type GreenTillHomeStage =
  | "blocked"
  | "loading"
  | "setup"
  | "first-order"
  | "everyday"

/** Which Home to show for an owner. */
export function greenTillHomeStage(input: {
  catalog: "empty" | "unfinished" | "ready"
  hasOrderHistory: boolean
  workspace:
    | "available"
    | "cached"
    | "loading"
    | "offline-unknown"
    | "unavailable"
}): GreenTillHomeStage {
  if (input.workspace === "loading") return "loading"
  if (
    input.workspace === "unavailable" ||
    input.workspace === "offline-unknown"
  )
    return "blocked"
  if (input.hasOrderHistory) return "everyday"
  return input.catalog === "ready" ? "first-order" : "setup"
}

/** Money as the Home design shows it: no ".00" on whole amounts. */
export function homeMoney(valueMinor: number, currencyCode: string) {
  const formatted = formatMinorMoney(valueMinor, currencyCode)
  return Number.isInteger(valueMinor / 100)
    ? formatted.replace(/\.00$/, "")
    : formatted
}
