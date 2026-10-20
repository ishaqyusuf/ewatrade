import { TabsList, cn } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"
import type { ReactNode } from "react"

import { ReportBarList } from "./report-bar-list"
import {
  type ReportFunnelStep,
  type ReportMetric,
  type ReportMetricGroup,
  type ReportMetricTone,
  formatReportDurationPlain,
  metricTone,
  reportCountFormat,
} from "./report-metrics"

const UNKNOWN_REASON = "Not recorded for these dates."

function metricText(metric: ReportMetric & { value: number }) {
  if (metric.format === "money" && metric.currencyCode)
    return formatMinorMoney(metric.value, metric.currencyCode)
  if (metric.format === "duration")
    return formatReportDurationPlain(metric.value)
  if (metric.format === "percent") return `${metric.value}%`
  return reportCountFormat.format(metric.value)
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

/** "Right now": a count at this moment that the dates do not change. */
export function ReportNowTag() {
  return (
    <span className="ml-1.5 rounded-full border border-border px-1.5 align-[1px] text-[11px] text-muted-foreground">
      Right now
    </span>
  )
}

function MetricRow({ metric }: { metric: ReportMetric }) {
  const unknown =
    metric.value === null || (metric.format === "money" && !metric.currencyCode)
  const recorded = !unknown && metric.value !== 0
  const tone = metricTone(metric)
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm">
      <dt
        className={cn(
          "min-w-0 flex-1",
          recorded ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {metric.label}
        {metric.current ? <ReportNowTag /> : null}
        {metric.note ? (
          <span className="block text-xs text-muted-foreground">
            {metric.note}
          </span>
        ) : null}
        {unknown ? (
          <span className="block text-xs text-muted-foreground">
            {metric.unknownReason ?? UNKNOWN_REASON}
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
      {unknown ? (
        <dd className="text-right italic text-muted-foreground">Unknown</dd>
      ) : (
        <dd
          className={cn(
            "whitespace-nowrap text-right tabular-nums",
            metric.value === 0 ? "text-muted-foreground" : "font-semibold",
            tone === "failure" && "text-destructive",
            tone === "block" && "text-amber-700 dark:text-amber-400",
          )}
        >
          {metricText(metric as ReportMetric & { value: number })}
        </dd>
      )}
    </div>
  )
}

/** Named groups of label/value rows: zeros muted, Unknown explicit with its reason. */
export function ReportMetricGroups({
  groups,
}: { groups: ReportMetricGroup[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13.5rem),1fr))] gap-x-8 gap-y-5">
      {groups.map((group) => (
        <section aria-label={group.title} key={group.title}>
          <h3 className="mb-1 text-sm font-semibold">{group.title}</h3>
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

const STEP_CLASSES = [
  "bg-[var(--report-step-1)]",
  "bg-[var(--report-step-2)]",
  "bg-[var(--report-step-3)]",
  "bg-[var(--report-step-4)]",
]

/** From request to payment: each step as a share of requests. */
export function ReportFunnel({
  label,
  steps,
}: {
  label: string
  steps: ReportFunnelStep[]
}) {
  const last = steps.at(-1)
  return (
    <div className="grid gap-3">
      {last?.share !== undefined && last.share !== null ? (
        <p className="text-sm">
          <span className="font-semibold">{last.share}%</span> of requests ended
          in a payment
        </p>
      ) : null}
      <ReportBarList
        label={label}
        layout="stacked"
        rows={steps.map((step, index) => ({
          barClassName: STEP_CLASSES[index] ?? STEP_CLASSES.at(-1),
          detail:
            index > 0 && step.share !== null && step.share !== undefined
              ? `${step.share}% of requests`
              : undefined,
          key: step.label,
          label: step.label,
          value: step.count,
          valueLabel: reportCountFormat.format(step.count),
        }))}
      />
      <p className="text-xs text-muted-foreground">
        Each step counts what happened in these dates, not the same Customers
        followed through, so a step can go above 100%.
      </p>
    </div>
  )
}

/** The bordered panel inside one report tab. */
export function ReportTabPanel({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section
      aria-label={title}
      className="grid min-w-0 gap-5 border border-border bg-background p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {actions}
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
