import {
  type ReportFunnelStep,
  type ReportMetricGroup,
  buildReportFunnel,
  reportMetric as metric,
} from "@/components/reports/report-metrics"
import type { PrescriptionReportTab } from "@/hooks/use-prescription-report-params"
import { reportCsv, reportCsvMoney } from "@/lib/report-csv"
import { type ReportRange, reportRangeFileDates } from "@/lib/report-range"

type CostSummary = {
  amountMinor: number | null
  observedCount: number
  unknownCount: number
}

export type PrescriptionCostKey =
  | "deliveryCostMinor"
  | "metaCostMinor"
  | "paymentProviderFeeMinor"
  | "pharmacyRevenueMinor"
  | "platformChargeMinor"
  | "taxMinor"

/** The fields of `prescriptions.report` this page presents. */
export type PrescriptionReportData = {
  channelMix: Record<string, number>
  conversionRate: number
  costs: Record<PrescriptionCostKey, CostSummary>
  currencyCode: string
  /** One entry per UTC day in the window. */
  daily?: Array<{
    amountPaidMinor: number
    date: string
    paidOrders: number
    quotesIssued: number
    requests: number
  }>
  deliveryCompleted: number
  payment: { paidAmountMinor: number; paidCount: number; totalAttempts: number }
  pickupCompleted: number
  quoteCount: number
  quoteOutcomes: {
    accepted: number
    declined: number
    full: number
    partial: number
    unavailable: number
  }
  requestCount: number
  reviewTimeMs: number | null
  scope: string
  storeBreakdown: Array<{ name: string; requestCount: number; storeId: string }>
}

export type PrescriptionReportSection = {
  key: Exclude<PrescriptionReportTab, "stores">
  tab: string
  title: string
  description: string
  groups: ReportMetricGroup[]
}

const CHANNEL_LABELS: Record<string, string> = {
  staff_phone: "Phone (staff)",
  staff_walk_in: "Walk-in (staff)",
  web: "Website",
  whatsapp: "WhatsApp",
}

export const PRESCRIPTION_COST_LABELS: Record<PrescriptionCostKey, string> = {
  deliveryCostMinor: "Delivery",
  metaCostMinor: "WhatsApp message charges",
  paymentProviderFeeMinor: "Card and transfer fees",
  pharmacyRevenueMinor: "Money received from sales",
  platformChargeMinor: "EwaTrade charges",
  taxMinor: "Tax",
}

/** Share of requests converted to orders; Unknown when there were none. */
export function prescriptionConversionPercent(report: PrescriptionReportData) {
  return report.requestCount > 0
    ? Math.round(report.conversionRate * 100)
    : null
}

export function hasPrescriptionReportActivity(report: PrescriptionReportData) {
  return [
    report.requestCount,
    report.quoteCount,
    report.payment.paidCount,
    report.payment.totalAttempts,
    report.pickupCompleted,
    report.deliveryCompleted,
    ...Object.values(report.quoteOutcomes),
    ...Object.values(report.costs).flatMap((cost) => [
      cost.observedCount,
      cost.unknownCount,
    ]),
  ].some((value) => value > 0)
}

export function prescriptionReportFunnel(
  report: PrescriptionReportData,
): ReportFunnelStep[] {
  return buildReportFunnel([
    { label: "Requests", count: report.requestCount },
    { label: "Quotes sent", count: report.quoteCount },
    { label: "Quotes accepted", count: report.quoteOutcomes.accepted },
    { label: "Paid", count: report.payment.paidCount },
  ])
}

export function buildPrescriptionReportSections(
  report: PrescriptionReportData,
): PrescriptionReportSection[] {
  const channelTotal = Object.values(report.channelMix).reduce(
    (total, count) => total + count,
    0,
  )
  return [
    {
      key: "lifecycle",
      tab: "Requests",
      title: "Requests",
      description:
        "Requests, Quotes, payments and hand-overs in these dates. No patient details are included.",
      groups: [
        {
          title: "Handed over",
          metrics: [
            metric("Picked up", report.pickupCompleted),
            metric("Delivered", report.deliveryCompleted),
          ],
        },
        {
          title: "Payments",
          metrics: [
            metric("Paid orders", report.payment.paidCount),
            metric("Tries to pay", report.payment.totalAttempts),
            metric("Amount paid", report.payment.paidAmountMinor, {
              currencyCode: report.currencyCode,
              format: "money",
            }),
          ],
        },
        {
          title: "Where requests came from",
          metrics: Object.entries(report.channelMix).map(([channel, count]) =>
            metric(CHANNEL_LABELS[channel] ?? channel, count, {
              shareOf: channelTotal,
            }),
          ),
        },
        {
          title: "Speed and results",
          metrics: [
            metric(
              "Average time to check a prescription",
              report.reviewTimeMs === null ? null : report.reviewTimeMs / 1000,
              {
                format: "duration",
                unknownReason: "No prescriptions were checked in these dates.",
              },
            ),
            metric(
              "Requests that became Orders",
              prescriptionConversionPercent(report),
              {
                format: "percent",
                unknownReason: "No requests in these dates.",
              },
            ),
          ],
        },
      ],
    },
    {
      key: "quotes",
      tab: "Quotes",
      title: "Quotes",
      description:
        "How Customers answered your Quotes, and how much of each prescription you had in stock.",
      groups: [
        {
          title: "Customer answers",
          metrics: [
            metric("Accepted", report.quoteOutcomes.accepted),
            metric("Declined", report.quoteOutcomes.declined),
          ],
        },
        {
          title: "In stock when quoted",
          metrics: [
            metric("Everything", report.quoteOutcomes.full),
            metric("Some items", report.quoteOutcomes.partial),
            metric("Nothing", report.quoteOutcomes.unavailable),
          ],
        },
      ],
    },
    {
      key: "costs",
      tab: "Costs",
      title: "Costs and fees",
      description:
        "Charges for messages, payments and delivery in these dates. Charges not reported yet show as Unknown; we never guess them.",
      groups: [
        {
          title: "By type",
          metrics: (
            Object.keys(PRESCRIPTION_COST_LABELS) as PrescriptionCostKey[]
          ).map((key) => {
            const cost = report.costs[key]
            return metric(PRESCRIPTION_COST_LABELS[key], cost.amountMinor, {
              currencyCode: report.currencyCode,
              format: "money",
              note: `${cost.observedCount} ${cost.observedCount === 1 ? "charge" : "charges"}${cost.unknownCount ? ` · ${cost.unknownCount} not reported yet` : ""}`,
              unknownReason: "No amount reported yet.",
            })
          }),
        },
      ],
    },
  ]
}

/** Days with any request, for the quiet-period note. */
export function countPrescriptionRequestDays(report: PrescriptionReportData) {
  return (report.daily ?? []).filter((day) => day.requests > 0).length
}

/** CSV of the daily counts behind Prescription requests by day. */
export function buildPrescriptionReportCsv(
  report: PrescriptionReportData,
  range: ReportRange,
  storeName: string,
) {
  const rows: Array<Array<string | number>> = [
    ["Prescriptions", storeName, `Amounts in ${report.currencyCode}`],
    ["Date", "Requests", "Quotes sent", "Paid orders", "Amount paid"],
    ...(report.daily ?? []).map((day) => [
      day.date,
      day.requests,
      day.quotesIssued,
      day.paidOrders,
      reportCsvMoney(day.amountPaidMinor),
    ]),
    [
      "Total",
      report.requestCount,
      report.quoteCount,
      report.payment.paidCount,
      reportCsvMoney(report.payment.paidAmountMinor),
    ],
    [],
    ["Picked up", report.pickupCompleted],
    ["Delivered", report.deliveryCompleted],
    ["Quotes accepted", report.quoteOutcomes.accepted],
    ["Quotes declined", report.quoteOutcomes.declined],
  ]
  return {
    fileName: `prescriptions_${reportRangeFileDates(range)}.csv`,
    text: reportCsv(rows),
  }
}
