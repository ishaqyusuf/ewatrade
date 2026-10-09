/** Shared, framework-free model for report metric lists, funnels and tones. */

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
  /** Percent of the step above; `null` when the step above is zero. */
  ratio?: number | null
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
 * Ratios compare occurrences inside one window with the step above. They are
 * not cohort conversion, so a step can exceed 100%.
 */
export function buildReportFunnel(
  steps: Array<{ label: string; count: number }>,
): ReportFunnelStep[] {
  return steps.map((step, index) => {
    const previous = steps[index - 1]
    if (!previous) return step
    return {
      ...step,
      ratio:
        previous.count > 0
          ? Math.round((step.count / previous.count) * 100)
          : null,
    }
  })
}
