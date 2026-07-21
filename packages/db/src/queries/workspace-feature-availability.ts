import type { DbClient } from "./types"

export type WorkspaceFeatureAvailability = {
  hasActiveSellableItems: boolean
  hasCatalogItems: boolean
  hasCustomers: boolean
  hasInventoryActivity: boolean
  hasOrders: boolean
  hasProductItems: boolean
  hasReportableActivity: boolean
  hasServiceItems: boolean
  hasServiceJobs: boolean
  hasStaff: boolean
  storeId: string
}

type WorkspaceFeaturePresence = {
  activeSellableItem: unknown
  catalogKinds: Array<"PRODUCT" | "SERVICE">
  customer: unknown
  inventoryActivity: unknown
  order: unknown
  serviceJob: unknown
  staff: unknown
}

export function deriveWorkspaceFeatureAvailability(
  input: WorkspaceFeaturePresence & { storeId: string },
): WorkspaceFeatureAvailability {
  const hasOrders = input.order !== null
  const hasServiceJobs = input.serviceJob !== null
  const hasInventoryActivity = input.inventoryActivity !== null
  const hasProductItems = input.catalogKinds.includes("PRODUCT")
  const hasServiceItems = input.catalogKinds.includes("SERVICE")

  return {
    hasActiveSellableItems: input.activeSellableItem !== null,
    hasCatalogItems: hasProductItems || hasServiceItems,
    hasCustomers: input.customer !== null,
    hasInventoryActivity,
    hasOrders,
    hasProductItems,
    hasReportableActivity: hasOrders || hasServiceJobs || hasInventoryActivity,
    hasServiceItems,
    hasServiceJobs,
    hasStaff: input.staff !== null,
    storeId: input.storeId,
  }
}

export async function getWorkspaceFeatureAvailability(
  db: DbClient,
  input: { storeId: string; tenantId: string },
): Promise<WorkspaceFeatureAvailability> {
  const storeScope = {
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const [
    catalogItems,
    activeSellableItem,
    order,
    serviceJob,
    customer,
    staff,
    inventoryActivity,
  ] = await Promise.all([
    db.catalogItem.findMany({
      distinct: ["kind"],
      select: { kind: true },
      take: 2,
      where: {
        tenantId: input.tenantId,
        offerings: {
          some: {
            storeAvailability: {
              some: { storeId: input.storeId },
            },
          },
        },
      },
    }),
    db.catalogItem.findFirst({
      select: { id: true },
      where: {
        status: "ACTIVE",
        tenantId: input.tenantId,
        offerings: {
          some: {
            pricingPolicy: "FIXED",
            status: "ACTIVE",
            storeAvailability: {
              some: {
                isAvailable: true,
                storeId: input.storeId,
              },
            },
            variant: { status: "ACTIVE" },
          },
        },
      },
    }),
    db.commercialOrder.findFirst({
      select: { id: true },
      where: storeScope,
    }),
    db.serviceJob.findFirst({
      select: { id: true },
      where: storeScope,
    }),
    db.commercialOrder.findFirst({
      select: { id: true },
      where: {
        ...storeScope,
        OR: [
          { customerEmail: { not: null } },
          { customerName: { not: null } },
          { customerPhone: { not: null } },
        ],
      },
    }),
    db.membership.findFirst({
      select: { id: true },
      where: {
        role: { in: ["ADMIN", "MANAGER", "CASHIER", "OPERATOR"] },
        tenantId: input.tenantId,
      },
    }),
    db.stockOperation.findFirst({
      select: { id: true },
      where: storeScope,
    }),
  ])

  return deriveWorkspaceFeatureAvailability({
    activeSellableItem,
    catalogKinds: catalogItems.map((item) => item.kind),
    customer,
    inventoryActivity,
    order,
    serviceJob,
    staff,
    storeId: input.storeId,
  })
}
