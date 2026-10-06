"use client"
import {
  Button,
  SelectControl,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@ewatrade/ui"

import { DateRangeControl } from "@/components/date-range-control"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { ReportError } from "@/components/reports/report-error"
import {
  ReportHeadlineStrip,
  ReportHeadlineStripSkeleton,
} from "@/components/reports/report-headline-strip"
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
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useMemo } from "react"
import {
  type ReportMetric,
  type ReportMetricGroup,
  type ReportMetricTone,
  type ReportSectionContent,
  buildReportSections,
  formatReportDuration,
  humanizeReportValue,
  lifecycleFunnel,
  metricTone,
  sectionTone,
  usageAttributionLabel,
} from "./report-sections"

type StoreOption = { id: string; name: string }

const countFormat = new Intl.NumberFormat("en-NG")

const DETAIL_LABELS: Record<ServiceCommerceReportDetail, string> = {
  catalog: "Catalog",
  costs: "Costs",
  lifecycle: "Lifecycle",
  media: "Media",
  reliability: "Reliability",
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10)
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
        : countFormat.format(metric.value)
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
function ToneDot({ tone }: { tone: ReportMetricTone | null }) {
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

function MetricGroups({ groups }: { groups: ReportMetricGroup[] }) {
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

function LifecycleFunnel({
  lifecycle,
}: {
  lifecycle: ServiceCommerceReportOutput["lifecycle"]
}) {
  const steps = lifecycleFunnel(lifecycle)
  const largest = Math.max(...steps.map((step) => step.count), 1)
  return (
    <div className="grid gap-2.5">
      <ol aria-label="Lifecycle funnel" className="grid gap-2.5">
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
              {countFormat.format(step.count)}
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

function SectionPanel({
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

  return (
    <section
      aria-label={`${DETAIL_LABELS[category]} daily detail`}
      className="grid min-w-0 gap-3 border-t border-border pt-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">Daily detail</h3>
        <p className="text-xs text-muted-foreground">
          Daily totals only. Customer content, provider operation identifiers
          and private media are never included.
        </p>
      </div>
      {drilldown.data?.mayBeTruncated ? (
        <output className="block text-sm text-amber-700 dark:text-amber-400">
          This detail reached its safe query limit and may be incomplete.
        </output>
      ) : null}
      {drilldown.isLoading ? (
        <output
          aria-label="Loading report detail"
          className="block h-32 animate-pulse bg-muted"
        />
      ) : drilldown.isError ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-destructive">
            Report detail is temporarily unavailable.
          </p>
          <Button
            appearance="form"
            className="w-fit"
            onClick={() => void drilldown.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry detail
          </Button>
        </div>
      ) : drilldown.data?.rows.length ? (
        <>
          <InlineSelectionStatus selection={selection} />
          <section
            className="overflow-x-auto border border-border"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
            tabIndex={0}
            aria-label="Report detail table"
          >
            <Table className="w-full min-w-[37rem] text-left text-sm">
              <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
                <TableRow>
                  <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                    <InlineSelectAllCheckbox
                      selection={selection}
                      label="Select all detail rows"
                    />
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Date
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Category
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Outcome
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-normal">
                    Usage attribution
                  </TableHead>
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
                        label={`Select ${row.date} ${humanizeReportValue(row.category)} ${humanizeReportValue(row.outcome)}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {row.date}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanizeReportValue(row.category)}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {humanizeReportValue(row.outcome)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {usageAttributionLabel(row) || "—"}
                    </TableCell>
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
          No daily totals were recorded for {DETAIL_LABELS[category]} in this
          window.
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
  const report = useQuery(
    trpc.serviceCommerce.report.queryOptions(
      {
        end: scope.to,
        ...(storeId ? { storeId } : {}),
        start: scope.from,
      },
      { retry: false },
    ),
  )

  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-6 pt-6">
        <PageHeader
          eyebrow="Service Commerce"
          title="Operational reports"
          description="Aggregate counts for the selected Store and dates. Customer content, contacts and private media are never included."
        >
          <PageToolbar
            actions={
              <>
                <SelectControl
                  aria-label="Service Commerce report Store"
                  className="h-9 w-full sm:w-64"
                  onValueChange={(value) =>
                    void params.setScope({
                      from: scope.from,
                      store: value || null,
                      to: scope.to,
                    })
                  }
                  value={storeId ?? ""}
                  options={[
                    { value: "", label: <>All Stores</> },
                    ...stores.map((store) => ({
                      value: store.id,
                      label: store.name,
                    })),
                  ]}
                />
                <DateRangeControl
                  start={formatDateInput(scope.from)}
                  end={formatDateInput(scope.to)}
                  endExclusive
                  inclusiveLabel
                  maxDays={366}
                  label="Operational report date range"
                  onApply={({ start, end }) =>
                    void params.setScope({
                      from: new Date(`${start}T00:00:00.000Z`),
                      store: storeId,
                      to: new Date(`${end}T00:00:00.000Z`),
                    })
                  }
                />
              </>
            }
          />
        </PageHeader>

        {report.isLoading ? (
          <ReportLoading />
        ) : report.isError ? (
          <ReportError
            error={report.error}
            retry={() => void report.refetch()}
          />
        ) : !report.data ? null : !hasReportActivity(report.data) ? (
          <section className="border border-border bg-background p-6">
            <h2 className="font-semibold">No report activity in this window</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another Store or date range. Zero is shown only after the
              report has loaded; unavailable provider costs remain explicitly
              unknown.
            </p>
          </section>
        ) : (
          <>
            {report.data.mayBeTruncated ? (
              <output className="block border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
                One or more report queries reached their safe limit. Totals may
                be incomplete for this date range.
              </output>
            ) : null}
            <ReportContent
              end={scope.to}
              onSectionChange={(section) => void params.setSection(section)}
              report={report.data}
              section={params.section}
              start={scope.from}
              storeId={storeId}
            />
          </>
        )}
      </div>
    </ScrollableContent>
  )
}

function ReportContent({
  end,
  onSectionChange,
  report,
  section,
  start,
  storeId,
}: {
  end: Date
  onSectionChange: (section: ServiceCommerceReportSection) => void
  report: ServiceCommerceReportOutput
  section: ServiceCommerceReportSection
  start: Date
  storeId: string | null
}) {
  const sections = useMemo(() => buildReportSections(report), [report])
  const { lifecycle } = report
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
            detail: "Received in this window",
            muted: lifecycle.requestsReceived === 0,
          },
          {
            label: "Quotes issued",
            value: countFormat.format(lifecycle.quotesIssued),
            detail: `${countFormat.format(lifecycle.quotesAccepted)} accepted`,
            muted: lifecycle.quotesIssued === 0,
          },
          {
            label: "Bookings confirmed",
            value: countFormat.format(lifecycle.bookingsConfirmed),
            detail: `${countFormat.format(lifecycle.bookingsCompleted)} completed`,
            muted: lifecycle.bookingsConfirmed === 0,
          },
          {
            label: "Payment value",
            value: formatMinorMoney(
              lifecycle.paymentValueMinor,
              report.currencyCode,
            ),
            detail: `${countFormat.format(lifecycle.paymentsSucceeded)} ${lifecycle.paymentsSucceeded === 1 ? "payment" : "payments"} succeeded`,
            money: true,
            muted: lifecycle.paymentValueMinor === 0,
          },
        ]}
      />

      <Tabs
        className="min-w-0 gap-6"
        onValueChange={(value) => {
          if (isServiceCommerceReportSection(value)) onSectionChange(value)
        }}
        value={activeSection}
      >
        <div className="min-w-0 overflow-x-auto border-b border-border pb-1.5 [scrollbar-width:none]">
          <TabsList
            aria-label="Report sections"
            className="w-max"
            variant="line"
          >
            {sections.map((content) => (
              <TabsTrigger key={content.key} value={content.key}>
                {content.tab}
                <ToneDot tone={sectionTone(content)} />
              </TabsTrigger>
            ))}
            {showStores ? (
              <TabsTrigger value="stores">
                Stores · {report.storeBreakdown.length}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>
        {sections.map((content) => (
          <TabsContent key={content.key} value={content.key}>
            <SectionTab
              content={content}
              end={end}
              report={report}
              start={start}
              storeId={storeId}
            />
          </TabsContent>
        ))}
        {showStores ? (
          <TabsContent value="stores">
            <SectionPanel
              description="Each Store's share of the headline figures in this window."
              title="Store breakdown"
            >
              <StoreBreakdownTable report={report} />
            </SectionPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}

function SectionTab({
  content,
  end,
  report,
  start,
  storeId,
}: {
  content: ReportSectionContent
  end: Date
  report: ServiceCommerceReportOutput
  start: Date
  storeId: string | null
}) {
  return (
    <SectionPanel description={content.description} title={content.title}>
      {content.key === "lifecycle" ? (
        <LifecycleFunnel lifecycle={report.lifecycle} />
      ) : null}
      {content.groups.length ? (
        <MetricGroups groups={content.groups} />
      ) : content.key === "costs" ? (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          No cost facts were recorded for this Store and window. Costs appear
          here once a provider or EwaTrade usage fact exists.
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
    </SectionPanel>
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
        aria-label="Store breakdown table"
      >
        <Table className="w-full min-w-[41rem] text-left text-sm">
          <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="w-10 px-4 py-2 font-normal">
                <InlineSelectAllCheckbox
                  selection={selection}
                  label="Select all Stores in this breakdown"
                />
              </TableHead>
              <TableHead scope="col" className="px-4 py-2 font-normal">
                Store
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Requests
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Quotes
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Payments
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Completions
              </TableHead>
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
      <output className="sr-only">Loading Service Commerce report</output>
      <ReportHeadlineStripSkeleton count={4} />
      <div
        aria-hidden="true"
        className="flex gap-4 overflow-hidden border-b border-border pb-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-5 w-20 shrink-0 animate-pulse bg-muted"
            key={`report-tab-skeleton-${index + 1}`}
          />
        ))}
      </div>
      <div aria-hidden="true" className="h-96 animate-pulse bg-muted" />
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
