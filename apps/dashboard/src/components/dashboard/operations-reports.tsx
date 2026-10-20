"use client"

import { OfflineRecordReview } from "@/components/dashboard/offline-record-review"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ReportBarList } from "@/components/reports/report-bar-list"
import { ReportDateControl } from "@/components/reports/report-date-control"
import { ReportDelta } from "@/components/reports/report-delta"
import { ReportDownloadButton } from "@/components/reports/report-download-button"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import {
  ReportMetricGroups,
  ReportNowTag,
  ReportTabPanel,
  ReportTabsList,
  ReportToneDot,
} from "@/components/reports/report-metric-groups"
import {
  reportCountFormat as countFormat,
  formatReportMoney,
  metricTone,
  sectionTone,
} from "@/components/reports/report-metrics"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  isOperationsReportTab,
  useOperationsReportParams,
} from "@/hooks/use-operations-report-params"
import {
  type ReportRange,
  previousReportRange,
  reportRangeDays,
} from "@/lib/report-range"
import { useTRPC } from "@/trpc/client"
import { Tabs, TabsContent, TabsTrigger, cn } from "@ewatrade/ui"
import { Alert02Icon, Clock01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  useCallback,
  useTransition,
} from "react"
import {
  type OperationsSalesReport,
  buildInventoryGroups,
  buildSalesReportCsv,
  buildServiceGroups,
  buildServiceJobsNow,
} from "./operations-report-sections"
import { SalesByDayCard, TopSellersCard } from "./operations-sales-charts"

type Store = { currencyCode: string; id: string; name: string }

function salesInput(store: Store, range: ReportRange) {
  return { from: range.from, storeId: store.id, to: range.to }
}

function useSalesReport(store: Store, range: ReportRange) {
  const trpc = useTRPC()
  return useSuspenseQuery(
    trpc.orders.salesReport.queryOptions(salesInput(store, range), {
      retry: false,
    }),
  ).data
}

type SalesTotals = OperationsSalesReport["totals"]

/** Change against the same days just before; shows nothing until it loads or if it fails. */
function PreviousSalesDelta({
  current,
  pick,
  range,
  store,
}: {
  current: number
  pick: (totals: SalesTotals) => number
  range: ReportRange
  store: Store
}) {
  const trpc = useTRPC()
  const previous = useSuspenseQuery(
    trpc.orders.salesReport.queryOptions(
      salesInput(store, previousReportRange(range)),
      { retry: false },
    ),
  ).data
  return (
    <ReportDelta
      current={current}
      days={reportRangeDays(range)}
      previous={pick(previous.totals)}
    />
  )
}

function useServiceSummary(store: Store) {
  const trpc = useTRPC()
  return useSuspenseQuery(
    trpc.serviceReporting.summary.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  ).data
}

function SalesHeadlines({
  range,
  store,
}: { range: ReportRange; store: Store }) {
  const report = useSalesReport(store, range)
  const { totals } = report
  const money = (minor: number) => formatReportMoney(minor, report.currencyCode)
  const servicesSold = Number(totals.serviceQuantity)
  const delta = (current: number, pick: (totals: SalesTotals) => number) => (
    <ErrorBoundary errorComponent={SilentFailure}>
      <Suspense fallback={null}>
        <PreviousSalesDelta
          current={current}
          pick={pick}
          range={range}
          store={store}
        />
      </Suspense>
    </ErrorBoundary>
  )
  return (
    <ReportHeadlineStrip
      items={[
        {
          detail: delta(totals.orderCount, (before) => before.orderCount),
          label: "Orders",
          muted: totals.orderCount === 0,
          value: countFormat.format(totals.orderCount),
        },
        {
          detail: delta(
            totals.orderValueMinor,
            (before) => before.orderValueMinor,
          ),
          label: "Sales",
          money: true,
          muted: totals.orderValueMinor === 0,
          value: money(totals.orderValueMinor),
        },
        {
          detail: delta(totals.serviceMinor, (before) => before.serviceMinor),
          label: "Service sales",
          money: true,
          muted: totals.serviceMinor === 0,
          value: money(totals.serviceMinor),
        },
        {
          detail: delta(servicesSold, (before) =>
            Number(before.serviceQuantity),
          ),
          label: "Services sold",
          muted: servicesSold === 0,
          value: countFormat.format(servicesSold),
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
        <output className="block border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 lg:col-span-2 dark:text-amber-400">
          Only the first 5,000 Orders in these dates are counted. Try fewer
          days.
        </output>
      ) : null}
      <SalesByDayCard onRange={onRange} range={range} report={report} />
      <TopSellersCard report={report} />
    </div>
  )
}

function SalesDownload({ range, store }: { range: ReportRange; store: Store }) {
  const report = useSalesReport(store, range)
  return (
    <ReportDownloadButton
      build={() => buildSalesReportCsv(report, range, store.name)}
    />
  )
}

/** Disabled until the sales report has loaded, and if it fails. */
function SalesDownloadButton({
  range,
  store,
}: {
  range: ReportRange
  store: Store
}) {
  const disabled = <ReportDownloadButton build={() => null} disabled />
  return (
    <ErrorBoundary errorComponent={() => disabled}>
      <Suspense fallback={disabled}>
        <SalesDownload range={range} store={store} />
      </Suspense>
    </ErrorBoundary>
  )
}

function InventoryPanel({ store }: { store: Store }) {
  const trpc = useTRPC()
  const { data: reconciliation } = useSuspenseQuery(
    trpc.inventory.reconciliationReport.queryOptions(
      { storeId: store.id },
      { retry: false },
    ),
  )
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId: store.id },
      { retry: false },
    ),
  )
  return (
    <ReportTabPanel
      description="Where your stock counts come from, and changes made offline that still need to sync. The dates above don't change this tab."
      title="Stock"
    >
      <ReportMetricGroups
        groups={buildInventoryGroups({ balances, reconciliation })}
      />
      <OfflineRecordReview key={store.id} store={store} />
      <p className="text-xs text-muted-foreground">
        Combined stock totals are for information only. They are never used to
        decide what can be sold.
      </p>
    </ReportTabPanel>
  )
}

function ServicePanel({ store }: { store: Store }) {
  const service = useServiceSummary(store)
  return (
    <ReportTabPanel
      description="Jobs for Customers right now, and every job so far. The dates above don't change this tab."
      title="Service jobs"
    >
      <section aria-label="Jobs right now" className="grid gap-2">
        <h3 className="text-sm font-semibold">
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
                    : "bg-primary",
              hint:
                tone === "block"
                  ? "Blocked: it can't continue until something is fixed."
                  : tone === "failure"
                    ? "Overdue: past the time promised to the Customer."
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

/** Shares the cached summary; renders nothing until it is available. */
function ServiceTabTone({ store }: { store: Store }) {
  const service = useServiceSummary(store)
  return (
    <ReportToneDot
      tone={sectionTone({
        groups: [{ metrics: buildServiceJobsNow(service), title: "Now" }],
      })}
    />
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

function SilentFailure() {
  return null
}

const panelSkeleton = (
  <div aria-hidden="true" className="h-72 animate-pulse bg-muted" />
)

const chartsSkeleton = (
  <div
    aria-hidden="true"
    className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
  >
    <div className="h-80 animate-pulse bg-muted" />
    <div className="h-80 animate-pulse bg-muted" />
  </div>
)

export function OperationsReports({
  store,
  tenantName,
}: { store: Store; tenantName: string }) {
  const params = useOperationsReportParams()
  const { range } = params
  // A date change keeps the current figures on screen, dimmed, until the new ones load.
  const [refreshing, startTransition] = useTransition()
  const setRange = (next: ReportRange) =>
    void params.setRange(next, startTransition)
  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 pt-6">
        <PageHeader
          description={`How sales, stock and service jobs are going at ${store.name}.`}
          eyebrow={`${tenantName} · ${store.name}`}
          title="Reports"
        >
          <PageToolbar
            actions={
              <>
                <ReportDateControl onChange={setRange} range={range} />
                <SalesDownloadButton range={range} store={store} />
              </>
            }
          />
        </PageHeader>
        <div
          aria-busy={refreshing}
          className={cn(
            "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 transition-opacity",
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
        <Tabs
          className="min-w-0 gap-6"
          onValueChange={(value) => {
            if (isOperationsReportTab(value)) void params.setTab(value)
          }}
          value={params.tab}
        >
          <ReportTabsList label="Report sections">
            <TabsTrigger value="inventory">Stock</TabsTrigger>
            <TabsTrigger value="service">
              Service jobs
              <ErrorBoundary errorComponent={SilentFailure}>
                <Suspense fallback={null}>
                  <ServiceTabTone store={store} />
                </Suspense>
              </ErrorBoundary>
            </TabsTrigger>
          </ReportTabsList>
          <TabsContent value="inventory">
            <IsolatedReport fallback={panelSkeleton} title="Stock">
              <InventoryPanel store={store} />
            </IsolatedReport>
          </TabsContent>
          <TabsContent value="service">
            <IsolatedReport fallback={panelSkeleton} title="Service jobs">
              <ServicePanel store={store} />
            </IsolatedReport>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollableContent>
  )
}
