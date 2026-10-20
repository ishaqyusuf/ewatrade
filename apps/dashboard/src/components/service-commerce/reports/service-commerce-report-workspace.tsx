"use client"
import {
  Button,
  DailyBarChart,
  SelectControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsTrigger,
  cn,
} from "@ewatrade/ui"

import { PageHeader, PageToolbar } from "@/components/page-header"
import {
  ReportChartCard,
  ReportChartEmpty,
} from "@/components/reports/report-chart-card"
import { ReportDateControl } from "@/components/reports/report-date-control"
import { ReportDelta } from "@/components/reports/report-delta"
import { ReportDownloadButton } from "@/components/reports/report-download-button"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
import {
  ReportFunnel,
  ReportMetricGroups,
  ReportTabPanel,
  ReportTabsList,
  ReportTabsSkeleton,
  ReportToneDot,
} from "@/components/reports/report-metric-groups"
import {
  reportCountFormat as countFormat,
  formatReportCountCompact,
  formatReportMoney,
  sectionTone,
} from "@/components/reports/report-metrics"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  InlineRowCheckbox,
  InlineSelectAllCheckbox,
  InlineSelectionStatus,
  useInlineSelection,
} from "@/components/tables/core"
import {
  type ServiceCommerceReportDetail,
  type ServiceCommerceReportRange,
  type ServiceCommerceReportSection,
  isServiceCommerceReportDetail,
  isServiceCommerceReportSection,
  resolveServiceCommerceReportRange,
  useServiceCommerceReportParams,
} from "@/hooks/use-service-commerce-report-params"
import {
  type ReportRange,
  formatReportDay,
  formatReportDayLong,
  formatReportRangeBetween,
  formatReportRangeLabel,
  previousReportRange,
  reportPresetRange,
  reportRangeDays,
} from "@/lib/report-range"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  type ReportSectionContent,
  buildReportSections,
  buildServiceCommerceReportCsv,
  countRequestDays,
  humanizeReportValue,
  lifecycleFunnel,
  usageAttributionLabel,
} from "./report-sections"

type StoreOption = { id: string; name: string }

const DETAIL_LABELS: Record<ServiceCommerceReportDetail, string> = {
  catalog: "Catalog",
  costs: "Costs",
  lifecycle: "Requests",
  media: "Photos and files",
  reliability: "System health",
}

function numericReportValues(value: unknown): number[] {
  if (typeof value === "number") return [value]
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(numericReportValues)
}

function hasReportActivity(report: ServiceCommerceReportOutput) {
  return [
    ...Object.values(report.lifecycle).filter(
      (value): value is number => typeof value === "number",
    ),
    ...Object.values(report.catalog),
    ...Object.values(report.media),
    ...Object.values(report.reliability),
    ...report.observability.map((entry) => entry.count),
    ...report.costs.flatMap((cost) => [cost.knownCount, cost.unknownCount]),
    ...numericReportValues(report.storeConversations),
  ].some((value) => value > 0)
}

type DrilldownRow = {
  date: string
  category: string
  outcome: string
  connectionId?: string | null
  recipientMarket?: string | null
  messageCategory?: string | null
  billingOwner?: string | null
}

/** Daily aggregate rows have no ID; this composite key is unique per row. */
function drilldownRowKey(row: DrilldownRow) {
  return [
    row.date,
    row.category,
    row.outcome,
    row.connectionId ?? "",
    row.recipientMarket ?? "",
    row.messageCategory ?? "",
    row.billingOwner ?? "",
  ].join(":")
}

function ReportDailyDetail({
  category,
  end,
  start,
  storeId,
}: {
  category: ServiceCommerceReportDetail
  end: Date
  start: Date
  storeId: string | null
}) {
  const trpc = useTRPC()
  const drilldown = useQuery(
    trpc.serviceCommerce.reportDrilldown.queryOptions(
      {
        category,
        end,
        ...(storeId ? { storeId } : {}),
        start,
      },
      { retry: false },
    ),
  )
  const rowKeys = useMemo(
    () => drilldown.data?.rows.map(drilldownRowKey) ?? [],
    [drilldown.data],
  )
  const selection = useInlineSelection({
    ids: rowKeys,
    scope: `${category}:${storeId ?? "all"}:${start.toISOString()}:${end.toISOString()}`,
    disabled: drilldown.isFetching,
  })
  const showDetails = Boolean(
    drilldown.data?.rows.some((row) => usageAttributionLabel(row)),
  )

  return (
    <section
      aria-label={`${DETAIL_LABELS[category]} day by day`}
      className="grid min-w-0 gap-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">Day by day</h3>
        <p className="text-sm text-muted-foreground">
          Totals for each day. Message text and photos are never shown.
        </p>
      </div>
      {drilldown.data?.mayBeTruncated ? (
        <output className="block text-sm text-amber-700 dark:text-amber-400">
          Some days may be missing. Try fewer days.
        </output>
      ) : null}
      {drilldown.isPending ? (
        <output
          aria-label="Loading the day-by-day table"
          className="block h-32 animate-pulse bg-muted"
        />
      ) : drilldown.isError ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-destructive">
            The day-by-day table didn't load.
          </p>
          <Button
            className="w-fit rounded-none"
            onClick={() => void drilldown.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : drilldown.data?.rows.length ? (
        <>
          <InlineSelectionStatus selection={selection} />
          <section
            className="overflow-x-auto border border-border"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
            tabIndex={0}
            aria-label="Day-by-day table"
          >
            <Table className="w-full min-w-[32rem] text-left text-sm">
              <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
                <TableRow>
                  <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                    <InlineSelectAllCheckbox
                      selection={selection}
                      label="Select all day-by-day rows"
                    />
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Date
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Type
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Result
                  </TableHead>
                  {showDetails ? (
                    <TableHead scope="col" className="px-4 py-2 font-normal">
                      Charge details
                    </TableHead>
                  ) : null}
                  <TableHead
                    scope="col"
                    className="px-4 py-2 text-right font-normal"
                  >
                    Count
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilldown.data.rows.map((row) => (
                  <TableRow
                    className="border-b border-border/70 last:border-b-0"
                    key={drilldownRowKey(row)}
                    data-state={
                      selection.isSelected(drilldownRowKey(row))
                        ? "selected"
                        : undefined
                    }
                  >
                    <TableCell className="px-4 py-2">
                      <InlineRowCheckbox
                        selection={selection}
                        id={drilldownRowKey(row)}
                        label={`Select ${formatReportDay(row.date)} ${humanizeReportValue(row.category)} ${humanizeReportValue(row.outcome)}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {formatReportDay(row.date)}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanizeReportValue(row.category)}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanizeReportValue(row.outcome)}
                    </TableCell>
                    {showDetails ? (
                      <TableCell className="px-4 py-2 text-muted-foreground">
                        {usageAttributionLabel(row) || "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="px-4 py-2 text-right tabular-nums">
                      {countFormat.format(row.count)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      ) : (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing was recorded on any day in these dates.
        </p>
      )}
    </section>
  )
}

export function ServiceCommerceReportWorkspace({
  initialRange,
  stores,
}: {
  initialRange: ServiceCommerceReportRange
  stores: StoreOption[]
}) {
  const trpc = useTRPC()
  const params = useServiceCommerceReportParams()
  const scope = useMemo(() => {
    if (params.from && params.to && params.to > params.from) {
      return resolveServiceCommerceReportRange({
        from: params.from,
        to: params.to,
      })
    }
    return initialRange
  }, [initialRange, params.from, params.to])
  const storeId = stores.some((store) => store.id === params.store)
    ? params.store
    : null
  const storeName =
    stores.find((store) => store.id === storeId)?.name ?? "All Stores"
  const reportInput = (range: ReportRange) => ({
    end: range.to,
    ...(storeId ? { storeId } : {}),
    start: range.from,
  })
  // New dates or Store keep the current figures on screen, dimmed, until the new ones load.
  const report = useQuery(
    trpc.serviceCommerce.report.queryOptions(reportInput(scope), {
      placeholderData: keepPreviousData,
      retry: false,
    }),
  )
  const previous = useQuery(
    trpc.serviceCommerce.report.queryOptions(
      reportInput(previousReportRange(scope)),
      { retry: false },
    ),
  )
  const setScope = (next: { range?: ReportRange; store?: string | null }) =>
    void params.setScope({
      from: next.range?.from ?? scope.from,
      store: next.store === undefined ? storeId : next.store,
      to: next.range?.to ?? scope.to,
    })

  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 pt-6">
        <PageHeader
          eyebrow="Reports"
          title="Requests and quotes"
          description="What Customers asked for, the Quotes you sent and what got paid. Message text, contacts and photos are never shown."
        >
          <PageToolbar
            actions={
              <>
                <SelectControl
                  aria-label="Store"
                  className="h-9 w-full sm:w-64"
                  onValueChange={(value) => setScope({ store: value || null })}
                  value={storeId ?? ""}
                  options={[
                    { value: "", label: <>All Stores</> },
                    ...stores.map((store) => ({
                      value: store.id,
                      label: store.name,
                    })),
                  ]}
                />
                <ReportDateControl
                  onChange={(range) => setScope({ range })}
                  range={scope}
                />
                <ReportDownloadButton
                  build={() =>
                    report.data && !report.isPlaceholderData
                      ? buildServiceCommerceReportCsv(
                          report.data,
                          scope,
                          storeName,
                        )
                      : null
                  }
                  disabled={!report.data || report.isPlaceholderData}
                />
              </>
            }
          />
        </PageHeader>

        {report.isPending ? (
          <ReportLoading />
        ) : report.isError ? (
          <ReportError
            error={report.error}
            retry={() => void report.refetch()}
          />
        ) : !report.data ? null : !hasReportActivity(report.data) ? (
          <section className="grid gap-1 border border-border bg-background p-6">
            <h2 className="font-semibold">
              No requests {formatReportRangeBetween(scope)}
            </h2>
            <p className="text-sm text-muted-foreground">
              Requests show here when a Customer asks for a Product or Service
              on WhatsApp, your website or through staff. Try more days or
              another Store.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reportRangeDays(scope) < 90 ? (
                <Button
                  className="h-9 rounded-none"
                  onClick={() => setScope({ range: reportPresetRange(90) })}
                  type="button"
                  variant="outline"
                >
                  Show last 90 days
                </Button>
              ) : null}
              {storeId ? (
                <Button
                  className="h-9 rounded-none"
                  onClick={() => setScope({ store: null })}
                  type="button"
                  variant="outline"
                >
                  Show all Stores
                </Button>
              ) : null}
            </div>
          </section>
        ) : (
          <div
            aria-busy={report.isPlaceholderData}
            className={cn(
              "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 transition-opacity",
              report.isPlaceholderData && "opacity-60",
            )}
          >
            {report.data.mayBeTruncated ? (
              <output className="block border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
                Some figures may be missing because the date range is very long.
                Try fewer days.
              </output>
            ) : null}
            <ReportContent
              end={scope.to}
              onSectionChange={(section) => void params.setSection(section)}
              previous={
                previous.data && !report.isPlaceholderData
                  ? previous.data
                  : undefined
              }
              range={scope}
              report={report.data}
              section={params.section}
              start={scope.from}
              storeId={storeId}
            />
          </div>
        )}
      </div>
    </ScrollableContent>
  )
}

function RequestsByDayCard({
  range,
  report,
}: {
  range: ReportRange
  report: ServiceCommerceReportOutput
}) {
  const days = reportRangeDays(range)
  const requestDays = countRequestDays(report)
  const total = report.lifecycle.requestsReceived
  return (
    <ReportChartCard
      note={
        total > 0 && requestDays < days / 3
          ? `Quiet period: requests on ${requestDays} of ${days} days.`
          : undefined
      }
      subtitle={formatReportRangeLabel(range)}
      table={
        report.daily.length
          ? {
              columns: ["Date", "Requests", "Quotes sent", "Paid"],
              numericFrom: 1,
              rows: [...report.daily].reverse().map((day) => ({
                cells: [
                  formatReportDay(day.date, true),
                  countFormat.format(day.requests),
                  countFormat.format(day.quotesIssued),
                  countFormat.format(day.paymentsSucceeded),
                ],
                key: day.date,
              })),
            }
          : undefined
      }
      title="Requests by day"
    >
      {total === 0 || !report.daily.length ? (
        <ReportChartEmpty
          description="They show here when a Customer asks for something."
          title={`No requests ${formatReportRangeBetween(range)}`}
        />
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">{countFormat.format(total)}</span>{" "}
            {total === 1 ? "request" : "requests"} in these dates
          </p>
          <DailyBarChart
            data={report.daily.map((day) => ({
              date: day.date,
              requests: day.requests,
            }))}
            formatDay={(date) => formatReportDay(date)}
            formatDayLong={formatReportDayLong}
            formatTick={formatReportCountCompact}
            formatValue={(value) => countFormat.format(value)}
            label={`Requests by day, ${formatReportRangeLabel(range)}. Use the arrow keys to read each day.`}
            series={[
              {
                color: "var(--report-product)",
                key: "requests",
                label: "Requests",
              },
            ]}
          />
        </>
      )}
    </ReportChartCard>
  )
}

function ReportContent({
  end,
  onSectionChange,
  previous,
  range,
  report,
  section,
  start,
  storeId,
}: {
  end: Date
  onSectionChange: (section: ServiceCommerceReportSection) => void
  previous: ServiceCommerceReportOutput | undefined
  range: ReportRange
  report: ServiceCommerceReportOutput
  section: ServiceCommerceReportSection
  start: Date
  storeId: string | null
}) {
  const sections = useMemo(() => buildReportSections(report), [report])
  const { lifecycle } = report
  const days = reportRangeDays(range)
  const showStores =
    report.scope.storeId === null && report.storeBreakdown.length > 0
  const activeSection =
    section === "stores" && !showStores ? "lifecycle" : section

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <ReportHeadlineStrip
        label="Headline figures"
        items={[
          {
            label: "Requests",
            value: countFormat.format(lifecycle.requestsReceived),
            detail: previous ? (
              <ReportDelta
                current={lifecycle.requestsReceived}
                days={days}
                previous={previous.lifecycle.requestsReceived}
              />
            ) : (
              "In these dates"
            ),
            muted: lifecycle.requestsReceived === 0,
          },
          {
            label: "Quotes sent",
            value: countFormat.format(lifecycle.quotesIssued),
            detail: `${countFormat.format(lifecycle.quotesAccepted)} accepted`,
            muted: lifecycle.quotesIssued === 0,
          },
          {
            label: "Bookings",
            value: countFormat.format(lifecycle.bookingsConfirmed),
            detail: `${countFormat.format(lifecycle.bookingsCompleted)} completed`,
            muted: lifecycle.bookingsConfirmed === 0,
          },
          {
            label: "Amount paid",
            value: formatReportMoney(
              lifecycle.paymentValueMinor,
              report.currencyCode,
            ),
            detail: previous ? (
              <ReportDelta
                current={lifecycle.paymentValueMinor}
                days={days}
                previous={previous.lifecycle.paymentValueMinor}
              />
            ) : (
              `${countFormat.format(lifecycle.paymentsSucceeded)} ${lifecycle.paymentsSucceeded === 1 ? "payment" : "payments"}`
            ),
            money: true,
            muted: lifecycle.paymentValueMinor === 0,
          },
        ]}
      />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RequestsByDayCard range={range} report={report} />
        <ReportChartCard
          subtitle={formatReportRangeLabel(range)}
          title="From request to payment"
        >
          <ReportFunnel
            label="From request to payment"
            steps={lifecycleFunnel(report.lifecycle)}
          />
        </ReportChartCard>
      </div>

      <Tabs
        className="min-w-0 gap-6"
        onValueChange={(value) => {
          if (isServiceCommerceReportSection(value)) onSectionChange(value)
        }}
        value={activeSection}
      >
        <ReportTabsList label="Report sections">
          {sections.map((content) => (
            <TabsTrigger key={content.key} value={content.key}>
              {content.tab}
              <ReportToneDot tone={sectionTone(content)} />
            </TabsTrigger>
          ))}
          {showStores ? (
            <TabsTrigger value="stores">
              Stores · {report.storeBreakdown.length}
            </TabsTrigger>
          ) : null}
        </ReportTabsList>
        {sections.map((content) => (
          <TabsContent key={content.key} value={content.key}>
            <SectionTab
              content={content}
              end={end}
              start={start}
              storeId={storeId}
            />
          </TabsContent>
        ))}
        {showStores ? (
          <TabsContent value="stores">
            <ReportTabPanel
              description="Each Store's requests, Quotes and payments in these dates."
              title="Stores"
            >
              <StoreBreakdownTable report={report} />
            </ReportTabPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}

function SectionTab({
  content,
  end,
  start,
  storeId,
}: {
  content: ReportSectionContent
  end: Date
  start: Date
  storeId: string | null
}) {
  return (
    <ReportTabPanel description={content.description} title={content.title}>
      {content.groups.length ? (
        <ReportMetricGroups groups={content.groups} />
      ) : content.key === "costs" ? (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          No charges in these dates for this Store.
        </p>
      ) : null}
      {content.footnote ? (
        <p className="text-xs text-muted-foreground">{content.footnote}</p>
      ) : null}
      {isServiceCommerceReportDetail(content.key) ? (
        <ReportDailyDetail
          category={content.key}
          end={end}
          start={start}
          storeId={storeId}
        />
      ) : null}
    </ReportTabPanel>
  )
}

function StoreBreakdownTable({
  report,
}: {
  report: ServiceCommerceReportOutput
}) {
  const storeIds = useMemo(
    () => report.storeBreakdown.map((store) => store.storeId),
    [report.storeBreakdown],
  )
  const selection = useInlineSelection({
    ids: storeIds,
    scope: JSON.stringify(report.scope),
  })
  return (
    <div className="grid min-w-0 gap-3">
      <InlineSelectionStatus selection={selection} />
      <section
        className="overflow-x-auto border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
        tabIndex={0}
        aria-label="Stores table"
      >
        <Table className="w-full min-w-[36rem] text-left text-sm">
          <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all Stores"
                />
              </TableHead>
              <TableHead scope="col" className="px-4 py-2 font-normal">
                Store
              </TableHead>
              {["Requests", "Quotes sent", "Paid", "Done"].map((column) => (
                <TableHead
                  className="px-4 py-2 text-right font-normal"
                  key={column}
                  scope="col"
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.storeBreakdown.map((store) => (
              <TableRow
                className="border-b border-border/70 last:border-b-0"
                key={store.storeId}
                data-state={
                  selection.isSelected(store.storeId) ? "selected" : undefined
                }
              >
                <TableCell className="px-4 py-2">
                  <InlineRowCheckbox
                    selection={selection}
                    id={store.storeId}
                    label={`Select ${store.name}`}
                  />
                </TableCell>
                <TableCell className="px-4 py-2 font-normal">
                  {store.name}
                </TableCell>
                {(
                  [
                    ["requests", store.requestsReceived],
                    ["quotes", store.quotesIssued],
                    ["payments", store.paymentsSucceeded],
                    ["completions", store.completions],
                  ] as const
                ).map(([column, value]) => (
                  <TableCell
                    className={cn(
                      "px-4 py-2 text-right tabular-nums",
                      value === 0 && "text-muted-foreground",
                    )}
                    key={column}
                  >
                    {countFormat.format(value)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}

function ReportLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <output className="sr-only">Loading requests and quotes</output>
      <ReportHeadlineStripSkeleton count={4} />
      <div
        aria-hidden="true"
        className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="h-80 animate-pulse bg-muted" />
        <div className="h-80 animate-pulse bg-muted" />
      </div>
      <ReportTabsSkeleton />
    </div>
  )
}

export function ServiceCommerceReportSkeleton() {
  return (
    <ScrollableContent>
      <div className="pt-6">
        <ReportLoading />
      </div>
    </ScrollableContent>
  )
}
