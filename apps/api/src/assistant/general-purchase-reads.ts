import { generalMoney, type GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import type { getFinancePurchaseBill, listFinancePurchaseBills } from "@ewatrade/db/queries"
import { financePurchaseDetailSchema, financePurchasesSchema } from "../schemas/finance-purchases"
export const generalPurchasesInput = financePurchasesSchema.omit({ limit: true, direction: true, storeId: true })
export const generalPurchaseInput = financePurchaseDetailSchema
export function generalPurchasesAnswer(page: Awaited<ReturnType<typeof listFinancePurchaseBills>>): GeneralAnswer {
  return {
    id: `purchase_bills_${crypto.randomUUID()}`, title: "Purchase bills",
    value: `${page.items.length} on this page · ${page.count} matching`,
    scope: `Selected Finance Book · all Stores · ${page.currencyCode}`, asOf: new Date().toISOString(),
    detail: `${page.items.map(bill => `${bill.payeeName}: ${bill.description} · ${bill.status} · ${generalMoney(bill.outstandingMinor, page.currencyCode)} outstanding`).join("; ") || "No purchase bills match."} Matching bills: ${generalMoney(page.summary.paidMinor, page.currencyCode)} settled against bills; ${generalMoney(page.summary.outstandingMinor, page.currencyCode)} outstanding. Settlement may include allocated advances; it is not all new cash paid. ${page.nextCursor ? "Continue with the same Book, supplier and status." : "End of this list."} Purchase registrations without a recognized bill are excluded. This list does not prove physical receipt or ownership.`,
  }
}
export function generalPurchaseData(bill: Awaited<ReturnType<typeof getFinancePurchaseBill>>) {
  return {
    ...bill,
    payments: bill.payments.slice(0, 10),
    paymentsHasMore: bill.paymentsHasMore || bill.payments.length > 10,
    supplierEntries: bill.supplierEntries.slice(0, 10),
    supplierEntriesHasMore: bill.supplierEntriesHasMore || bill.supplierEntries.length > 10,
    allocations: bill.allocations.slice(0, 10).map(allocation => ({ ...allocation,
      releases: allocation.releases.slice(0, 10),
      releasesHasMore: allocation.releasesHasMore || allocation.releases.length > 10,
    })),
    allocationsHasMore: bill.allocationsHasMore || bill.allocations.length > 10,
    historyCoverage: "RECENT_10_PER_HISTORY_NOT_COMPLETE_WHEN_HAS_MORE" as const,
  }
}
