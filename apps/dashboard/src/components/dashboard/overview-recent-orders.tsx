import {
  type OverviewRecentOrder,
  customerLabel,
  formatMoney,
  formatOrderTime,
  getOverviewRecentOrders,
  orderHref,
} from "@/components/dashboard/overview/overview-data"
import { OrderStatusDot } from "@/components/orders/order-status"
import { cn } from "@/utils"
import { Avatar, AvatarFallback, Button, Skeleton } from "@ewatrade/ui"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import type { ReactNode } from "react"

const cardSurface =
  "min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-xs dark:shadow-none"

function initials(order: OverviewRecentOrder) {
  const words = customerLabel(order).trim().split(/\s+/)
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase()
}

function RecentOrdersCard({
  viewAll,
  children,
}: {
  viewAll: boolean
  children: ReactNode
}) {
  return (
    <section aria-labelledby="overview-recent-orders" className={cardSurface}>
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 pt-3 pb-1 sm:px-5">
        <h2
          id="overview-recent-orders"
          className="text-[0.9375rem] font-semibold"
        >
          Recent orders
        </h2>
        {viewAll ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            render={<Link href="/sales" />}
          >
            View all
            <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export async function OverviewRecentOrders({
  storeId,
  viewAll,
}: {
  storeId: string
  /** Link to the Orders page; only for members who can open it. */
  viewAll: boolean
}) {
  const recentOrders = await getOverviewRecentOrders(storeId)
  return (
    <RecentOrdersCard viewAll={viewAll && recentOrders.length > 0}>
      {recentOrders.length > 0 ? (
        <ul className="px-1.5 pb-1.5">
          {recentOrders.map((order) => (
            <li key={order.orderNumber}>
              <Link
                href={orderHref(order)}
                className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs font-semibold transition-colors group-hover:bg-background">
                    {initials(order)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {order.orderNumber}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {customerLabel(order)} · {formatOrderTime(order.createdAt)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(order.totalMinor, order.currencyCode)}
                  </span>
                  <OrderStatusDot
                    status={order.status}
                    className="text-xs text-muted-foreground"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pt-6 pb-10 text-center text-sm text-muted-foreground sm:px-5">
          Orders you create or receive will appear here.
        </p>
      )}
    </RecentOrdersCard>
  )
}

export function OverviewRecentOrdersSkeleton() {
  return (
    <output
      aria-label="Loading recent orders"
      className={cn(cardSurface, "block")}
    >
      <div className="flex min-h-14 items-center px-4 pt-3 pb-1 sm:px-5">
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
      <div className="px-1.5 pb-1.5">
        {["a", "b", "c", "d", "e"].map((row) => (
          <div
            key={row}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2.5 sm:px-3"
          >
            <Skeleton className="size-9 rounded-full" />
            <div className="grid gap-1.5">
              <Skeleton className="h-3.5 w-20 rounded-md" />
              <Skeleton className="h-3 w-40 max-w-full rounded-md" />
            </div>
            <div className="grid justify-items-end gap-1.5">
              <Skeleton className="h-3.5 w-20 rounded-md" />
              <Skeleton className="h-3 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </output>
  )
}
