import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { getCommercialOrderOperationalSummary } from "@ewatrade/db/queries"

const money = (minor: string) => {
  const amount = BigInt(minor)
  const sign = amount < 0n ? "-" : ""
  const absolute = amount < 0n ? -amount : amount
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}
export function generalOperationalAnswers(input: {
  summary: Awaited<ReturnType<typeof getCommercialOrderOperationalSummary>>
  storeName: string
  ownOrders: boolean
  customerId?: string
  createdAfter?: string
  statuses?: readonly string[]
  createdBefore?: string
}): GeneralAnswer[] {
  const scope = `${input.storeName} · ${input.ownOrders ? "Your orders" : "Authorized orders"}${input.customerId ? ` · Customer ${input.customerId}` : ""} · ${input.createdAfter ?? "Any start"} to ${input.createdBefore ?? "Any end"}${input.createdBefore ? " (end excluded)" : ""}`
  const statuses = input.statuses?.length
    ? ` Statuses: ${input.statuses.join(", ")}.`
    : " All statuses included in the count."
  const asOf = new Date().toISOString()
  return [
    {
      id: `order_count_${crypto.randomUUID()}`,
      title: "Order count",
      value: input.summary.orderCount,
      scope,
      asOf,
      detail: `Exact count across all matching orders, not a result page. ${input.summary.outstandingCount} have an unpaid amount. Cancelled/refunded orders do not contribute unpaid amounts.${statuses}`,
    },
    ...input.summary.currencies.map((currency) => ({
      id: `order_unpaid_${crypto.randomUUID()}`,
      title: `Unpaid orders · ${currency.currencyCode}`,
      value: `${currency.currencyCode} ${money(currency.outstandingMinor)}`,
      scope,
      asOf,
      detail: `${currency.outstandingCount} unpaid of ${currency.orderCount} matching orders. Order value ${currency.currencyCode} ${money(currency.orderValueMinor)}. This is unpaid order value, not customer ledger debt or cash collected; currencies are never combined.${statuses}`,
    })),
  ]
}
