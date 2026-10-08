import { prisma } from "@ewatrade/db"
import { getDashboardRecentOrders } from "@ewatrade/db/queries"
import Link from "next/link"

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export async function OverviewRecentOrders({
  storeId,
  tenantId,
  createdByUserId,
}: { storeId: string; tenantId: string; createdByUserId?: string }) {
  const recentOrders = await getDashboardRecentOrders(prisma, {
    storeId,
    tenantId,
    createdByUserId,
  })
  return (
    <>
      {recentOrders.length > 0 ? (
        <div className="border-y border-border bg-background">
          {recentOrders.map((order) => (
            <div
              key={order.orderNumber}
              className="grid gap-2 border-b border-border px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <div className="min-w-0">
                <Link
                  className="font-medium hover:underline"
                  href={`/?orderSheet=details&orderId=${encodeURIComponent(order.id)}`}
                >
                  {order.orderNumber}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {order.customerName || "Walk-in customer"} ·{" "}
                  {order.createdAt.toLocaleString("en-NG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {order.status.toLowerCase().replaceAll("_", " ")}
              </p>
              <p className="font-semibold tabular-nums">
                {money(order.totalMinor, order.currencyCode)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center border-y border-border bg-background p-10 text-sm text-muted-foreground">
          Orders you create or receive will appear here.
        </div>
      )}
    </>
  )
}
