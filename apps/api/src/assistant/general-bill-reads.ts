import { generalMoney, type GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { getFinanceBill, listFinanceBills } from "@ewatrade/db/queries"
import { financeBillsSchema, financeBillSchema } from "../schemas/finance"
export const generalBillsInput = financeBillsSchema.omit({ storeId: true, limit: true, direction: true, sort: true })
export const generalBillInput = financeBillSchema
export function generalBillsAnswer(page: Awaited<ReturnType<typeof listFinanceBills>>): GeneralAnswer {
  return { id: `expense_bills_${crypto.randomUUID()}`, title: "Expense bills", value: `${page.items.length} on this page`, scope: `Finance Book · all Stores · ${page.currencyCode}`, asOf: new Date().toISOString(),
    detail: `${page.items.map(bill => `${bill.payeeName}: ${bill.description} · ${bill.status} · ${generalMoney(bill.outstandingMinor, page.currencyCode)} outstanding`).join("; ") || "No bills match this page."} ${page.nextCursor ? "More bills available; preserve Book, query and status." : "End of this list."} Matching non-void bills: ${generalMoney(page.summary.outstandingMinor, page.currencyCode)} outstanding. These are recorded expenses, not bank settlement evidence.` }
}
/** Bound history returned to the model; balances are complete canonical bill totals. */
export function generalBillData(bill: Awaited<ReturnType<typeof getFinanceBill>>) {
  return { id: bill.id, bookId: bill.bookId, payeeName: bill.payeeName, description: bill.description, reference: bill.reference, incurredAt: bill.incurredAt, dueAt: bill.dueAt,
    voidedAt: bill.voidedAt, totalMinor: bill.totalMinor, paidMinor: bill.paidMinor, outstandingMinor: bill.outstandingMinor,
    lines: bill.lines.map(line => ({ id: line.id, accountId: line.accountId, accountName: line.account.name, description: line.description, amountMinor: line.amountMinor })),
    payments: bill.payments.slice(0, 10).map(payment => ({ id: payment.id, accountId: payment.accountId, accountName: payment.account.name, funding: payment.funding, amountMinor: payment.amountMinor, effectiveAt: payment.effectiveAt, reference: payment.reference, reversedAt: payment.reversedAt, reversalEffectiveAt: payment.reversalEffectiveAt, reversalReason: payment.reversalReason })),
    paymentCount: bill.payments.length, paymentHistoryComplete: bill.payments.length <= 10,
    coverage: "EXACT_BILL_TOTALS_RECENT_10_PAYMENTS" as const,
  }
}
