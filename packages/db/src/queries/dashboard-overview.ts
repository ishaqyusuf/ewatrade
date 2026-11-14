import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"

type OverviewInput = {
  createdByUserId?: string
  monthStart: Date
  storeId: string
  tenantId: string
  todayStart: Date
}

export type DashboardOverviewMetrics = {
  salesTodayMinor: number
  ordersToday: number
  salesThisMonthMinor: number
  ordersThisMonth: number
}

/**
 * The Overview's sales numbers for one Store in one statement: today and this
 * month (bounds come from the business's time zone). Drafts and cancelled
 * orders are not sales.
 */
export async function getDashboardOverviewMetrics(
  db: DbClient,
  input: OverviewInput,
): Promise<DashboardOverviewMetrics> {
  const creator =
    input.createdByUserId === undefined
      ? Prisma.empty
      : Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}`
  const [summary] = await db.$queryRaw<
    Array<{
      salesTodayMinor: bigint
      ordersToday: bigint
      salesThisMonthMinor: bigint
      ordersThisMonth: bigint
    }>
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(o."totalMinor") FILTER (WHERE o."createdAt" >= ${input.todayStart}), 0) AS "salesTodayMinor",
      COUNT(*) FILTER (WHERE o."createdAt" >= ${input.todayStart}) AS "ordersToday",
      COALESCE(SUM(o."totalMinor") FILTER (WHERE o."createdAt" >= ${input.monthStart}), 0) AS "salesThisMonthMinor",
      COUNT(*) FILTER (WHERE o."createdAt" >= ${input.monthStart}) AS "ordersThisMonth"
    FROM "CommercialOrder" o
    WHERE o."tenantId" = ${input.tenantId} AND o."storeId" = ${input.storeId}
      ${creator}
      AND o."createdAt" >= ${input.monthStart < input.todayStart ? input.monthStart : input.todayStart}
      AND o."status"::text NOT IN ('DRAFT', 'CANCELLED')
  `)
  if (!summary) throw new Error("Overview numbers are unavailable.")
  return {
    salesTodayMinor: Number(summary.salesTodayMinor),
    ordersToday: Number(summary.ordersToday),
    salesThisMonthMinor: Number(summary.salesThisMonthMinor),
    ordersThisMonth: Number(summary.ordersThisMonth),
  }
}

export function getDashboardRecentOrders(
  db: DbClient,
  input: { storeId: string; tenantId?: string; createdByUserId?: string },
) {
  return db.commercialOrder.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      currencyCode: true,
      customerName: true,
      orderNumber: true,
      status: true,
      totalMinor: true,
    },
    take: 5,
    where: {
      storeId: input.storeId,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
    },
  })
}
