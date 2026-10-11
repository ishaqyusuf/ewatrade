import { z } from "zod"
import {
  generalMoney,
  type GeneralAnswer,
} from "@ewatrade/assistant/general/contracts"
import type {
  getCustomerLedgerEntryDetail,
  getCustomerLedgerAllocationHistory,
} from "@ewatrade/db/queries"
import {
  customerLedgerEntryDetailSchema,
  customerLedgerAllocationHistorySchema,
} from "../schemas/customer-ledger"
export const generalCustomerEntryInput =
  customerLedgerEntryDetailSchema.safeExtend({
    limit: z.literal(10).default(10),
  })
export const generalCustomerAllocationHistoryInput =
  customerLedgerAllocationHistorySchema.extend({
    limit: z.literal(10).default(10),
  })
export function generalCustomerEntryAnswer(
  page: Awaited<ReturnType<typeof getCustomerLedgerEntryDetail>>,
): GeneralAnswer {
  return {
    id: `customer_entry_${crypto.randomUUID()}`,
    title: "Customer entry allocations",
    value: `${page.allocations.length} on this page`,
    scope: "Posted customer ledger entry · all Stores",
    asOf: new Date().toISOString(),
    detail: `${page.entry.kind.replaceAll("_", " ")}: original ${generalMoney(page.entry.amountMinor, page.currencyCode)}, used ${generalMoney(page.usedAmountMinor, page.currencyCode)}, remaining ${generalMoney(page.remainingAmountMinor, page.currencyCode)}. Revision ${page.currentRevision}. ${page.reconciliationRequired ? "Reconciliation required; do not propose a correction from these totals." : "Totals cover this entry, not the whole customer account."} ${page.nextCursor ? "More allocations available; preserve account, entry and revision." : "End of this allocation list."} Releasing an allocation restores debt and credit; it does not refund cash.`,
  }
}
export function generalCustomerAllocationHistoryAnswer(
  page: Awaited<ReturnType<typeof getCustomerLedgerAllocationHistory>>,
): GeneralAnswer {
  return {
    id: `customer_allocation_history_${crypto.randomUUID()}`,
    title: "Customer allocation history",
    value: generalMoney(page.remainingAmountMinor, page.currencyCode),
    scope: "Remaining amount on this allocation",
    asOf: new Date().toISOString(),
    detail: `Originally allocated ${generalMoney(page.allocation.amountMinor, page.currencyCode)}; released ${generalMoney(page.releasedAmountMinor, page.currencyCode)}. ${page.releases.length} releases on this page. Revision ${page.currentRevision}. ${page.reconciliationRequired ? "Reconciliation required; do not propose a correction from these totals." : "Totals include all releases on this allocation."} ${page.nextCursor ? "More releases available; preserve account, allocation and revision." : "End of this release history."} Release is not a monetary refund.`,
  }
}
