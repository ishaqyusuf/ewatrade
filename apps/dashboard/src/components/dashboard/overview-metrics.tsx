import type { TenantStore } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  type WorkspaceFeatureAvailability,
  getDashboardOverviewMetrics,
} from "@ewatrade/db/queries"

function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value
}

function startOfMonth() {
  const value = new Date()
  value.setDate(1)
  value.setHours(0, 0, 0, 0)
  return value
}

/** Whole naira without ".00"; kobo only when there is some. */
function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

type Props = {
  availability: WorkspaceFeatureAvailability
  store: TenantStore
  tenantId: string
  createdByUserId?: string
}

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"

export async function OverviewMetrics({
  availability,
  store,
  tenantId,
  createdByUserId,
}: Props) {
  const monthStart = startOfMonth()
  const summary = await getDashboardOverviewMetrics(prisma, {
    availability,
    createdByUserId,
    storeId: store.id,
    tenantId,
    todayStart: startOfToday(),
    monthStart,
  })
  // A cashier or operator scoped to their own sales sees only their numbers.
  const own = Boolean(createdByUserId)
  const metrics: Array<{
    label: string
    value: string
    sub: string
    money?: boolean
  }> = [
    ...(availability.hasOrders
      ? [
          {
            label: own ? "Your sales today" : "Sales today",
            money: true,
            value: money(summary.revenueTodayMinor, store.currencyCode),
            sub: "From confirmed orders",
          },
          {
            label: own ? "Your orders this month" : "Orders this month",
            value: summary.ordersThisMonth.toLocaleString(),
            sub: `Since ${monthStart.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`,
          },
        ]
      : []),
    ...(availability.hasCatalogItems
      ? [
          {
            label: "Products and services",
            value: summary.catalogItems.toLocaleString(),
            sub: "In your catalog",
          },
        ]
      : []),
    ...(availability.hasProductItems
      ? [
          {
            label: "Tracked in stock",
            value: summary.stockBalances.toLocaleString(),
            sub: "Products with a stock count",
          },
        ]
      : []),
  ]
  if (!metrics.length) return null
  return (
    <dl data-summary-grid className={GRID}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-w-0 rounded-lg border border-border bg-background px-4 py-3.5"
        >
          <dt className="text-sm font-medium">{metric.label}</dt>
          <dd
            data-summary-money={metric.money || undefined}
            className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums"
          >
            {metric.value}
          </dd>
          <p
            data-summary-detail
            className="mt-0.5 text-xs text-muted-foreground"
          >
            {metric.sub}
          </p>
        </div>
      ))}
    </dl>
  )
}

export function OverviewMetricsSkeleton({
  availability,
}: Pick<Props, "availability">) {
  const count =
    (availability.hasOrders ? 2 : 0) +
    (availability.hasCatalogItems ? 1 : 0) +
    (availability.hasProductItems ? 1 : 0)
  if (!count) return null
  return (
    <output
      aria-label="Loading numbers"
      data-summary-grid
      data-summary-skeleton
      className={GRID}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
          key={index}
          className="h-[92px] animate-pulse rounded-lg border border-border bg-muted"
        />
      ))}
    </output>
  )
}
