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

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

type Props = {
  availability: WorkspaceFeatureAvailability
  store: TenantStore
  tenantId: string
}

export async function OverviewMetrics({
  availability,
  store,
  tenantId,
}: Props) {
  const summary = await getDashboardOverviewMetrics(prisma, {
    availability,
    storeId: store.id,
    tenantId,
    todayStart: startOfToday(),
    monthStart: startOfMonth(),
  })
  const metrics = [
    ...(availability.hasOrders
      ? [
          {
            label: "Revenue today",
            value: store
              ? money(summary.revenueTodayMinor, store.currencyCode)
              : "—",
            sub: "Confirmed order value",
          },
          {
            label: "Orders",
            value: summary.ordersThisMonth.toLocaleString(),
            sub: "This month",
          },
        ]
      : []),
    ...(availability.hasCatalogItems
      ? [
          {
            label: "Catalog items",
            value: summary.catalogItems.toLocaleString(),
            sub: "Products and services",
          },
        ]
      : []),
    ...(availability.hasProductItems
      ? [
          {
            label: "Stock balances",
            value: summary.stockBalances.toLocaleString(),
            sub: "Physical balance sources",
          },
        ]
      : []),
  ]
  return (
    <>
      {metrics.length > 0 ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="border border-border bg-background p-5"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                {metric.value}
              </dd>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {metric.sub}
              </p>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  )
}

export function OverviewMetricsSkeleton({
  availability,
}: Pick<Props, "availability">) {
  const labels = [
    ...(availability.hasOrders ? ["Revenue today", "Orders"] : []),
    ...(availability.hasCatalogItems ? ["Catalog items"] : []),
    ...(availability.hasProductItems ? ["Stock balances"] : []),
  ]
  if (!labels.length) return null
  return (
    <output
      aria-label="Loading overview summaries"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6"
    >
      {labels.map((label) => (
        <div
          key={label}
          className="h-28 animate-pulse border border-border bg-muted"
        />
      ))}
    </output>
  )
}
