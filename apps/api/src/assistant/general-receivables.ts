import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { listCustomerLedgerReceivables } from "@ewatrade/db/queries"
import { customerLedgerReceivablesSchema } from "../schemas/customer-ledger"

export const generalReceivablesInput = customerLedgerReceivablesSchema.pick({
  query: true,
  cursor: true,
})
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
      value: `Debt ${generalMoney(item.totals.outstandingDebtMinor, item.currencyCode)}`,
      scope: "Customer account · all Stores",
      asOf,
      detail: `Available credit ${generalMoney(item.totals.availableCreditMinor, item.currencyCode)}; net ledger balance ${generalMoney(item.totals.netBalanceMinor, item.currencyCode)}. Debt and credit are separate; neither is cash collected or an unpaid-order total. Posted entries only, all Stores.`,
    })),
  ]
}
