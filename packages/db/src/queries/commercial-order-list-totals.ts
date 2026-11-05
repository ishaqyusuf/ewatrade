import type { PrismaClient } from "../../generated/prisma/client"
import {
  type CommercialOrderListFilter,
  commercialOrderListWhere,
  legacyPaidWhere,
} from "./commercial-order-list-where"

/**
 * Exact totals for every Order matching the list's scope, dates and search,
 * grouped by currency, Order status and payment status so the screen can sum
 * any status or payment filter without another request. Never mixes
 * currencies, and ignores how many pages a phone has loaded.
 */
export async function getCommercialOrderListTotals(
  db: Pick<PrismaClient, "commercialOrder">,
  input: CommercialOrderListFilter,
) {
  const { where } = commercialOrderListWhere(input)
  const by = ["currencyCode", "status", "paymentStatus"] as const
  const [all, owing] = await Promise.all([
    db.commercialOrder.groupBy({
      by: [...by],
      _count: { _all: true },
      _sum: { totalMinor: true },
      orderBy: [{ currencyCode: "asc" }, { status: "asc" }],
      where,
    }),
    // Orders with money still due: paid below total, not legacy-paid.
    db.commercialOrder.groupBy({
      by: [...by],
      _count: { _all: true },
      _sum: { amountPaidMinor: true, totalMinor: true },
      orderBy: [{ currencyCode: "asc" }, { status: "asc" }],
      where: {
        AND: [
          where,
          { amountPaidMinor: { lt: db.commercialOrder.fields.totalMinor } },
          { NOT: legacyPaidWhere },
        ],
      },
    }),
  ])
  const key = (row: {
    currencyCode: string
    status: string
    paymentStatus: string
  }) => `${row.currencyCode}|${row.status}|${row.paymentStatus}`
  const owingByKey = new Map(owing.map((row) => [key(row), row]))
  const groups = all.map((row) => {
    const due = owingByKey.get(key(row))
    const orderValueMinor = row._sum.totalMinor ?? 0
    const outstandingMinor = due
      ? (due._sum.totalMinor ?? 0) - (due._sum.amountPaidMinor ?? 0)
      : 0
    return {
      currencyCode: row.currencyCode,
      status: row.status,
      paymentStatus: row.paymentStatus,
      orderCount: row._count._all,
      orderValueMinor,
      outstandingCount: due?._count._all ?? 0,
      outstandingMinor,
      paidMinor: orderValueMinor - outstandingMinor,
    }
  })
  return {
    groups,
    orderCount: groups.reduce((count, group) => count + group.orderCount, 0),
  }
}
