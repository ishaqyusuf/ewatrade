"use client"

import { OfflineRecordReview } from "@/components/dashboard/offline-record-review"
import { ReportBarList } from "@/components/reports/report-bar-list"
import { ReportDateControl } from "@/components/reports/report-date-control"
import { ReportDelta } from "@/components/reports/report-delta"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import {
  ReportMetricGroups,
  ReportNowTag,
  ReportTabPanel,
} from "@/components/reports/report-metric-groups"
import {
  reportCountFormat as countFormat,
  formatReportMoney,
  metricTone,
} from "@/components/reports/report-metrics"
import { ReportShareButton } from "@/components/reports/report-share-dialog"
import { useReportTimeZone } from "@/components/reports/report-time-zone"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  type OperationsReportTab,
  useOperationsReportParams,
} from "@/hooks/use-operations-report-params"
import {
  type ReportRange,
  reportRangeDays,
  reportRangeInstants,
} from "@/lib/report-range"
import { useTRPC } from "@/trpc/client"
import { Button, cn } from "@ewatrade/ui"
import {
  Alert02Icon,
  Clock01Icon,
  PackageIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useCallback,
  useTransition,
} from "react"
import {
  buildInventoryGroups,
  buildSalesSharePack,
  buildServiceGroups,
  buildServiceJobsNow,
  paymentMethodLabel,
} from "./operations-report-sections"
import { SalesByDayCard, TopSellersCard } from "./operations-sales-charts"

type Store = { currencyCode: string; id: string; name: string }

/** One read per period: sales, money in, still owed and the previous period. */
function useSalesReport(store: Store, range: ReportRange) {
  const trpc = useTRPC()
  const window = reportRangeInstants(range, useReportTimeZone())
  return useSuspenseQuery(
    trpc.orders.salesReport.queryOptions(
      { from: window.from, storeId: store.id, to: window.to },
      { retry: false },
    ),
  ).data
}

function SalesHeadlines({
  range,
  store,
}: { range: ReportRange; store: Store }) {
  const report = useSalesReport(store, range)
  const { moneyIn, owed, previous, totals } = report
  const money = (minor: number) => formatReportMoney(minor, report.currencyCode)
  const days = reportRangeDays(range)
  return (
    <ReportHeadlineStrip
      items={[
        {
          detail: (
            <ReportDelta
              current={totals.orderValueMinor}
              days={days}
              previous={previous.orderValueMinor}
            />
          ),
          label: "Sales",
          money: true,
          muted: totals.orderValueMinor === 0,
          value: money(totals.orderValueMinor),
        },
        {
          label: "Money in",
          money: true,
          muted: moneyIn.totalMinor === 0,
          value: money(moneyIn.totalMinor),
        },
        {
          detail:
            owed.orderCount > 0
              ? `On ${countFormat.format(owed.orderCount)} ${owed.orderCount === 1 ? "order" : "orders"}`
              : undefined,
          label: "Still owed",
          money: true,
          muted: owed.totalMinor === 0,
          value: money(owed.totalMinor),
        },
        {
          detail: (
            <ReportDelta
              current={totals.orderCount}
              days={days}
              previous={previous.orderCount}
            />
          ),
          label: "Orders",
          muted: totals.orderCount === 0,
          value: countFormat.format(totals.orderCount),
        },
      ]}
      label="Sales"
    />
  )
}

function SalesCharts({
  onRange,
  range,
  store,
}: {
  onRange: (range: ReportRange) => void
  range: ReportRange
  store: Store
}) {
  const report = useSalesReport(store, range)
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {report.partial ? (
        <output className="block rounded-[var(--ui-radius-surface)] border border-[var(--warning-border)] bg-[var(--warning)] p-4 text-sm text-[var(--warning-foreground)] lg:col-span-2">
          Only the first 5,000 orders in these dates are counted. Pick fewer
          days.
        </output>
      ) : null}
      <SalesByDayCard onRange={onRange} range={range} report={report} />
      <TopSellersCard report={report} />
    </div>
  )
}

/** Money in by payment method, one bar colour (a single series needs no legend). */
function MoneyInCard({ range, store }: { range: ReportRange; store: Store }) {
  const report = useSalesReport(store, range)
  const { methods, totalMinor } = report.moneyIn
  const money = (minor: number) => formatReportMoney(minor, report.currencyCode)
  return (
    <section
      aria-label="How customers paid"
      className="grid min-w-0 content-start gap-3.5 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-5"
    >
      <div>
        <h2 className="font-semibold">How customers paid</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Money in: <span className="tabular-nums">{money(totalMinor)}</span>
        </p>
      </div>
      {methods.length ? (
        <ReportBarList
          label="How customers paid"
          layout="stacked"
          rows={methods.map((entry) => ({
            barClassName: "bg-[var(--report-service)]",
            detail:
              totalMinor > 0
                ? `${Math.round((entry.totalMinor / totalMinor) * 100)}%`
                : undefined,
            key: entry.method,
            label: paymentMethodLabel(entry.method),
            value: Math.max(0, entry.totalMinor),
            valueLabel: money(entry.totalMinor),
          }))}
        />
      ) : (
        <p className="rounded-[var(--ui-radius-item)] border border-dashed border-border p-4 text-sm text-muted-foreground">
          No payments recorded in these dates.
        </p>
      )}
    </section>
  )
}

function ShareReport({ range, store }: { range: ReportRange; store: Store }) {
  const report = useSalesReport(store, range)
  const timeZone = useReportTimeZone()
  return (
    <ReportShareButton
      build={() => buildSalesSharePack(report, range, store.name, timeZone)}
    />
  )
}

/** Disabled until the sales report has loaded, and if it fails. */
function ShareReportButton({
  range,
  store,
}: {
  range: ReportRange
  store: Store
}) {
  const disabled = <ReportShareButton build={() => null} disabled />
  return (
    <ErrorBoundary errorComponent={() => disabled}>
      <Suspense fallback={disabled}>
        <ShareReport range={range} store={store} />
      </Suspense>
    </ErrorBoundary>
  )
}

function InventoryPanel({ store }: { store: Store }) {
  const trpc = useTRPC()
  // Both independent reads start before suspending; they load only when opened.
  const [{ data: reconciliation }, { data: balances }] = useSuspenseQueries({
    queries: [
      trpc.inventory.reconciliationReport.queryOptions(
        { storeId: store.id },
        { retry: false },
      ),
      trpc.inventory.balanceReport.queryOptions(
        { includeCompatibleTotals: true, storeId: store.id },
        { retry: false },
      ),
    ],
  })
  return (
    <ReportTabPanel title="Stock check">
      <ReportMetricGroups
        groups={buildInventoryGroups({ balances, reconciliation })}
      />
      <OfflineRecordReview key={store.id} store={store} />
    </ReportTabPanel>
  )
}

function ServicePanel({ store }: { store: Store }) {
  const trpc = useTRPC()
  const service = useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  ).data
  return (
    <ReportTabPanel title="Service jobs">
      <section aria-label="Jobs right now" className="grid gap-2">
        <h3 className="font-semibold">
          Jobs right now
          <ReportNowTag />
        </h3>
        <ReportBarList
          label="Jobs right now"
          rows={buildServiceJobsNow(service).map((metric) => {
            const tone = metricTone(metric)
            return {
              barClassName:
                metric.tone === "failure"
                  ? "bg-destructive"
                  : metric.tone === "block"
                    ? "bg-amber-500"
                    : "bg-[var(--report-service)]",
              hint:
                tone === "block"
                  ? "Blocked: it can't continue until something is fixed."
                  : tone === "failure"
                    ? "Overdue: past the time promised to the customer."
                    : undefined,
              icon: metric.tone ? (
                <HugeiconsIcon
                  aria-hidden="true"
                  className={
                    metric.tone === "failure"
                      ? "size-4 shrink-0 text-destructive"
                      : "size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  }
                  icon={metric.tone === "failure" ? Clock01Icon : Alert02Icon}
                />
              ) : null,
              key: metric.label,
              label: metric.label,
              value: metric.value ?? 0,
              valueLabel: countFormat.format(metric.value ?? 0),
            }
          })}
        />
      </section>
      <ReportMetricGroups groups={buildServiceGroups(service)} />
    </ReportTabPanel>
  )
}

function IsolatedReport({
  children,
  fallback,
  title,
}: {
  children: ReactNode
  fallback: ReactNode
  title: string
}) {
  const ReportFailure = useCallback(
    (props: ComponentProps<typeof ReportError>) => (
      <ReportError {...props} title={title} />
    ),
    [title],
  )
  return (
    <ErrorBoundary errorComponent={ReportFailure}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  )
}

const panelSkeleton = (
  <div
    aria-hidden="true"
    className="h-72 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted"
  />
)

const chartsSkeleton = (
  <div
    aria-hidden="true"
    className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
  >
    <div className="h-80 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted" />
    <div className="h-80 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted" />
  </div>
)

const MORE: Array<{
  icon: typeof PackageIcon
  label: string
  value: OperationsReportTab
}> = [
  { icon: PackageIcon, label: "Stock check", value: "inventory" },
  { icon: Wrench01Icon, label: "Service jobs", value: "service" },
]

/** Stock and job snapshots ignore the period, so they open on request only. */
function RightNowCard({
  onTab,
  tab,
}: {
  onTab: (tab: OperationsReportTab | null) => void
  tab: OperationsReportTab | null
}) {
  return (
    <section
      aria-label="Right now"
      className="grid min-w-0 content-start gap-3.5 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-5"
    >
      <h2 className="font-semibold">Right now</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {MORE.map((option) => (
          <Button
            aria-pressed={tab === option.value}
            className={cn(
              "justify-start",
              tab === option.value &&
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
            key={option.value}
            onClick={() => onTab(tab === option.value ? null : option.value)}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={option.icon}
            />
            {option.label}
          </Button>
        ))}
      </div>
    </section>
  )
}

function RightNowPanel({
  store,
  tab,
}: {
  store: Store
  tab: OperationsReportTab | null
}) {
  if (tab === "inventory")
    return (
      <IsolatedReport fallback={panelSkeleton} title="Stock check">
        <InventoryPanel store={store} />
      </IsolatedReport>
    )
  if (tab === "service")
    return (
      <IsolatedReport fallback={panelSkeleton} title="Service jobs">
        <ServicePanel store={store} />
      </IsolatedReport>
    )
  return null
}

export function OperationsReports({ store }: { store: Store }) {
  const params = useOperationsReportParams(useReportTimeZone())
  const { range } = params
  // A period change keeps the current figures on screen, dimmed, until the new ones load.
  const [refreshing, startTransition] = useTransition()
  const setRange = (next: ReportRange) =>
    void params.setRange(next, startTransition)
  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-5 pt-6 pb-10">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ReportDateControl onChange={setRange} range={range} />
          <ShareReportButton range={range} store={store} />
        </div>
        <div
          aria-busy={refreshing}
          className={cn(
            "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 transition-opacity",
            refreshing && "opacity-60",
          )}
        >
          {refreshing ? (
            <output className="text-sm text-muted-foreground">
              Updating figures…
            </output>
          ) : null}
          <IsolatedReport
            fallback={<ReportHeadlineStripSkeleton count={4} />}
            title="Sales"
          >
            <SalesHeadlines range={range} store={store} />
          </IsolatedReport>
          <IsolatedReport fallback={chartsSkeleton} title="Sales by day">
            <SalesCharts onRange={setRange} range={range} store={store} />
          </IsolatedReport>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div
            className={cn(
              "min-w-0 transition-opacity",
              refreshing && "opacity-60",
            )}
          >
            <IsolatedReport fallback={panelSkeleton} title="How customers paid">
              <MoneyInCard range={range} store={store} />
            </IsolatedReport>
          </div>
          <RightNowCard onTab={params.setTab} tab={params.tab} />
        </div>
        <RightNowPanel store={store} tab={params.tab} />
      </div>
    </ScrollableContent>
  )
}
