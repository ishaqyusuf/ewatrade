import { TabsList, cn } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"

import {
  type ReportFunnelStep,
  type ReportMetric,
  type ReportMetricGroup,
  type ReportMetricTone,
  formatReportDuration,
  metricTone,
  reportCountFormat,
} from "./report-metrics"

function MetricValue({ metric }: { metric: ReportMetric }) {
  if (
    metric.value === null ||
    (metric.format === "money" && !metric.currencyCode)
  )
    return (
      <dd
        className="cursor-help text-right italic text-muted-foreground underline decoration-dotted underline-offset-4"
        title={
          metric.unknownReason ??
          "Not available for this window. It is never shown as zero."
        }
      >
        Unknown
      </dd>
    )
  const text =
    metric.format === "money" && metric.currencyCode
      ? formatMinorMoney(metric.value, metric.currencyCode)
      : metric.format === "duration"
        ? formatReportDuration(metric.value)
        : metric.format === "percent"
          ? `${metric.value}%`
          : reportCountFormat.format(metric.value)
  const tone = metricTone(metric)
  return (
    <dd
      className={cn(
        "whitespace-nowrap text-right tabular-nums",
        metric.value === 0 ? "text-muted-foreground" : "font-semibold",
        tone === "failure" && "text-destructive",
        tone === "block" && "text-amber-700 dark:text-amber-400",
      )}
    >
      {text}
    </dd>
  )
}

const TONE_LABELS: Record<ReportMetricTone, string> = {
  block: "has blocks",
  failure: "has failures",
}

/** Square marker on a tab whose section has a failure or block above zero. */
export function ReportToneDot({ tone }: { tone: ReportMetricTone | null }) {
  if (!tone) return null
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0",
          tone === "failure" ? "bg-destructive" : "bg-amber-500",
        )}
        title={`This section ${TONE_LABELS[tone]}`}
      />
      <span className="sr-only">, {TONE_LABELS[tone]}</span>
    </>
  )
}

function MetricRow({ metric }: { metric: ReportMetric }) {
  const recorded = metric.value !== null && metric.value !== 0
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm">
      <dt
        className={cn(
          "min-w-0 flex-1",
          recorded ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {metric.label}
        {metric.current ? (
          <span
            className="ml-1.5 border border-border px-1 align-[1px] text-[10px] uppercase tracking-wide text-muted-foreground"
            title="Current snapshot, not a count inside the window"
          >
            now
          </span>
        ) : null}
        {metric.note ? (
          <span className="block text-xs text-muted-foreground">
            {metric.note}
          </span>
        ) : null}
        {metric.shareOf !== undefined ? (
          <span aria-hidden="true" className="mt-1 block h-0.5 bg-muted">
            <span
              className="block h-full bg-primary"
              style={{
                width: `${metric.shareOf > 0 && metric.value ? (metric.value / metric.shareOf) * 100 : 0}%`,
              }}
            />
          </span>
        ) : null}
      </dt>
      <MetricValue metric={metric} />
    </div>
  )
}

/** Named groups of label/value rows: zeros muted, Unknown explicit. */
export function ReportMetricGroups({
  groups,
}: { groups: ReportMetricGroup[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] gap-x-8 gap-y-5">
      {groups.map((group) => (
        <section aria-label={group.title} key={group.title}>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h3>
          <dl>
            {group.metrics.map((metric) => (
              <MetricRow key={metric.label} metric={metric} />
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

export function ReportFunnel({
  label,
  steps,
}: {
  label: string
  steps: ReportFunnelStep[]
}) {
  const largest = Math.max(...steps.map((step) => step.count), 1)
  return (
    <div className="grid gap-2.5">
      <ol aria-label={label} className="grid gap-2.5">
        {steps.map((step) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] items-center gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_4rem_3rem]"
            key={step.label}
          >
            <span>{step.label}</span>
            <span
              aria-hidden="true"
              className="col-span-3 row-start-2 h-2.5 bg-muted sm:col-span-1 sm:row-start-auto"
            >
              <span
                className="block h-full bg-primary"
                style={{ width: `${(step.count / largest) * 100}%` }}
              />
            </span>
            <span
              className={cn(
                "text-right tabular-nums",
                step.count === 0 ? "text-muted-foreground" : "font-semibold",
              )}
            >
              {reportCountFormat.format(step.count)}
            </span>
            <span
              className="text-right text-xs tabular-nums text-muted-foreground"
              title="Compared with the step above"
            >
              {step.ratio === undefined
                ? ""
                : step.ratio === null
                  ? "—"
                  : `${step.ratio}%`}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Percentages compare counts in this window with the step above. They
        don't follow the same customers through, so a step can be above 100%.
      </p>
    </div>
  )
}

/** The bordered panel inside one report tab. */
export function ReportTabPanel({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section
      aria-label={title}
      className="grid min-w-0 gap-5 border border-border bg-background p-4 sm:p-6"
    >
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  )
}

/** Line tabs that scroll inside their own row on narrow screens. */
export function ReportTabsList({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="min-w-0 overflow-x-auto border-b border-border pb-1.5 [scrollbar-width:none]">
      <TabsList aria-label={label} className="w-max" variant="line">
        {children}
      </TabsList>
    </div>
  )
}

export function ReportTabsSkeleton() {
  return (
    <>
      <div
        aria-hidden="true"
        className="flex gap-4 overflow-hidden border-b border-border pb-3"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <div
            className="h-5 w-20 shrink-0 animate-pulse bg-muted"
            key={`report-tab-skeleton-${index + 1}`}
          />
        ))}
      </div>
      <div aria-hidden="true" className="h-96 animate-pulse bg-muted" />
    </>
  )
}
