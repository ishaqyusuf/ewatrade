import { getOverviewPeriods } from "@/lib/dashboard-overview"
import { prisma } from "@ewatrade/db"
import { getDashboardOverviewMetrics } from "@ewatrade/db/queries"

/** Whole naira without ".00"; kobo only when there is some. */
function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4"

/** Today first, then the month so far. No captions: the labels say it. */
export async function OverviewMetrics({
  storeId,
  tenantId,
  currencyCode,
  timeZone,
  createdByUserId,
}: {
  storeId: string
  tenantId: string
  currencyCode: string
  timeZone: string
  createdByUserId?: string
}) {
  const summary = await getDashboardOverviewMetrics(prisma, {
    createdByUserId,
    storeId,
    tenantId,
    ...getOverviewPeriods(timeZone),
  })
  // A cashier or operator scoped to their own sales sees only their numbers.
  const own = createdByUserId !== undefined
  const metrics = [
    {
      label: own ? "Your sales today" : "Sales today",
      value: money(summary.salesTodayMinor, currencyCode),
    },
    {
      label: own ? "Your orders today" : "Orders today",
      value: summary.ordersToday.toLocaleString("en-NG"),
    },
    {
      label: own ? "Your sales this month" : "Sales this month",
      value: money(summary.salesThisMonthMinor, currencyCode),
    },
    {
      label: own ? "Your orders this month" : "Orders this month",
      value: summary.ordersThisMonth.toLocaleString("en-NG"),
    },
  ]
  return (
    <dl className={GRID}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-w-0 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-4"
        >
          <dt className="text-sm text-muted-foreground">{metric.label}</dt>
          <dd className="mt-1.5 text-[22px] leading-tight font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-[28px]">
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function OverviewMetricsSkeleton() {
  return (
    <output aria-label="Loading numbers" className={GRID}>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
          key={index}
          className="h-[92px] animate-pulse rounded-[var(--ui-radius-surface)] border border-border bg-muted sm:h-[100px]"
        />
      ))}
    </output>
  )
}
