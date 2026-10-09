import { formatMinorMoney } from "@ewatrade/utils"

type LedgerOrder = {
  id: string
  createdAt: Date | string
  totalMinor: number
  currencyCode: string
  balanceDueMinor: number
  status: string
}
export function ledgerMoney(
  orders: readonly LedgerOrder[],
  key: "totalMinor" | "balanceDueMinor" = "totalMinor",
) {
  const first = orders[0]
  if (!first) return "—"
  if (new Set(orders.map((order) => order.currencyCode)).size !== 1)
    return "Mixed currencies"
  return formatMinorMoney(
    orders.reduce(
      (sum, order) =>
        sum +
        (key === "balanceDueMinor" &&
        ["CANCELLED", "REFUNDED"].includes(order.status)
          ? 0
          : order[key]),
      0,
    ),
    first.currencyCode,
  ).replace(/\.00$/, "")
}
/** "Today", "Yesterday", "Tomorrow", else "8 Oct 2026". */
export function ledgerDayLabel(date: Date | string, now = new Date()) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days === -1) return "Tomorrow"
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(day)
}

/** Where each order sits in its day's card, so rows can round the ends. */
export function ledgerDayPositions(orders: readonly LedgerOrder[]) {
  const positions = new Map<string, { first: boolean; last: boolean }>()
  orders.forEach((order, index) => {
    const key = new Date(order.createdAt).toDateString()
    const previous = orders[index - 1]
    const next = orders[index + 1]
    positions.set(order.id, {
      first: !previous || new Date(previous.createdAt).toDateString() !== key,
      last: !next || new Date(next.createdAt).toDateString() !== key,
    })
  })
  return positions
}

/** "10 × Broilers", or "10 × Broilers +2 more". */
export function ledgerItemsLabel(order: {
  lines: readonly {
    quantity: string | number
    snapshot?: { catalogItemName?: string | null } | null
  }[]
}) {
  const [first, ...rest] = order.lines
  if (!first) return "No items"
  const quantity = Number(first.quantity)
  const name = first.snapshot?.catalogItemName ?? "Item"
  return `${Number.isFinite(quantity) ? quantity : first.quantity} × ${name}${rest.length ? ` +${rest.length} more` : ""}`
}

/** The fulfilment line shown under a row while work is still open. */
export function ledgerFulfillmentLine(status: string) {
  const lines: Record<
    string,
    { label: string; icon: "Package" | "Store" | "Truck" | "Clock" }
  > = {
    PENDING: { label: "Awaiting confirmation", icon: "Clock" },
    CONFIRMED: { label: "Confirmed · not fulfilled", icon: "Package" },
    FULFILLING: { label: "In fulfilment", icon: "Package" },
    READY_FOR_PICKUP: { label: "Ready for pickup", icon: "Store" },
    OUT_FOR_DELIVERY: { label: "Out for delivery", icon: "Truck" },
  }
  return lines[status] ?? null
}

export function ledgerDayHeaders(orders: readonly LedgerOrder[]) {
  const days = new Map<string, LedgerOrder[]>()
  for (const order of orders) {
    const key = new Date(order.createdAt).toDateString()
    const group = days.get(key) ?? []
    group.push(order)
    days.set(key, group)
  }
  const headers = new Map<
    string,
    { label: string; total: string; count: number }
  >()
  for (const group of days.values()) {
    const first = group[0]
    if (!first) continue
    headers.set(first.id, {
      label: ledgerDayLabel(first.createdAt),
      total: ledgerMoney(group),
      count: group.length,
    })
  }
  return headers
}
export function ledgerPayment(status: string) {
  if (status === "PAID") return { label: "Paid", tone: "ok" as const }
  if (status === "PARTIALLY_PAID")
    return { label: "Part paid", tone: "warn" as const }
  if (status === "REFUNDED")
    return { label: "Refunded", tone: "muted" as const }
  if (status === "FAILED")
    return { label: "Payment failed", tone: "danger" as const }
  if (status === "AUTHORIZED")
    return { label: "Authorized", tone: "info" as const }
  return { label: "Unpaid", tone: "danger" as const }
}
export function ledgerFulfillment(status: string) {
  const labels: Record<string, string> = {
    READY_FOR_PICKUP: "Ready for pickup",
    OUT_FOR_DELIVERY: "Out for delivery",
    FULFILLING: "In fulfilment",
    CONFIRMED: "Confirmed",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded",
    DRAFT: "Draft",
    PENDING: "Awaiting confirmation",
  }
  return labels[status] ?? "Order recorded"
}

/** "Today, 09:58" for headers and delivery rows. */
export function ledgerWhen(date: Date | string, now = new Date()) {
  const value = new Date(date)
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value)
  return `${ledgerDayLabel(value, now)}, ${time}`
}
