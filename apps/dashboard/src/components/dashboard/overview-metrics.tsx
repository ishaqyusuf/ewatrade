import { OverviewHeroActions } from "@/components/dashboard/overview-actions"
import {
  type OverviewRecentOrder,
  formatMoney,
  formatOrderTime,
  getOverviewRecentOrders,
  startOfMonth,
  startOfToday,
} from "@/components/dashboard/overview/overview-data"
import type { TenantStore } from "@/lib/tenant"
import { cn } from "@/utils"
import { prisma } from "@ewatrade/db"
import {
  type WorkspaceFeatureAvailability,
  getDashboardOverviewMetrics,
} from "@ewatrade/db/queries"
import { Skeleton } from "@ewatrade/ui"
import {
  Archive01Icon,
  Package01Icon,
  ShoppingCart01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type Props = {
  availability: WorkspaceFeatureAvailability
  store: TenantStore
  tenantId: string
  /** Which hero buttons the member may use (same rules as the "+" menu). */
  actions: { orders: boolean; stock: boolean }
}

// Below 48rem the shared [data-summary-grid] rules lay these out two-up.
const statColumns = ["", "md:grid-cols-1", "md:grid-cols-2", "md:grid-cols-3"]

const cardSurface =
  "rounded-xl border border-border bg-card text-card-foreground shadow-xs dark:shadow-none"

/** Revenue hero plus the compact counts beneath it. */
export async function OverviewMetrics({
  availability,
  store,
  tenantId,
  actions,
}: Props) {
  const todayStart = startOfToday()
  const [summary, recentOrders] = await Promise.all([
    getDashboardOverviewMetrics(prisma, {
      availability,
      storeId: store.id,
      tenantId,
      todayStart,
      monthStart: startOfMonth(),
    }),
    availability.hasOrders
      ? getOverviewRecentOrders(store.id)
      : Promise.resolve([]),
  ])
  const stats = [
    ...(availability.hasOrders
      ? [
          {
            icon: ShoppingCart01Icon,
            label: "Orders",
            value: summary.ordersThisMonth,
            sub: "This month",
          },
        ]
      : []),
    ...(availability.hasCatalogItems
      ? [
          {
            icon: Package01Icon,
            label: "Catalog items",
            value: summary.catalogItems,
            sub: "Products and services",
          },
        ]
      : []),
    ...(availability.hasProductItems
      ? [
          {
            icon: Archive01Icon,
            label: "Stock balances",
            value: summary.stockBalances,
            sub: "Physical balance sources",
          },
        ]
      : []),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section
        aria-labelledby="overview-revenue-today"
        className={cn(
          cardSurface,
          "bg-[image:radial-gradient(120%_140%_at_0%_0%,color-mix(in_oklch,var(--primary)_13%,transparent)_0%,transparent_55%)] p-5 sm:p-6",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon icon={Wallet01Icon} className="size-4" />
          </span>
          <h2 id="overview-revenue-today" className="font-medium">
            Revenue today
          </h2>
          <span aria-hidden>·</span>
          <span>Confirmed order value</span>
        </div>
        <p className="mt-3 text-4xl leading-none font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-5xl">
          {formatMoney(summary.revenueTodayMinor, store.currencyCode)}
        </p>
        <RevenueContext
          hasOrders={availability.hasOrders}
          lastOrder={recentOrders[0]}
          todayStart={todayStart}
        />
        <OverviewHeroActions
          orders={actions.orders}
          stock={actions.stock}
          firstOrder={!availability.hasOrders}
          orderDisabled={
            !availability.hasOrders && !availability.hasActiveSellableItems
          }
        />
      </section>
      {stats.length > 0 ? (
        <dl
          data-summary-grid
          className={cn("grid gap-3", statColumns[stats.length])}
        >
          {stats.map((stat) => (
            <div key={stat.label} className={cn(cardSurface, "px-4 py-3.5")}>
              <dt className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                <HugeiconsIcon icon={stat.icon} className="size-4 shrink-0" />
                <span className="truncate">{stat.label}</span>
              </dt>
              <dd className="mt-1.5 text-[1.375rem] leading-tight font-semibold tracking-tight tabular-nums">
                {stat.value.toLocaleString()}
              </dd>
              <p data-summary-detail className="text-xs text-muted-foreground">
                {stat.sub}
              </p>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

/** A ₦0.00 hero needs context, so say when the last order came in. */
function RevenueContext({
  hasOrders,
  lastOrder,
  todayStart,
}: {
  hasOrders: boolean
  lastOrder: OverviewRecentOrder | undefined
  todayStart: Date
}) {
  const className = "mt-2.5 text-sm text-muted-foreground"
  if (!hasOrders || !lastOrder) {
    return (
      <p className={className}>
        {hasOrders
          ? "No orders yet today."
          : "No orders yet. Your first order will show here."}
      </p>
    )
  }
  const number = (
    <span className="font-medium text-foreground">{lastOrder.orderNumber}</span>
  )
  if (lastOrder.createdAt >= todayStart) {
    return (
      <p className={className}>
        Last order {number} at{" "}
        {lastOrder.createdAt.toLocaleTimeString("en-NG", {
          timeStyle: "short",
        })}
      </p>
    )
  }
  return (
    <p className={className}>
      No orders yet today · last order {number},{" "}
      {formatOrderTime(lastOrder.createdAt)}
    </p>
  )
}

export function OverviewMetricsSkeleton({
  availability,
}: Pick<Props, "availability">) {
  const stats = [
    availability.hasOrders,
    availability.hasCatalogItems,
    availability.hasProductItems,
  ].filter(Boolean).length
  return (
    <output
      aria-label="Loading overview summaries"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className={cn(cardSurface, "p-5 sm:p-6")}>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-44 rounded-md" />
        </div>
        <Skeleton className="mt-3 h-10 w-52 rounded-lg sm:h-12" />
        <Skeleton className="mt-3 h-4 w-64 max-w-full rounded-md" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
      {stats > 0 ? (
        <div
          data-summary-grid
          data-summary-skeleton
          className={cn("grid gap-3", statColumns[stats])}
        >
          {["first", "second", "third"].slice(0, stats).map((slot) => (
            <div
              key={slot}
              className="h-[5.75rem] animate-pulse rounded-xl border border-border bg-muted"
            />
          ))}
        </div>
      ) : null}
    </output>
  )
}
