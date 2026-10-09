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
  const [revenue, orders, catalogItems, stockBalances] = await Promise.all([
    input.availability.hasOrders
      ? db.commercialOrder.aggregate({
          where: {
            createdAt: { gte: input.todayStart },
            storeId: input.storeId,
            tenantId: input.tenantId,
            createdByUserId: input.createdByUserId,
          },
          _sum: { totalMinor: true },
        })
      : Promise.resolve({ _sum: { totalMinor: null } }),
    input.availability.hasOrders
      ? db.commercialOrder.count({
          where: {
            createdAt: { gte: input.monthStart },
            storeId: input.storeId,
            tenantId: input.tenantId,
            createdByUserId: input.createdByUserId,
          },
        })
      : Promise.resolve(0),
    input.availability.hasCatalogItems
      ? db.catalogItem.count({
          where: {
            offerings: {
              some: { storeAvailability: { some: { storeId: input.storeId } } },
            },
            tenantId: input.tenantId,
          },
        })
      : Promise.resolve(0),
    input.availability.hasProductItems
      ? db.stockBalanceSource.count({ where: { storeId: input.storeId } })
      : Promise.resolve(0),
  ])
  return {
    revenueTodayMinor: revenue._sum.totalMinor ?? 0,
    ordersThisMonth: orders,
    catalogItems,
    stockBalances,
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
