import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { BusinessReport, BusinessReportRow } from "./types"

/** Presentation reads canonical exact fields only; no sentence parsing or Number conversion. */
export function businessReportSummary(report: BusinessReport) {
  const totals = report.totals
  const currency = report.currencyCode
  if (!report.complete || !totals || !currency) return report.summary
  const money = (minor: string) => formatFinanceMoney(minor, currency)
  switch (totals.kind) {
    case "item_sales":
      return `All ${totals.groupCount} original item groups; ${totals.lineCount} lines; booked line value ${money(totals.bookedValueMinor)}.`
    case "payment_collections":
      return `Received ${money(totals.receivedMinor)}; refunded ${money(totals.refundedMinor)}; net money ${money(totals.netMoneyMinor)}. Customer-credit settlement ${money(totals.netCustomerCreditMinor)}, separately.`
    case "customer_debt":
      return `Debt ${money(totals.outstandingDebtMinor)}; available credit ${money(totals.availableCreditMinor)} across all ${totals.accountCount} matching posted accounts.`
    case "supplier_aging":
      return `Supplier payable ${money(totals.payableMinor)}; advance ${money(totals.advanceMinor)}. Complete canonical aging buckets across ${totals.sourcesRead} sources.`
    case "posted_profit":
      return `Posted entries net profit ${money(totals.netProfitMinor)}. Whole-business profit and cost completeness remain unknown.`
  }
}
export function businessReportRowValue(
  row: BusinessReportRow,
  currency: string | null,
) {
  return row.moneyMinor !== undefined && currency
    ? `${formatFinanceMoney(row.moneyMinor, currency)}${row.moneyLabel ? ` ${row.moneyLabel}` : ""}`
    : row.value
}
