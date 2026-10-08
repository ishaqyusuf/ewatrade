import {
  type ReportFunnelStep,
  type ReportMetricGroup,
  buildReportFunnel,
  reportMetric as metric,
} from "@/components/reports/report-metrics"
import type { PrescriptionReportTab } from "@/hooks/use-prescription-report-params"

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
  staff_phone: "Staff phone",
  staff_walk_in: "Staff walk-in",
  web: "Web",
  whatsapp: "WhatsApp",
}

export const PRESCRIPTION_COST_LABELS: Record<PrescriptionCostKey, string> = {
  deliveryCostMinor: "Delivery costs",
  metaCostMinor: "Meta messaging charges",
  paymentProviderFeeMinor: "Payment-provider fees",
  pharmacyRevenueMinor: "Pharmacy revenue",
  platformChargeMinor: "EwaTrade platform charges",
  taxMinor: "Taxes",
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
    { label: "Requests received", count: report.requestCount },
    { label: "Quotes issued", count: report.quoteCount },
    { label: "Quotes accepted", count: report.quoteOutcomes.accepted },
    { label: "Paid orders", count: report.payment.paidCount },
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
      tab: "Lifecycle",
      title: "Lifecycle",
      description:
        "Requests, Quotes, payments and fulfilment in the last 30 days. De-identified: no patient or prescription details are included.",
      groups: [
        {
          title: "Fulfilment",
          metrics: [
            metric("Pickups completed", report.pickupCompleted),
            metric("Deliveries completed", report.deliveryCompleted),
          ],
        },
        {
          title: "Payments",
          metrics: [
            metric("Paid orders", report.payment.paidCount),
            metric("Payment attempts", report.payment.totalAttempts),
            metric("Paid value", report.payment.paidAmountMinor, {
              currencyCode: report.currencyCode,
              format: "money",
            }),
          ],
        },
        {
          title: "Requests by channel",
          metrics: Object.entries(report.channelMix).map(([channel, count]) =>
            metric(CHANNEL_LABELS[channel] ?? channel, count, {
              shareOf: channelTotal,
            }),
          ),
        },
        {
          title: "Review",
          metrics: [
            metric(
              "Average review time",
              report.reviewTimeMs === null ? null : report.reviewTimeMs / 1000,
              {
                format: "duration",
                unknownReason: "No review was completed in this window.",
              },
            ),
            metric(
              "Converted to orders",
              prescriptionConversionPercent(report),
              {
                format: "percent",
                unknownReason: "No requests were received in this window.",
              },
            ),
          ],
        },
      ],
    },
    {
      key: "quotes",
      tab: "Quotes",
      title: "Quote outcomes",
      description:
        "How customers answered issued Quotes, and how much of each request the pharmacy could supply.",
      groups: [
        {
          title: "Customer answers",
          metrics: [
            metric("Accepted", report.quoteOutcomes.accepted),
            metric("Declined", report.quoteOutcomes.declined),
          ],
        },
        {
          title: "Availability",
          metrics: [
            metric("Full", report.quoteOutcomes.full),
            metric("Partial", report.quoteOutcomes.partial),
            metric("Unavailable", report.quoteOutcomes.unavailable),
          ],
        },
      ],
    },
    {
      key: "costs",
      tab: "Costs",
      title: "Commercial amounts by owner",
      description:
        "Unknown provider costs stay unknown; they are never estimated or folded into another category.",
      groups: [
        {
          title: "By owner",
          metrics: (
            Object.keys(PRESCRIPTION_COST_LABELS) as PrescriptionCostKey[]
          ).map((key) => {
            const cost = report.costs[key]
            return metric(PRESCRIPTION_COST_LABELS[key], cost.amountMinor, {
              currencyCode: report.currencyCode,
              format: "money",
              note: `${cost.observedCount} known · ${cost.unknownCount} awaiting cost data`,
              unknownReason:
                "No amount has been reported yet for these events, so it stays Unknown.",
            })
          }),
        },
      ],
    },
  ]
}
