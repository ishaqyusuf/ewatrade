import {
  generalDateRange,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"

/** A bounded report must never be presented as a complete sales total. */
export function generalSalesAnswer(input: {
  summary: {
    partial?: boolean
    currencyCode: string
    orderValueMinor: number
    orderCount: number
  }
  storeName: string
  ownOrders: boolean
  createdAfter: string
  createdBefore: string
}): GeneralAnswer {
  const { summary } = input
  return {
    id: `sales_${crypto.randomUUID()}`,
    title: "Sales",
    value: summary.partial
      ? "—"
      : generalMoney(summary.orderValueMinor, summary.currencyCode),
    scope: `${generalDateRange(input.createdAfter, input.createdBefore)} · ${input.storeName} · ${input.ownOrders ? "Your orders" : "All orders"}`,
    asOf: new Date().toISOString(),
    detail: summary.partial
      ? "This date range exceeds the summary limit. Choose a shorter period; a complete total is unavailable."
      : `${summary.orderCount} orders · order value, not cash collected.`,
  }
}
