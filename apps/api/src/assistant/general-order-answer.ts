import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"

export function generalOrderAnswer(
  order: {
    id: string
    orderNumber: string
    currencyCode: string
    totalMinor: number
    balanceDueMinor: number
    status: string
    paymentStatus: string
  },
  storeName: string,
): GeneralAnswer {
  const excluded = ["CANCELLED", "REFUNDED"].includes(order.status)
  const unpaid = excluded ? 0 : order.balanceDueMinor
  return {
    id: `order_${crypto.randomUUID()}`,
    title: order.orderNumber,
    value: `${order.currencyCode} ${(order.totalMinor / 100).toFixed(2)}`,
    scope: `${storeName.slice(0, 300)} · Order ${order.id}`,
    asOf: new Date().toISOString(),
    detail: `${order.status} · ${order.paymentStatus} · unpaid ${order.currencyCode} ${(unpaid / 100).toFixed(2)}. ${excluded ? "Cancelled/refunded orders contribute no unpaid amount. " : ""}Individual order only; use the summary read for totals.`,
  }
}
