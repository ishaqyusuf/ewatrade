import { prisma } from "@ewatrade/db"
import { getDashboardRecentOrders } from "@ewatrade/db/queries"
import { cache } from "react"

/**
 * The hero's "last order" line and the Recent orders card read the same list;
 * `cache` keeps that to one query per request.
 */
export const getOverviewRecentOrders = cache((storeId: string) =>
  getDashboardRecentOrders(prisma, { storeId }),
)

export type OverviewRecentOrder = Awaited<
  ReturnType<typeof getOverviewRecentOrders>
>[number]

export function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value
}

export function startOfMonth() {
  const value = new Date()
  value.setDate(1)
  value.setHours(0, 0, 0, 0)
  return value
}

export function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export function formatOrderTime(value: Date) {
  return value.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function customerLabel(
  order: Pick<OverviewRecentOrder, "customerName">,
) {
  return order.customerName || "Walk-in customer"
}

export function orderHref(order: Pick<OverviewRecentOrder, "id">) {
  return `/?orderSheet=details&orderId=${encodeURIComponent(order.id)}`
}
