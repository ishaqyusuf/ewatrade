import { z } from "zod"
import {
  generalMoney,
  type GeneralAnswer,
} from "@ewatrade/assistant/general/contracts"
import type {
  getCustomerLedgerAccountDetail,
  getCustomerLedgerStatement,
  listCustomerLedgerSources,
} from "@ewatrade/db/queries"
import {
  customerLedgerAccountsSchema,
  customerLedgerSourcesSchema,
  customerLedgerStatementSchema,
} from "../schemas/customer-ledger"

export const generalCustomerAccountsInput = customerLedgerAccountsSchema.omit({
  limit: true,
})
// safeExtend retains the canonical pinned-pagination refinements.
export const generalCustomerSourcesInput =
  customerLedgerSourcesSchema.safeExtend({ limit: z.literal(10).default(10) })
export const generalCustomerStatementInput =
  customerLedgerStatementSchema.safeExtend({ limit: z.literal(10).default(10) })

export function generalCustomerAccountAnswer(
  account: Awaited<ReturnType<typeof getCustomerLedgerAccountDetail>>,
): GeneralAnswer {
  return {
    id: `customer_funds_${crypto.randomUUID()}`,
    title: account.customer.name.slice(0, 160),
    value: `Available credit ${generalMoney(account.totals.availableCreditMinor, account.currencyCode)}`,
    scope: "Customer ledger account · current business · all Stores",
    asOf: new Date().toISOString(),
    detail: `Posted debt ${generalMoney(account.totals.outstandingDebtMinor, account.currencyCode)}; net ledger balance ${generalMoney(account.totals.netBalanceMinor, account.currencyCode)}. Revision ${account.revision}, snapshot ${account.snapshotSequence}. ${account.book ? "Matching Finance Book available." : "No matching Finance Book."} Posted ledger only; unintegrated orders are excluded. Available credit is not proof of cash collected or refundable funds; inspect its source.`,
  }
}
export function generalCustomerSourcesAnswers(
  page: Awaited<ReturnType<typeof listCustomerLedgerSources>>,
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  return [
    {
      id: `customer_sources_${crypto.randomUUID()}`,
      title: `${page.side === "CREDIT" ? "Credit" : "Debit"} sources`,
      value: `${page.sources.length} on this page`,
      scope: "Customer ledger account · all Stores",
      asOf,
      detail: `Current revision ${page.currentRevision}. ${page.nextCursor ? "More sources available; keep the same account, side and revision when continuing." : "End of this source list."} These are usable posted-ledger sources, not a full statement or business total. Refund eligibility must be revalidated from the original held-funds posting.`,
    },
    ...page.sources.map((source) => ({
      id: `customer_source_${crypto.randomUUID()}`,
      title: `${source.kind.replaceAll("_", " ")} #${source.sequence}`,
      value: generalMoney(source.remainingAmountMinor, page.currencyCode),
      scope: "Remaining amount on this source",
      asOf,
      detail: `${source.order ? `Order ${source.order.orderNumber}. ` : ""}Original ${generalMoney(source.amountMinor, page.currencyCode)}; used ${generalMoney(source.usedAmountMinor, page.currencyCode)}. Effective ${source.effectiveAt.toISOString()}. A receipt or opening credit may hold refundable funds; other credit kinds must not be treated as cash.`,
    })),
  ]
}
export function generalCustomerStatementAnswer(
  page: Awaited<ReturnType<typeof getCustomerLedgerStatement>>,
): GeneralAnswer {
  return {
    id: `customer_statement_${crypto.randomUUID()}`,
    title: "Customer ledger statement",
    value: `${page.entries.length} entries on this page`,
    scope: "Customer ledger account · all Stores",
    asOf: new Date().toISOString(),
    detail: `Snapshot ${page.snapshotSequence}. Complete posted balances at that snapshot: debt ${generalMoney(page.totals.outstandingDebtMinor, page.currencyCode)}, credit ${generalMoney(page.totals.availableCreditMinor, page.currencyCode)}, net ${generalMoney(page.totals.netBalanceMinor, page.currencyCode)}. ${page.nextCursor ? "More entries available; keep this snapshot when continuing." : "End of this statement."} Unintegrated orders are excluded. Entries on this page alone are not the account balance.`,
  }
}
