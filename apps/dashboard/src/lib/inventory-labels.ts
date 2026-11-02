import type { StockHistoryCategoryFilter } from "@/hooks/use-stock-history-filter-params"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import { formatStockQuantity } from "./inventory-view"

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

/**
 * Stock history page input from the URL filters; the server applies the group
 * and search before each page, so the page and its prefetch share one key.
 */
export function stockHistoryPageInput(input: {
  storeId?: string
  q?: string | null
  filter?: string | null
  categories?: StockHistoryCategoryFilter
}) {
  const group = stockChangeGroups.find(
    (row) => row.id !== "all" && row.id === input.filter,
  )?.id as StockChangeGroup | undefined
  const search = input.q?.trim().slice(0, 120)
  return {
    storeId: input.storeId,
    limit: 50,
    ...(group ? { group } : {}),
    ...(search ? { search } : {}),
    ...stockCategoryInput(input.categories),
  }
}

/**
 * Totals input: Store and categories only. The server totals take neither the
 * search nor the Stock history group, so the totals view says what it covers.
 */
export function stockHistoryTotalsInput(input: {
  storeId?: string
  categories?: StockHistoryCategoryFilter
}) {
  return { storeId: input.storeId, ...stockCategoryInput(input.categories) }
}

function stockCategoryInput(filter?: StockHistoryCategoryFilter) {
  if (filter?.uncategorized) return { uncategorized: true }
  return filter?.categoryNameIds.length
    ? { categoryNameIds: filter.categoryNameIds }
    : {}
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

/** A net stock change with its sign and unit, e.g. "+1,180 eggs" or "−24 eggs". */
export function stockNetChangeText(value: string, unitName: string | null) {
  const sign = compareExactDecimals(value, "0")
  const amount = value.replace(/^-/, "")
  const text = unitName ? formatStockQuantity(amount, unitName) : amount
  return `${sign > 0 ? "+" : sign < 0 ? "−" : ""}${text}`
}

/** "From 3 changes · 1 correction included" under the Stock history totals. */
export function stockTotalsFromText(input: {
  operationCount: number
  correctionCount: number
}) {
  if (!input.operationCount) return "No changes"
  return `From ${plural(input.operationCount, "change")}${input.correctionCount ? ` · ${plural(input.correctionCount, "correction")} included` : ""}`
}

/**
 * Totals cover the Store and categories only. When the search or a group also
 * narrows the list, say so, e.g. "Search “house” and Stock in only filter…".
 */
export function stockTotalsScopeNote(input: {
  q?: string | null
  filter?: string | null
  categories: "names" | "uncategorized" | "none"
  storeLabel: string
}) {
  const search = input.q?.trim()
  const group = stockChangeGroups.find(
    (row) => row.id !== "all" && row.id === input.filter,
  )?.label
  const parts = [search ? `Search “${search}”` : null, group].filter(Boolean)
  if (!parts.length) return null
  const covers =
    input.categories === "names"
      ? "with these categories"
      : input.categories === "uncategorized"
        ? "with no categories"
        : `in ${input.storeLabel}`
  return `${parts.join(" and ")} only ${parts.length > 1 ? "filter" : "filters"} the list below. Net change counts every change ${covers}.`
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
