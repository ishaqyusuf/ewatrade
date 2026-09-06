import { formatMinorMoney } from "@ewatrade/utils"

export type OrderDispatchDateFilter = "30_days" | "7_days" | "all" | "today"

type DispatchOrder = {
  currencyCode: string
  lines?: readonly { kind: string }[]
  paymentStatus: string
  status: string
  totalMinor: number
}

const OPEN_STATUSES = new Set([
  "CONFIRMED",
  "DRAFT",
  "FULFILLING",
  "OUT_FOR_DELIVERY",
  "PENDING",
])

export function buildOrdersDispatchSummary(orders: DispatchOrder[]) {
  const currencies = new Set(orders.map((order) => order.currencyCode))
  const loadedValue =
    orders.length === 0
      ? "—"
      : currencies.size !== 1
        ? "Mixed currencies"
        : formatOrderDispatchMoney(
            orders.reduce((total, order) => total + order.totalMinor, 0),
            orders[0]?.currencyCode ?? "NGN",
          )

  return {
    loadedValue,
    openCount: orders.filter((order) => OPEN_STATUSES.has(order.status)).length,
    readyCount: orders.filter((order) => order.status === "READY_FOR_PICKUP")
      .length,
  }
}

export function formatOrderDispatchMoney(
  amountMinor: number,
  currencyCode: string,
) {
  return formatMinorMoney(amountMinor, currencyCode).replace(/\.00$/, "")
}

export function getOrderDispatchPresentation(order: DispatchOrder) {
  const paymentLabel = paymentStatusLabel(order.paymentStatus)

  if (order.status === "READY_FOR_PICKUP") {
    return { actionLabel: "Ready", paymentLabel, tone: "ready" as const }
  }
  if (order.status === "COMPLETED") {
    return { actionLabel: "Completed", paymentLabel, tone: "done" as const }
  }
  if (["CANCELLED", "REFUNDED"].includes(order.status)) {
    return { actionLabel: "Closed", paymentLabel, tone: "closed" as const }
  }
  if (["FULFILLING", "OUT_FOR_DELIVERY"].includes(order.status)) {
    return {
      actionLabel: "In fulfilment",
      paymentLabel,
      tone: "active" as const,
    }
  }
  if (order.status === "CONFIRMED") {
    const needsPacking = order.lines?.some((line) => line.kind === "product")
    return {
      actionLabel: needsPacking ? "Pack next" : "Confirmed",
      paymentLabel,
      tone: needsPacking ? ("attention" as const) : ("pending" as const),
    }
  }
  return { actionLabel: "Review", paymentLabel, tone: "pending" as const }
}

function paymentStatusLabel(status: string) {
  if (status === "PAID") return "Paid"
  if (status === "PARTIALLY_PAID") return "Partially paid"
  if (status === "AUTHORIZED") return "Authorized"
  if (status === "FAILED") return "Payment failed"
  if (status === "REFUNDED") return "Refunded"
  if (status === "PENDING") return "Payment pending"
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function orderDispatchDateLabel(filter: OrderDispatchDateFilter) {
  if (filter === "today") return "Today’s dispatch"
  if (filter === "7_days") return "Last 7 days"
  if (filter === "30_days") return "Last 30 days"
  return "All dispatch"
}
