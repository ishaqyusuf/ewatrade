import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"

/** Plain names for stock operation types, as a shop owner reads Stock history. */
const STOCK_CHANGE_LABELS: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  RECEIPT: "Stock in",
  RESERVATION_COMMIT: "Sold (order confirmed)",
  SALE_FULFILLMENT: "Order handed over",
  RETURN: "Returned by customer",
  COUNT_RECONCILIATION: "Count",
  ADJUSTMENT: "Correction",
  TRANSFER: "Transfer",
  TRANSFORMATION: "Packed or unpacked",
  STOCK_TRANSITION: "Unit change",
  CUSTODY_ASSIGNMENT: "Handed to staff",
  CUSTODY_RETURN: "Returned by staff",
  CORRECTION: "Corrected",
  CORRECTION_REVERSAL: "Undone",
  CORRECTION_REPLACEMENT: "Corrected",
  INTERNAL_USE: "Used in the business",
}

const SOURCE_LABELS: Record<string, string> = {
  dashboard_inventory: "Dashboard",
  stock_count: "Stock count",
  mobile_inventory: "Mobile app",
  assistant: "Assistant",
}

function sentence(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toUpperCase())
}

export function stockChangeLabel(type: string) {
  return STOCK_CHANGE_LABELS[type.toUpperCase()] ?? sentence(type)
}

export function stockSourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? sentence(source)
}

export type StockChangeGroup = "in" | "out" | "count" | "move"

export const stockChangeGroups: {
  id: "all" | StockChangeGroup
  label: string
}[] = [
  { id: "all", label: "All changes" },
  { id: "in", label: "Stock in" },
  { id: "out", label: "Stock out" },
  { id: "count", label: "Counts" },
  { id: "move", label: "Moves" },
]

const MOVES = new Set([
  "TRANSFER",
  "TRANSFORMATION",
  "CUSTODY_ASSIGNMENT",
  "CUSTODY_RETURN",
])

/** Groups for the Stock history filter; adds and removals follow the net change. */
export function stockChangeGroup(row: {
  type: string
  canonicalNetEffect: string
}): StockChangeGroup {
  const type = row.type.toUpperCase()
  if (type === "COUNT_RECONCILIATION") return "count"
  if (MOVES.has(type)) return "move"
  return compareExactDecimals(row.canonicalNetEffect, "0") < 0 ? "out" : "in"
}

/** Dates in the viewer's own time, e.g. "19 Oct 2026, 10:15". */
export function stockDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Not sent",
  DISPATCHED: "On the way",
  IN_TRANSIT: "On the way",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
  EXCEPTION: "Needs checking",
}

export function transferStatusLabel(status: string) {
  return TRANSFER_STATUS_LABELS[status.toUpperCase()] ?? sentence(status)
}
