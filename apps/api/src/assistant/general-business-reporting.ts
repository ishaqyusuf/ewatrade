import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  type BusinessReport,
  businessReportSummary,
} from "@ewatrade/db/business-reporting"

/** Bounded saved answer; exact original rows stay in the native protected report. */
export function generalBusinessReportAnswer(
  report: BusinessReport,
  target: BusinessReportTarget,
): Omit<GeneralAnswer, "target"> & { target: BusinessReportTarget } {
  const period = report.period
    ? `${report.period.from} to ${report.period.to} (end ${report.period.end}) · ${report.period.timezone}`
    : "Current snapshot"
  const formattedSummary = businessReportSummary(report)
  const summary =
    formattedSummary.length <= 400
      ? formattedSummary
      : "Open the report for the complete summary."
  return {
    id: `business_report_${crypto.randomUUID()}`,
    title: {
      item_sales: "Item sales",
      payment_collections: "Payment collections",
      customer_debt: "Customer debt",
      stock: "Stock",
      supplier_aging: "Supplier payable aging",
      posted_profit: "Posted finance profit coverage",
    }[report.report],
    value: report.complete
      ? report.pagination
        ? `${report.pagination.totalRows} matching rows; ${report.rows.length} details shown`
        : `${report.rows.length} report rows`
      : "Complete report unavailable",
    scope:
      `${report.scope} · ${period} · ${report.currencyCode ?? "Original units"}`.slice(
        0,
        500,
      ),
    asOf: report.asOf,
    detail:
      `${summary} ${report.dateBasis}. ${report.complete ? "All matching sources within the declared report scope are included." : "Result exceeds the bounded read limit; no partial total or zero is presented."} Open preserves the original business/Store and refuses a changed scope. ${report.gaps.slice(0, 3).join(" ")}`.slice(
        0,
        1000,
      ),
    target,
  }
}
