import {
  type ReportMetric,
  type ReportMetricGroup,
  reportMetric as metric,
} from "@/components/reports/report-metrics"
import { reportCsv, reportCsvMoney } from "@/lib/report-csv"
import {
  type ReportRange,
  formatReportRangeLabel,
  reportRangeFileDates,
} from "@/lib/report-range"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReportSharePack } from "../reports/report-share"

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
  /** Unpaid part of the Orders in these dates. */
  owed: { orderCount: number; totalMinor: number }
  /** Payments recorded in these dates, net of refunds, without customer credit. */
  moneyIn: {
    totalMinor: number
    methods: Array<{ method: string; totalMinor: number }>
  }
  /** Orders in the same number of days just before. */
  previous: { orderCount: number; orderValueMinor: number }
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  OTHER: "Other",
  POS: "POS",
}

export function paymentMethodLabel(method: string) {
  return PAYMENT_METHOD_LABELS[method] ?? "Other"
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
    ["Date", "Orders", "Goods sales", "Service sales", "Sales"],
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
    ["Money in", "", "", "", reportCsvMoney(report.moneyIn.totalMinor)],
    ...report.moneyIn.methods.map((entry) => [
      paymentMethodLabel(entry.method),
      "",
      "",
      "",
      reportCsvMoney(entry.totalMinor),
    ]),
    [
      "Still owed on these orders",
      report.owed.orderCount,
      "",
      "",
      reportCsvMoney(report.owed.totalMinor),
    ],
    [],
    ["Top sellers"],
    ["Item", "Type", "Sold", "Sales"],
    ...report.topItems.map((item) => [
      item.name,
      item.kind === "service" ? "Service" : "Goods",
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

/** The share / print / CSV pack for the Reports overview. */
export function buildSalesSharePack(
  report: OperationsSalesReport,
  range: ReportRange,
  storeName: string,
  timeZone = "UTC",
): ReportSharePack {
  const money = (minor: number) => formatMinorMoney(minor, report.currencyCode)
  const orders = report.totals.orderCount
  return {
    csv: buildSalesReportCsv(report, range, storeName),
    sections: [
      {
        rows: [
          ["Sales", money(report.totals.orderValueMinor)],
          ["Orders", String(orders)],
          ["Money in", money(report.moneyIn.totalMinor)],
          [
            `Still owed (${report.owed.orderCount} ${report.owed.orderCount === 1 ? "order" : "orders"})`,
            money(report.owed.totalMinor),
          ],
        ],
        title: "Summary",
      },
      {
        rows: report.moneyIn.methods.map((entry) => [
          paymentMethodLabel(entry.method),
          money(entry.totalMinor),
        ]),
        title: "How customers paid",
      },
      {
        rows: [
          ...report.topItems.map((item): [string, string] => [
            item.name,
            money(item.totalMinor),
          ]),
          ...(report.otherItems.count
            ? [
                [
                  `Everything else (${report.otherItems.count})`,
                  money(report.otherItems.totalMinor),
                ] as [string, string],
              ]
            : []),
        ],
        title: "Top items",
      },
    ],
    subtitle: `${storeName} · ${formatReportRangeLabel(range, new Date(), timeZone)}`,
    title: "Sales report",
  }
}
