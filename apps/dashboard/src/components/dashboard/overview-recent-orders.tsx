import { orderStatusPill } from "@/components/orders/order-status"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { prisma } from "@ewatrade/db"
import { getDashboardRecentOrders } from "@ewatrade/db/queries"
import Link from "next/link"

/** Whole naira without ".00"; kobo only when there is some. */
function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

function dayKey(value: Date, timeZone: string) {
  return value.toLocaleDateString("en-CA", { timeZone })
}

/** "Today, 10:42", "Yesterday, 16:20", else "18 Oct, 09:40". */
function when(value: Date, timeZone: string, now = new Date()) {
  const time = value.toLocaleTimeString("en-NG", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  })
  const day = dayKey(value, timeZone)
  if (day === dayKey(now, timeZone)) return `Today, ${time}`
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (day === dayKey(yesterday, timeZone)) return `Yesterday, ${time}`
  return `${value.toLocaleDateString("en-NG", { timeZone, day: "numeric", month: "short" })}, ${time}`
}

export async function OverviewRecentOrders({
  storeId,
  tenantId,
  createdByUserId,
  timeZone,
}: {
  storeId: string
  tenantId: string
  createdByUserId?: string
  timeZone: string
}) {
  const recentOrders = await getDashboardRecentOrders(prisma, {
    storeId,
    tenantId,
    createdByUserId,
  })
  if (!recentOrders.length)
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        No orders yet. New orders show here.
      </p>
    )
  return (
    <div>
      {recentOrders.map((order) => {
        const status = orderStatusPill(order.status)
        return (
          <div
            key={order.orderNumber}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5"
          >
            <div className="min-w-0">
              <Link
                className="font-semibold hover:underline"
                href={`/?orderSheet=details&orderId=${encodeURIComponent(order.id)}`}
              >
                {order.orderNumber}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {order.customerName || "Walk-in customer"} ·{" "}
                {when(order.createdAt, timeZone)}
              </p>
            </div>
            <Pill
              tone={status.tone}
              className="col-start-1 row-start-2 justify-self-start sm:col-start-auto sm:row-start-auto"
            >
              {status.label}
            </Pill>
            <p className="col-start-2 row-start-1 text-right font-semibold tabular-nums sm:col-start-auto sm:row-start-auto">
              {money(order.totalMinor, order.currencyCode)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
