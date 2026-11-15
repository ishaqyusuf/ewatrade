"use client"
import {
  ReportChartCard,
  ReportChartEmpty,
} from "@/components/reports/report-chart-card"
import { ReportDateControl } from "@/components/reports/report-date-control"
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
} from "@/components/reports/report-metric-groups"
import {
  reportCountFormat as countFormat,
  formatReportCountCompact,
  formatReportMoney,
} from "@/components/reports/report-metrics"
import { ReportShareButton } from "@/components/reports/report-share-dialog"
import { useReportTimeZone } from "@/components/reports/report-time-zone"
import { ScrollableContent } from "@/components/scrollable-content"
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
import { PrescriptionReportGate } from "./prescription-report-gate"

import {
  type PrescriptionReportTab,
  isPrescriptionReportTab,
  usePrescriptionReportParams,
} from "@/hooks/use-prescription-report-params"
import {
  type ReportRange,
  formatReportDay,
  formatReportDayLong,
  formatReportRangeBetween,
  formatReportRangeLabel,
  reportPresetRange,
  reportRangeDays,
  reportRangeInstants,
} from "@/lib/report-range"
import { useTRPC } from "@/trpc/client"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  type PrescriptionReportData,
  buildPrescriptionReportSections,
  buildPrescriptionSharePack,
  countPrescriptionRequestDays,
  hasPrescriptionReportActivity,
  prescriptionConversionPercent,
  prescriptionReportFunnel,
} from "./prescription-report-sections"

type StoreOption = { id: string; name: string }

export function PrescriptionReport({ stores }: { stores: StoreOption[] }) {
  const trpc = useTRPC()
  const timeZone = useReportTimeZone()
  const params = usePrescriptionReportParams(timeZone)
  const { range } = params
  const storeId = stores.some((store) => store.id === params.storeId)
    ? params.storeId
    : null
  const storeName =
    stores.find((store) => store.id === storeId)?.name ?? "All Stores"
  // New dates or Store keep the current figures on screen, dimmed, until the new ones load.
  const report = useQuery(
    trpc.prescriptions.report.queryOptions(
      { ...reportRangeInstants(range, timeZone), storeId },
      { placeholderData: keepPreviousData, retry: false },
    ),
  )

  return (
    <ScrollableContent>
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 pt-6 pb-10">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
          <SelectControl
            aria-label="Store"
            className="w-full lg:w-56"
            value={storeId ?? ""}
            onValueChange={(value) => void params.setStoreId(value || null)}
            options={[
              { value: "", label: <>All stores</> },
              ...stores.map((store) => ({
                value: store.id,
                label: store.name,
              })),
            ]}
          />
          <ReportDateControl
            onChange={(next) => void params.setRange(next)}
            range={range}
          />
          <div className="lg:ml-auto">
            <ReportShareButton
              build={() =>
                report.data && !report.isPlaceholderData
                  ? buildPrescriptionSharePack(
                      report.data,
                      range,
                      storeName,
                      timeZone,
                    )
                  : null
              }
              disabled={!report.data || report.isPlaceholderData}
            />
          </div>
        </div>

        {report.isPending ? (
          <PrescriptionReportLoading />
        ) : report.isError &&
          (report.error.data?.code === "FORBIDDEN" ||
            report.error.data?.code === "PRECONDITION_FAILED") ? (
          <PrescriptionReportGate
            reason={
              report.error.data?.code === "FORBIDDEN" ? "role" : "unavailable"
            }
          />
        ) : report.isError ? (
          <ReportError
            error={report.error}
            retry={() => void report.refetch()}
          />
        ) : !report.data ? null : !hasPrescriptionReportActivity(
            report.data,
          ) ? (
          <section className="grid gap-1 rounded-[var(--ui-radius-surface)] border border-border bg-card p-6">
            <h2 className="font-semibold">
              No prescription requests {formatReportRangeBetween(range)}
            </h2>
            <p className="text-sm text-muted-foreground">
              Try more days or another store.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reportRangeDays(range) < 90 ? (
                <Button
                  onClick={() =>
                    void params.setRange(
                      reportPresetRange(90, new Date(), timeZone),
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  Show last 90 days
                </Button>
              ) : null}
              {storeId ? (
                <Button
                  onClick={() => void params.setStoreId(null)}
                  type="button"
                  variant="outline"
                >
                  Show all stores
                </Button>
              ) : null}
            </div>
          </section>
        ) : (
          <div
            aria-busy={report.isPlaceholderData}
            className={cn(
              "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 transition-opacity",
              report.isPlaceholderData && "opacity-60",
            )}
          >
            {report.isPlaceholderData ? (
              <output className="text-sm text-muted-foreground">
                Updating figures…
              </output>
            ) : null}
            <PrescriptionReportContent
              onTabChange={(tab) => void params.setTab(tab)}
              range={range}
              report={report.data}
              tab={params.tab}
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
  report: PrescriptionReportData
}) {
  const timeZone = useReportTimeZone()
  const daily = report.daily ?? []
  const days = reportRangeDays(range)
  const requestDays = countPrescriptionRequestDays(report)
  return (
    <ReportChartCard
      note={
        report.requestCount > 0 && requestDays < days / 3
          ? `Quiet period: requests on ${requestDays} of ${days} days.`
          : undefined
      }
      subtitle={formatReportRangeLabel(range, new Date(), timeZone)}
      table={
        report.requestCount > 0 && daily.length
          ? {
              columns: ["Date", "Requests", "Quotes sent", "Paid orders"],
              numericFrom: 1,
              rows: [...daily].reverse().map((day) => ({
                cells: [
                  formatReportDay(day.date, true),
                  countFormat.format(day.requests),
                  countFormat.format(day.quotesIssued),
                  countFormat.format(day.paidOrders),
                ],
                key: day.date,
              })),
            }
          : undefined
      }
      title="Prescription requests by day"
    >
      {report.requestCount === 0 || !daily.length ? (
        <ReportChartEmpty
          description={
            daily.length || report.requestCount === 0
              ? "They show here when a Customer sends a prescription."
              : "Refresh the page to load them."
          }
          title={
            daily.length || report.requestCount === 0
              ? `No prescription requests ${formatReportRangeBetween(range)}`
              : "Daily counts aren't available yet"
          }
        />
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">
              {countFormat.format(report.requestCount)}
            </span>{" "}
            {report.requestCount === 1 ? "request" : "requests"} in these dates
          </p>
          <DailyBarChart
            data={daily.map((day) => ({
              date: day.date,
              requests: day.requests,
            }))}
            formatDay={(date) => formatReportDay(date)}
            formatDayLong={formatReportDayLong}
            formatTick={formatReportCountCompact}
            formatValue={(value) => countFormat.format(value)}
            label={`Prescription requests by day, ${formatReportRangeLabel(range, new Date(), timeZone)}. Use the arrow keys to read each day.`}
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

function PrescriptionReportContent({
  onTabChange,
  range,
  report,
  tab,
}: {
  onTabChange: (tab: PrescriptionReportTab) => void
  range: ReportRange
  report: PrescriptionReportData
  tab: PrescriptionReportTab
}) {
  const timeZone = useReportTimeZone()
  const sections = useMemo(
    () => buildPrescriptionReportSections(report),
    [report],
  )
  const showStores =
    report.scope === "tenant" && report.storeBreakdown.length > 0
  const activeTab = tab === "stores" && !showStores ? "lifecycle" : tab
  const conversion = prescriptionConversionPercent(report)
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <ReportHeadlineStrip
        label="Headline figures"
        items={[
          {
            label: "Requests",
            value: countFormat.format(report.requestCount),
            detail:
              conversion === null ? undefined : `${conversion}% became orders`,
            muted: report.requestCount === 0,
          },
          {
            label: "Quotes sent",
            value: countFormat.format(report.quoteCount),
            detail: `${countFormat.format(report.quoteOutcomes.accepted)} accepted`,
            muted: report.quoteCount === 0,
          },
          {
            label: "Paid orders",
            value: countFormat.format(report.payment.paidCount),
            detail: `${countFormat.format(report.payment.totalAttempts)} ${report.payment.totalAttempts === 1 ? "try" : "tries"} to pay`,
            muted: report.payment.paidCount === 0,
          },
          {
            label: "Amount paid",
            value: formatReportMoney(
              report.payment.paidAmountMinor,
              report.currencyCode,
            ),
            detail: undefined,
            money: true,
            muted: report.payment.paidAmountMinor === 0,
          },
        ]}
      />

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RequestsByDayCard range={range} report={report} />
        <ReportChartCard
          subtitle={formatReportRangeLabel(range, new Date(), timeZone)}
          title="From request to payment"
        >
          <ReportFunnel
            label="From request to payment"
            steps={prescriptionReportFunnel(report)}
          />
        </ReportChartCard>
      </div>

      <Tabs
        className="min-w-0 gap-6"
        onValueChange={(value) => {
          if (isPrescriptionReportTab(value)) onTabChange(value)
        }}
        value={activeTab}
      >
        <ReportTabsList label="Report sections">
          {sections.map((section) => (
            <TabsTrigger key={section.key} value={section.key}>
              {section.tab}
            </TabsTrigger>
          ))}
          {showStores ? (
            <TabsTrigger value="stores">
              Stores · {report.storeBreakdown.length}
            </TabsTrigger>
          ) : null}
        </ReportTabsList>
        {sections.map((section) => (
          <TabsContent key={section.key} value={section.key}>
            <ReportTabPanel title={section.title}>
              <ReportMetricGroups groups={section.groups} />
            </ReportTabPanel>
          </TabsContent>
        ))}
        {showStores ? (
          <TabsContent value="stores">
            <ReportTabPanel title="Stores">
              <PrescriptionStoreTable report={report} />
            </ReportTabPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}

function PrescriptionStoreTable({
  report,
}: {
  report: PrescriptionReportData
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <section
        className="overflow-x-auto rounded-[var(--ui-radius-item)] border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the report table.
        tabIndex={0}
        aria-label="Stores table"
      >
        <Table className="w-full min-w-[24rem] text-left text-sm">
          <TableHeader className="bg-muted/40 text-xs text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="px-4 py-2 font-normal">
                Store
              </TableHead>
              <TableHead
                scope="col"
                className="px-4 py-2 text-right font-normal"
              >
                Requests
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.storeBreakdown.map((store) => (
              <TableRow
                className="border-b border-border/70 last:border-b-0"
                key={store.storeId}
              >
                <TableCell className="px-4 py-2">{store.name}</TableCell>
                <TableCell
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    store.requestCount === 0 && "text-muted-foreground",
                  )}
                >
                  {countFormat.format(store.requestCount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}

function PrescriptionReportLoading() {
  return (
    <div className="grid min-w-0 gap-6">
      <output className="sr-only">Loading prescription reports</output>
      <ReportHeadlineStripSkeleton count={4} />
      <div
        aria-hidden="true"
        className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div className="h-80 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted" />
        <div className="h-80 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted" />
      </div>
      <ReportTabsSkeleton />
    </div>
  )
}

export function PrescriptionReportSkeleton() {
  return (
    <ScrollableContent>
      <div className="pt-6">
        <PrescriptionReportLoading />
      </div>
    </ScrollableContent>
  )
}
