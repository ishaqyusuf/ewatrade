import { addExactDecimals } from "@ewatrade/utils/exact-decimal"

import type {
  CommercialPaymentMethod,
  OrderStatus,
  PaymentStatus,
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
  /** With `paymentStatus`, works out what is still owed; absent counts as paid. */
  amountPaidMinor?: number
  paymentStatus?: PaymentStatus
  /** Payments recorded against the Order; legacy-paid Orders have none. */
  paymentCount?: number
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

/**
 * What is still owed on one Order: paid below total, unless it is a legacy
 * Order marked Paid with no payment records (the Home "unpaid" rule).
 */
export function salesReportOrderOwedMinor(order: SalesReportOrder) {
  if (order.amountPaidMinor === undefined) return 0
  if (
    order.paymentStatus === "PAID" &&
    order.amountPaidMinor === 0 &&
    !order.paymentCount
  )
    return 0
  return Math.max(0, order.totalMinor - order.amountPaidMinor)
}

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
  let owedMinor = 0
  let owedOrderCount = 0
  for (const order of orders) {
    const owed = salesReportOrderOwedMinor(order)
    if (owed > 0) {
      owedMinor += owed
      owedOrderCount += 1
    }
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
    owed: { orderCount: owedOrderCount, totalMinor: owedMinor },
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

/** Customer credit spends money already received, so it is not money in. */
const NOT_MONEY_IN: CommercialPaymentMethod[] = ["CUSTOMER_CREDIT"]

export type SalesReportMoneyIn = {
  totalMinor: number
  /** Net of refunds, largest first; methods that net to zero are left out. */
  methods: Array<{ method: CommercialPaymentMethod; totalMinor: number }>
}

/** Nets payments and refunds per method into money in. */
export function summarizeMoneyIn(
  rows: Array<{
    method: CommercialPaymentMethod
    type: "PAYMENT" | "REFUND"
    amountMinor: number
  }>,
): SalesReportMoneyIn {
  const byMethod = new Map<CommercialPaymentMethod, number>()
  for (const row of rows) {
    if (NOT_MONEY_IN.includes(row.method)) continue
    const signed = row.type === "REFUND" ? -row.amountMinor : row.amountMinor
    byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + signed)
  }
  const methods = [...byMethod]
    .map(([method, totalMinor]) => ({ method, totalMinor }))
    .filter((entry) => entry.totalMinor !== 0)
    .sort(
      (left, right) =>
        right.totalMinor - left.totalMinor ||
        left.method.localeCompare(right.method),
    )
  return {
    methods,
    totalMinor: methods.reduce((total, entry) => total + entry.totalMinor, 0),
  }
}

/**
 * The Reports page in three statements: Orders created in `[from, to)` with
 * their lines (sales by day, top sellers, still owed), payments recorded in the
 * window (money in by method) and the Order total for the same number of days
 * just before (the change line).
 */
export async function getCommercialOrderSalesReport(
  db: PrismaClient,
  input: OrderScope & { from: Date; to: Date },
) {
  const scope = {
    createdByUserId: input.createdByUserId,
    tenantId: input.tenantId,
    ...(input.storeId ? { storeId: input.storeId } : {}),
  }
  const previousFrom = new Date(
    input.from.getTime() - (input.to.getTime() - input.from.getTime()),
  )
  const [orders, payments, previous] = await Promise.all([
    db.commercialOrder.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        _count: { select: { payments: true } },
        amountPaidMinor: true,
        createdAt: true,
        lines: {
          select: {
            kind: true,
            offering: { select: { catalogItemId: true, name: true } },
            quantity: true,
            snapshot: {
              select: { catalogItemId: true, catalogItemName: true },
            },
            totalMinor: true,
          },
        },
        paymentStatus: true,
        totalMinor: true,
      },
      take: SALES_REPORT_ORDER_LIMIT + 1,
      where: {
        ...scope,
        createdAt: { gte: input.from, lt: input.to },
        status: { notIn: NOT_SALES },
      },
    }),
    db.commercialOrderPayment.groupBy({
      _sum: { amountMinor: true },
      by: ["method", "type"],
      orderBy: [{ method: "asc" }, { type: "asc" }],
      where: {
        recordedAt: { gte: input.from, lt: input.to },
        tenantId: input.tenantId,
        ...(input.storeId ? { storeId: input.storeId } : {}),
        ...(input.createdByUserId
          ? { order: { createdByUserId: input.createdByUserId } }
          : {}),
      },
    }),
    db.commercialOrder.aggregate({
      _count: { _all: true },
      _sum: { totalMinor: true },
      where: {
        ...scope,
        createdAt: { gte: previousFrom, lt: input.from },
        status: { notIn: NOT_SALES },
      },
    }),
  ])
  const partial = orders.length > SALES_REPORT_ORDER_LIMIT
  const counted = (
    partial ? orders.slice(0, SALES_REPORT_ORDER_LIMIT) : orders
  ).map(({ _count, ...order }) => ({ ...order, paymentCount: _count.payments }))
  return {
    ...summarizeSalesWindow(counted, input),
    moneyIn: summarizeMoneyIn(
      payments.map((row) => ({
        amountMinor: row._sum.amountMinor ?? 0,
        method: row.method,
        type: row.type,
      })),
    ),
    partial,
    previous: {
      orderCount: previous._count._all,
      orderValueMinor: previous._sum.totalMinor ?? 0,
    },
  }
}
