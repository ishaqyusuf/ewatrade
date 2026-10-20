import { addExactDecimals } from "@ewatrade/utils/exact-decimal"

import type {
  OrderStatus,
  PrismaClient,
  SellableOfferingKind,
} from "../../generated/prisma/client"
import type { OrderScope } from "./order-visibility"
import { utcDayKey, utcDayKeys } from "./report-days"

/** Orders read for one sales window; more than this marks the report partial. */
export const SALES_REPORT_ORDER_LIMIT = 5000
/** Top sellers returned; the rest are summed into `otherItems`. */
export const SALES_REPORT_TOP_ITEMS = 6

/** Draft, cancelled and refunded Orders are not sales. */
const NOT_SALES: OrderStatus[] = ["DRAFT", "CANCELLED", "REFUNDED"]

export type SalesReportOrder = {
  createdAt: Date
  totalMinor: number
  lines: Array<{
    kind: SellableOfferingKind
    quantity: { toString(): string } | number | string
    totalMinor: number
    offering: { catalogItemId: string; name: string }
    snapshot: { catalogItemId: string; catalogItemName: string } | null
  }>
}

export type SalesReportDay = {
  /** UTC calendar day, matching the report window's UTC boundaries. */
  date: string
  orderCount: number
  orderValueMinor: number
  productMinor: number
  serviceMinor: number
}

export type SalesReportItem = {
  catalogItemId: string
  kind: "product" | "service"
  name: string
  quantity: string
  totalMinor: number
}

export const salesReportDayKeys = utcDayKeys

/** Pure totals for a dated window: daily Product and Service sales and top sellers. */
export function summarizeSalesWindow(
  orders: SalesReportOrder[],
  window: { from: Date; to: Date },
) {
  const days = new Map<string, SalesReportDay>(
    salesReportDayKeys(window.from, window.to).map((date) => [
      date,
      {
        date,
        orderCount: 0,
        orderValueMinor: 0,
        productMinor: 0,
        serviceMinor: 0,
      },
    ]),
  )
  const items = new Map<string, SalesReportItem>()
  let serviceQuantity = "0"
  for (const order of orders) {
    const day = days.get(utcDayKey(order.createdAt))
    if (day) {
      day.orderCount += 1
      day.orderValueMinor += order.totalMinor
    }
    for (const line of order.lines) {
      const quantity = line.quantity.toString()
      const kind = line.kind === "SERVICE" ? "service" : "product"
      if (day) {
        if (kind === "service") day.serviceMinor += line.totalMinor
        else day.productMinor += line.totalMinor
      }
      if (kind === "service")
        serviceQuantity = addExactDecimals(serviceQuantity, quantity)
      const catalogItemId =
        line.snapshot?.catalogItemId ?? line.offering.catalogItemId
      const key = `${kind}:${catalogItemId}`
      const item = items.get(key)
      if (item) {
        item.quantity = addExactDecimals(item.quantity, quantity)
        item.totalMinor += line.totalMinor
      } else {
        items.set(key, {
          catalogItemId,
          kind,
          name: line.snapshot?.catalogItemName ?? line.offering.name,
          quantity,
          totalMinor: line.totalMinor,
        })
      }
    }
  }
  const dayList = [...days.values()]
  const ranked = [...items.values()].sort(
    (left, right) =>
      right.totalMinor - left.totalMinor || left.name.localeCompare(right.name),
  )
  const rest = ranked.slice(SALES_REPORT_TOP_ITEMS)
  const sum = (field: keyof Omit<SalesReportDay, "date">) =>
    dayList.reduce((total, entry) => total + entry[field], 0)
  return {
    days: dayList,
    otherItems: {
      count: rest.length,
      totalMinor: rest.reduce((total, item) => total + item.totalMinor, 0),
    },
    topItems: ranked.slice(0, SALES_REPORT_TOP_ITEMS),
    totals: {
      orderCount: sum("orderCount"),
      orderValueMinor: sum("orderValueMinor"),
      productMinor: sum("productMinor"),
      serviceMinor: sum("serviceMinor"),
      serviceQuantity,
    },
  }
}

/** Sales by day and top sellers for Orders created in `[from, to)`. */
export async function getCommercialOrderSalesReport(
  db: PrismaClient,
  input: OrderScope & { from: Date; to: Date },
) {
  const orders = await db.commercialOrder.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      lines: {
        select: {
          kind: true,
          offering: { select: { catalogItemId: true, name: true } },
          quantity: true,
          snapshot: { select: { catalogItemId: true, catalogItemName: true } },
          totalMinor: true,
        },
      },
      totalMinor: true,
    },
    take: SALES_REPORT_ORDER_LIMIT + 1,
    where: {
      createdAt: { gte: input.from, lt: input.to },
      createdByUserId: input.createdByUserId,
      status: { notIn: NOT_SALES },
      tenantId: input.tenantId,
      ...(input.storeId ? { storeId: input.storeId } : {}),
    },
  })
  const partial = orders.length > SALES_REPORT_ORDER_LIMIT
  return {
    ...summarizeSalesWindow(
      partial ? orders.slice(0, SALES_REPORT_ORDER_LIMIT) : orders,
      input,
    ),
    partial,
  }
}
