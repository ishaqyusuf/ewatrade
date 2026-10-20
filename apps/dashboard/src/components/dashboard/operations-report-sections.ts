import {
  type ReportMetric,
  type ReportMetricGroup,
  reportMetric as metric,
} from "@/components/reports/report-metrics"
import { reportCsv, reportCsvMoney } from "@/lib/report-csv"
import { type ReportRange, reportRangeFileDates } from "@/lib/report-range"

/** The `serviceReporting.summary` fields this page presents. */
export type OperationsServiceSummary = {
  commercial: { immutableServiceQuantity: string; serviceRevenueMinor: number }
  communications: { intents: number }
  work: {
    blocked: number
    completed: number
    exceptions: number
    overdueJobs: number
    ready: number
    rework: number
    wip: number
  }
}

export type OperationsInventorySummary = {
  balances: { rows: Array<{ kind: string }> }
  reconciliation: { provisionalCommands: number }
}

/** The `orders.salesReport` fields this page presents. */
export type OperationsSalesReport = {
  currencyCode: string
  days: Array<{
    date: string
    orderCount: number
    orderValueMinor: number
    productMinor: number
    serviceMinor: number
  }>
  otherItems: { count: number; totalMinor: number }
  partial: boolean
  topItems: Array<{
    catalogItemId: string
    kind: "product" | "service"
    name: string
    quantity: string
    totalMinor: number
  }>
  totals: {
    orderCount: number
    orderValueMinor: number
    productMinor: number
    serviceMinor: number
    serviceQuantity: string
  }
}

export function buildInventoryGroups({
  balances,
  reconciliation,
}: OperationsInventorySummary): ReportMetricGroup[] {
  const countKind = (kind: string) =>
    balances.rows.filter((row) => row.kind === kind).length
  return [
    {
      title: "Stock records",
      metrics: [
        metric("Stock records", balances.rows.length),
        metric("Shared stock", countKind("SHARED_POOL")),
        metric("Packaged stock", countKind("PACKAGED_STOCK")),
      ],
    },
    {
      title: "Offline changes",
      metrics: [
        metric("Waiting to sync", reconciliation.provisionalCommands, {
          current: true,
        }),
      ],
    },
  ]
}

/** Jobs at this moment; Blocked and Overdue follow the owner-approved emphasis. */
export function buildServiceJobsNow(
  service: OperationsServiceSummary,
): ReportMetric[] {
  return [
    metric("In progress", service.work.wip, { current: true }),
    metric("Ready", service.work.ready, { current: true }),
    metric("Blocked", service.work.blocked, { current: true, tone: "block" }),
    metric("Overdue", service.work.overdueJobs, {
      current: true,
      tone: "failure",
    }),
  ]
}

/** The lists under the job bars. These counts cover every job so far, not the dates. */
export function buildServiceGroups(
  service: OperationsServiceSummary,
): ReportMetricGroup[] {
  return [
    {
      title: "All jobs so far",
      metrics: [
        metric("Completed", service.work.completed),
        metric("Problems reported", service.work.exceptions),
        metric("Redone", service.work.rework),
      ],
    },
    {
      title: "Messages",
      metrics: [
        metric("Customer messages about jobs", service.communications.intents),
      ],
    },
  ]
}

/** Days with any sale, for the quiet-period note. */
export function countSalesDays(report: OperationsSalesReport) {
  return report.days.filter((day) => day.orderCount > 0).length
}

/** CSV of the Sales by day chart and Top sellers for the chosen dates. */
export function buildSalesReportCsv(
  report: OperationsSalesReport,
  range: ReportRange,
  storeName: string,
) {
  const rows: Array<Array<string | number>> = [
    ["Sales by day", storeName, `Amounts in ${report.currencyCode}`],
    ["Date", "Orders", "Product sales", "Service sales", "Sales"],
    ...report.days.map((day) => [
      day.date,
      day.orderCount,
      reportCsvMoney(day.productMinor),
      reportCsvMoney(day.serviceMinor),
      reportCsvMoney(day.orderValueMinor),
    ]),
    [
      "Total",
      report.totals.orderCount,
      reportCsvMoney(report.totals.productMinor),
      reportCsvMoney(report.totals.serviceMinor),
      reportCsvMoney(report.totals.orderValueMinor),
    ],
    [],
    ["Top sellers"],
    ["Item", "Type", "Sold", "Sales"],
    ...report.topItems.map((item) => [
      item.name,
      item.kind === "service" ? "Service" : "Product",
      item.quantity,
      reportCsvMoney(item.totalMinor),
    ]),
    ...(report.otherItems.count
      ? [
          [
            `Everything else (${report.otherItems.count} ${report.otherItems.count === 1 ? "item" : "items"})`,
            "",
            "",
            reportCsvMoney(report.otherItems.totalMinor),
          ],
        ]
      : []),
  ]
  return {
    fileName: `sales_${reportRangeFileDates(range)}.csv`,
    text: reportCsv(rows),
  }
}
