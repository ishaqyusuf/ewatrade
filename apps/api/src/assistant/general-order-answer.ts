import { generalMoney } from "@ewatrade/assistant/general/contracts"
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
    value: generalMoney(order.totalMinor, order.currencyCode),
    scope: storeName.slice(0, 300),
    asOf: new Date().toISOString(),
    detail: `${order.status} · ${order.paymentStatus} · unpaid ${generalMoney(unpaid, order.currencyCode)}. ${excluded ? "Cancelled/refunded orders contribute no unpaid amount. " : ""}Individual order only; use the summary read for totals.`,
  }
}
