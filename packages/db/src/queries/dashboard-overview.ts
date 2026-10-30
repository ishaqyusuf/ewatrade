import { Prisma } from "../../generated/prisma/client"
import type { DbClient } from "./types"
import type { WorkspaceFeatureAvailability } from "./workspace-feature-availability"

type OverviewInput = {
  availability: Pick<
    WorkspaceFeatureAvailability,
    "hasOrders" | "hasCatalogItems" | "hasProductItems"
  >
  createdByUserId?: string
  monthStart: Date
  storeId: string
  tenantId: string
  todayStart: Date
}

export async function getDashboardOverviewMetrics(
  db: DbClient,
  input: OverviewInput,
) {
  const { hasOrders, hasCatalogItems, hasProductItems } = input.availability
  if (!hasOrders && !hasCatalogItems && !hasProductItems)
    return {
      revenueTodayMinor: 0,
      ordersThisMonth: 0,
      catalogItems: 0,
      stockBalances: 0,
    }

  const orderScope = Prisma.sql`
    o."tenantId" = ${input.tenantId} AND o."storeId" = ${input.storeId}
    ${input.createdByUserId === undefined ? Prisma.empty : Prisma.sql`AND o."createdByUserId" = ${input.createdByUserId}`}
  `
  // Separate date probes retain the monthly index-only count's access path.
  const orderTotals = hasOrders
    ? Prisma.sql`
        SELECT
          (
            SELECT COALESCE(SUM(o."totalMinor"), 0) FROM "CommercialOrder" o
            WHERE ${orderScope} AND o."createdAt" >= ${input.todayStart}
          ) AS "revenueTodayMinor",
          (
            SELECT COUNT(*) FROM "CommercialOrder" o
            WHERE ${orderScope} AND o."createdAt" >= ${input.monthStart}
          ) AS "ordersThisMonth"`
    : Prisma.sql`SELECT 0::bigint AS "revenueTodayMinor", 0::bigint AS "ordersThisMonth"`
  const catalogCount = hasCatalogItems
    ? Prisma.sql`(
        SELECT COUNT(*) FROM "CatalogItem" c
        WHERE c."tenantId" = ${input.tenantId} AND c."systemRole" IS NULL
          AND EXISTS (
            SELECT 1 FROM "SellableOffering" o
            JOIN "StoreOfferingAvailability" a ON a."offeringId" = o."id"
            WHERE o."catalogItemId" = c."id" AND a."storeId" = ${input.storeId}
          )
      )`
    : Prisma.sql`0::bigint`
  const stockCount = hasProductItems
    ? Prisma.sql`(SELECT COUNT(*) FROM "StockBalanceSource" s WHERE s."storeId" = ${input.storeId})`
    : Prisma.sql`0::bigint`
  const [summary] = await db.$queryRaw<
    Array<{
      revenueTodayMinor: bigint
      ordersThisMonth: bigint
      catalogItems: bigint
      stockBalances: bigint
    }>
  >(Prisma.sql`
    WITH order_totals AS (${orderTotals})
    SELECT "revenueTodayMinor", "ordersThisMonth",
      ${catalogCount} AS "catalogItems", ${stockCount} AS "stockBalances"
    FROM order_totals
  `)
  if (!summary) throw new Error("Overview numbers are unavailable.")
  return {
    revenueTodayMinor: Number(summary.revenueTodayMinor),
    ordersThisMonth: Number(summary.ordersThisMonth),
    catalogItems: Number(summary.catalogItems),
    stockBalances: Number(summary.stockBalances),
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
