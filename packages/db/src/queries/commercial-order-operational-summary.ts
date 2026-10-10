import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import type { OrderStatus } from "../../generated/prisma/enums"
import type { OrderScope } from "./order-visibility"

export type OrderOperationalSummaryInput = OrderScope & {
  customerId?: string
  createdAfter?: Date
  createdBefore?: Date
  statuses?: OrderStatus[]
}
type CurrencySummary = {
  currencyCode: string
  orderCount: string
  orderValueMinor: string
  outstandingCount: string
  outstandingMinor: string
}
/** Exact, unpaginated aggregate. Money and counts stay decimal strings. */
export async function getCommercialOrderOperationalSummary(
  db: PrismaClient,
  input: OrderOperationalSummaryInput,
) {
  if (
    (input.createdAfter && !Number.isFinite(input.createdAfter.getTime())) ||
    (input.createdBefore && !Number.isFinite(input.createdBefore.getTime())) ||
    (input.createdAfter &&
      input.createdBefore &&
      input.createdAfter >= input.createdBefore)
  )
    throw Error("End must follow start")
  const statuses = input.statuses?.length ? input.statuses : undefined
  const currencies = await db.$queryRaw<CurrencySummary[]>(Prisma.sql`
    WITH scoped AS (
      SELECT o."currencyCode", o."status", o."totalMinor"::bigint AS total,
        CASE WHEN o."amountPaidMinor" = 0 AND o."paymentStatus" = 'PAID'
          AND NOT EXISTS (SELECT 1 FROM "CommercialOrderPayment" p WHERE p."orderId" = o.id AND p."tenantId" = o."tenantId")
          THEN o."totalMinor"::bigint ELSE o."amountPaidMinor"::bigint END AS paid
      FROM "CommercialOrder" o
      WHERE o."tenantId" = ${input.tenantId}
        ${input.storeId ? Prisma.sql`AND o."storeId" = ${input.storeId}` : Prisma.empty}
        ${input.createdByUserId ? Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}` : Prisma.empty}
        ${input.customerId ? Prisma.sql`AND o."customerId" = ${input.customerId}` : Prisma.empty}
        ${input.createdAfter ? Prisma.sql`AND o."createdAt" >= ${input.createdAfter}` : Prisma.empty}
        ${input.createdBefore ? Prisma.sql`AND o."createdAt" < ${input.createdBefore}` : Prisma.empty}
        ${statuses ? Prisma.sql`AND o."status"::text IN (${Prisma.join(statuses)})` : Prisma.empty}
    ), balances AS (
      SELECT *, CASE WHEN "status" IN ('CANCELLED','REFUNDED') THEN 0 ELSE GREATEST(0,total-paid) END AS outstanding FROM scoped
    )
    SELECT "currencyCode", COUNT(*)::text AS "orderCount", COALESCE(SUM(total),0)::text AS "orderValueMinor",
      COUNT(*) FILTER (WHERE outstanding > 0)::text AS "outstandingCount",
      COALESCE(SUM(outstanding),0)::text AS "outstandingMinor"
    FROM balances GROUP BY "currencyCode" ORDER BY "currencyCode"
  `)
  return {
    orderCount: currencies
      .reduce((sum, row) => sum + BigInt(row.orderCount), 0n)
      .toString(),
    outstandingCount: currencies
      .reduce((sum, row) => sum + BigInt(row.outstandingCount), 0n)
      .toString(),
    currencies,
    complete: true as const,
  }
}
