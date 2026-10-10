import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listCustomerLedgerReceivables } from "@ewatrade/db/queries"
import { customerLedgerReceivablesSchema } from "../schemas/customer-ledger"

export const generalReceivablesInput = customerLedgerReceivablesSchema.pick({
  query: true,
  cursor: true,
})
const money = (minor: string) => {
  const value = BigInt(minor)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`
}
export function generalReceivablesAnswers(
  page: Awaited<ReturnType<typeof listCustomerLedgerReceivables>>,
  input: { query?: string; cursor?: string },
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  return [
    {
      id: `receivables_page_${crypto.randomUUID()}`,
      title: "Customer ledger accounts",
      value: `${page.items.length} on this page`,
      scope: "Current business · all Stores · posted customer ledger entries",
      asOf,
      detail: `Name, phone or email contains: ${input.query || "no filter"}. ${input.cursor ? "Continuation page" : "First page"}. ${page.nextCursor ? "More accounts available; continue with the same filter." : "End of this list."} Each account includes its complete posted ledger, but this page is not a business total. Unintegrated orders are excluded; no accounts does not mean no unpaid orders.`,
    },
    ...page.items.map((item) => ({
      id: `receivable_${crypto.randomUUID()}`,
      title: item.customer.name.slice(0, 160),
      value: `Debt ${item.currencyCode} ${money(item.totals.outstandingDebtMinor)}`,
      scope: `Account ${item.id} · Customer ${item.customer.id}`,
      asOf,
      detail: `Available credit ${item.currencyCode} ${money(item.totals.availableCreditMinor)}; net ledger balance ${item.currencyCode} ${money(item.totals.netBalanceMinor)}. Debt and credit are separate; neither is cash collected or an unpaid-order total. Posted entries only, all Stores.`,
    })),
  ]
}
