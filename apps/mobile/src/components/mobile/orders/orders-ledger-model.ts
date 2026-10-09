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
export function ledgerDayHeaders(orders: readonly LedgerOrder[]) {
  const days = new Map<string, LedgerOrder[]>()
  for (const order of orders) {
    const key = new Date(order.createdAt).toDateString()
    const group = days.get(key) ?? []
    group.push(order)
    days.set(key, group)
  }
  const headers = new Map<string, { label: string; total: string }>()
  for (const group of days.values()) {
    const first = group[0]
    if (!first) continue
    headers.set(first.id, {
      label: new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(first.createdAt)),
      total: ledgerMoney(group),
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
  return { label: "Unpaid", tone: "warn" as const }
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
