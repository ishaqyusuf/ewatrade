"use client"

import { ReportBarList } from "@/components/reports/report-bar-list"
import {
  ReportChartCard,
  ReportChartEmpty,
  ReportChartLegend,
} from "@/components/reports/report-chart-card"
import {
  formatReportMoney,
  formatReportMoneyCompact,
  reportCountFormat,
} from "@/components/reports/report-metrics"
import {
  type ReportRange,
  formatReportDay,
  formatReportDayLong,
  formatReportRangeBetween,
  formatReportRangeLabel,
  reportPresetRange,
  reportRangeDays,
} from "@/lib/report-range"
import { Button, DailyBarChart } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"

import {
  type OperationsSalesReport,
  countSalesDays,
} from "./operations-report-sections"

const PRODUCT_COLOR = "var(--report-product)"
const SERVICE_COLOR = "var(--report-service)"

function formatQuantity(quantity: string) {
  const value = Number(quantity)
  return Number.isFinite(value) ? reportCountFormat.format(value) : quantity
}

function ShowNinetyDays({
  onRange,
}: { onRange: (range: ReportRange) => void }) {
  return (
    <Button
      className="h-8 rounded-none"
      onClick={() => onRange(reportPresetRange(90))}
      size="sm"
      type="button"
      variant="outline"
    >
      Show last 90 days
    </Button>
  )
}

export function SalesByDayCard({
  onRange,
  range,
  report,
}: {
  onRange: (range: ReportRange) => void
  range: ReportRange
  report: OperationsSalesReport
}) {
  const { currencyCode, totals } = report
  const days = reportRangeDays(range)
  const salesDays = countSalesDays(report)
  const money = (minor: number) => formatReportMoney(minor, currencyCode)
  const empty = totals.orderCount === 0
  const itemsTotal = totals.productMinor + totals.serviceMinor
  return (
    <ReportChartCard
      note={
        !empty && salesDays < days / 3
          ? `Quiet period: sales on ${salesDays} of ${days} days.`
          : undefined
      }
      subtitle={formatReportRangeLabel(range)}
      table={
        empty
          ? undefined
          : {
              columns: ["Date", "Orders", "Products", "Services", "Sales"],
              numericFrom: 1,
              rows: [...report.days].reverse().map((day) => ({
                cells: [
                  formatReportDay(day.date, true),
                  reportCountFormat.format(day.orderCount),
                  formatMinorMoney(day.productMinor, currencyCode),
                  formatMinorMoney(day.serviceMinor, currencyCode),
                  formatMinorMoney(day.orderValueMinor, currencyCode),
                ],
                key: day.date,
              })),
            }
      }
      title="Sales by day"
    >
      {empty ? (
        <ReportChartEmpty
          action={days < 90 ? <ShowNinetyDays onRange={onRange} /> : null}
          description="Sales show here as soon as an Order is recorded."
          title={`No sales ${formatReportRangeBetween(range)}`}
        />
      ) : (
        <>
          <ReportChartLegend
            items={[
              {
                color: PRODUCT_COLOR,
                label: "Products",
                value: money(totals.productMinor),
              },
              {
                color: SERVICE_COLOR,
                label: "Services",
                value: money(totals.serviceMinor),
              },
            ]}
          />
          <DailyBarChart
            data={report.days.map((day) => ({
              date: day.date,
              product: day.productMinor,
              service: day.serviceMinor,
            }))}
            formatDay={(date) => formatReportDay(date)}
            formatDayLong={formatReportDayLong}
            formatTick={(value) =>
              formatReportMoneyCompact(value, currencyCode)
            }
            formatValue={money}
            label={`Sales by day, ${formatReportRangeLabel(range)}. Use the arrow keys to read each day.`}
            series={[
              { color: PRODUCT_COLOR, key: "product", label: "Products" },
              { color: SERVICE_COLOR, key: "service", label: "Services" },
            ]}
          />
          {itemsTotal !== totals.orderValueMinor ? (
            <p className="text-xs text-muted-foreground">
              Products and Services are item amounts. Sales (
              {money(totals.orderValueMinor)}) also includes Order charges and
              discounts.
            </p>
          ) : null}
        </>
      )}
    </ReportChartCard>
  )
}

export function TopSellersCard({ report }: { report: OperationsSalesReport }) {
  const { currencyCode, otherItems, topItems, totals } = report
  const money = (minor: number) => formatReportMoney(minor, currencyCode)
  const itemsTotal = totals.productMinor + totals.serviceMinor
  return (
    <ReportChartCard
      subtitle="By sales in these dates"
      table={
        topItems.length
          ? {
              columns: ["Item", "Type", "Sold", "Sales"],
              numericFrom: 2,
              rows: topItems.map((item) => ({
                cells: [
                  item.name,
                  item.kind === "service" ? "Service" : "Product",
                  formatQuantity(item.quantity),
                  formatMinorMoney(item.totalMinor, currencyCode),
                ],
                key: `${item.kind}:${item.catalogItemId}`,
              })),
            }
          : undefined
      }
      title="Top sellers"
    >
      {topItems.length ? (
        <>
          <ReportChartLegend
            items={[
              { color: PRODUCT_COLOR, label: "Product" },
              { color: SERVICE_COLOR, label: "Service" },
            ]}
          />
          <ReportBarList
            label="Top sellers"
            layout="stacked"
            rows={[
              ...topItems.map((item) => ({
                barClassName:
                  item.kind === "service"
                    ? "bg-[var(--report-service)]"
                    : "bg-[var(--report-product)]",
                detail: `${formatQuantity(item.quantity)} sold`,
                hint:
                  itemsTotal > 0
                    ? `${Math.round((item.totalMinor / itemsTotal) * 100)}% of item sales`
                    : undefined,
                key: `${item.kind}:${item.catalogItemId}`,
                label: item.name,
                value: item.totalMinor,
                valueLabel: money(item.totalMinor),
              })),
              ...(otherItems.count
                ? [
                    {
                      barClassName: "bg-muted-foreground/50",
                      key: "other",
                      label: "Everything else",
                      labelNote: `${otherItems.count} ${otherItems.count === 1 ? "item" : "items"}`,
                      value: otherItems.totalMinor,
                      valueLabel: money(otherItems.totalMinor),
                    },
                  ]
                : []),
            ]}
          />
        </>
      ) : (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing sold in these dates.
        </p>
      )}
    </ReportChartCard>
  )
}
