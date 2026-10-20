/** Shared, framework-free model for report metric lists, funnels and tones. */

import { getCurrencySymbol } from "@ewatrade/utils"

export type ReportMetricTone = "failure" | "block"

export type ReportMetric = {
  label: string
  /** `null` is Unknown: the fact is not available, so it is never shown as zero. */
  value: number | null
  format?: "count" | "duration" | "money" | "percent"
  /** Required when `format` is money. */
  currencyCode?: string | null
  /** A current snapshot rather than an occurrence inside the window. */
  current?: boolean
  note?: string
  unknownReason?: string
  /** Total that `value` is a share of; drawn as a proportion bar. */
  shareOf?: number
  /**
   * Owner-approved emphasis (6 October 2026) when the value is above zero:
   * failures and rejections are red, blocks and quarantines amber. Unknown
   * data stays neutral.
   */
  tone?: ReportMetricTone
}

export type ReportMetricGroup = { title: string; metrics: ReportMetric[] }

export type ReportFunnelStep = {
  label: string
  count: number
  /** Percent of the first step; `null` when the first step is zero. */
  share?: number | null
}

export const reportCountFormat = new Intl.NumberFormat("en-NG")

export function reportMetric(
  label: string,
  value: number | null,
  extra: Omit<ReportMetric, "label" | "value"> = {},
): ReportMetric {
  return { label, value, ...extra }
}

/** The tone a metric shows: only toned metrics above zero are emphasized. */
export function metricTone(metric: ReportMetric): ReportMetricTone | null {
  return metric.tone && metric.value !== null && metric.value > 0
    ? metric.tone
    : null
}

/** A section shows failure when any failure count is above zero, else block. */
export function sectionTone(section: {
  groups: ReportMetricGroup[]
}): ReportMetricTone | null {
  const tones = section.groups.flatMap((group) => group.metrics.map(metricTone))
  if (tones.includes("failure")) return "failure"
  return tones.includes("block") ? "block" : null
}

export function formatReportDuration(seconds: number) {
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded}s`
  const minutes = Math.floor(rounded / 60)
  if (minutes < 60) return `${minutes}m ${rounded % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/**
 * Each step as a share of the first (Requests). Counts are occurrences inside
 * one window, not a cohort followed through, so a share can exceed 100%.
 */
export function buildReportFunnel(
  steps: Array<{ label: string; count: number }>,
): ReportFunnelStep[] {
  const first = steps[0]?.count ?? 0
  return steps.map((step, index) =>
    index === 0
      ? step
      : {
          ...step,
          share: first > 0 ? Math.round((step.count / first) * 100) : null,
        },
  )
}

export type ReportDelta =
  | { kind: "up" | "down"; percent: number }
  | { kind: "same" }
  | { kind: "new" }

/** Change against the previous period; `null` when both are zero. */
export function reportDelta(
  current: number,
  previous: number,
): ReportDelta | null {
  if (!current && !previous) return null
  if (!previous) return { kind: "new" }
  const percent = Math.round(((current - previous) / previous) * 100)
  if (!percent) return { kind: "same" }
  return { kind: percent > 0 ? "up" : "down", percent: Math.abs(percent) }
}

/** "5 min", "1 hr 5 min", "3 days 2 hr" for owners rather than "5m 12s". */
export function formatReportDurationPlain(seconds: number) {
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded} sec`
  const minutes = Math.round(rounded / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48)
    return `${hours} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`
  const days = Math.floor(hours / 24)
  return `${days} days${hours % 24 ? ` ${hours % 24} hr` : ""}`
}

/** Whole units for headline figures and charts: "₦1,284,500" (lists keep kobo). */
export function formatReportMoney(minor: number, currencyCode: string) {
  const units = Math.round(minor / 100)
  return `${units < 0 ? "-" : ""}${getCurrencySymbol(currencyCode)}${reportCountFormat.format(Math.abs(units))}`
}

function trimmed(value: number) {
  return (Math.round(value * 10) / 10).toString()
}

/** Chart axis amounts: "₦0", "₦50K", "₦1.2M". */
export function formatReportMoneyCompact(minor: number, currencyCode: string) {
  const units = minor / 100
  const symbol = getCurrencySymbol(currencyCode)
  if (Math.abs(units) >= 1_000_000)
    return `${symbol}${trimmed(units / 1_000_000)}M`
  if (Math.abs(units) >= 1_000) return `${symbol}${trimmed(units / 1_000)}K`
  return `${symbol}${Math.round(units)}`
}

/** Chart axis counts: "0", "5", "1.2K". */
export function formatReportCountCompact(value: number) {
  return Math.abs(value) >= 1_000
    ? `${trimmed(value / 1_000)}K`
    : reportCountFormat.format(value)
}
