import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import type { DbClient } from "./types"

export type OrderScope = {
  tenantId: string
  storeId?: string
  createdByUserId?: string
}

export function isOrderSalesRep(role: string) {
  return ["CASHIER", "OPERATOR"].includes(role.trim().toUpperCase())
}

/** Resolve afresh for every read, including totals and direct server reads. */
export async function resolveOrderScope(
  db: DbClient,
  input: {
    tenantId: string
    userId: string
    role: string
    storeId?: string
    activeStoreId?: string | null
    allowedStoreIds: string[]
    mine?: boolean
  },
): Promise<OrderScope> {
  const rep = isOrderSalesRep(input.role)
  const storeId = input.storeId ?? (rep ? input.activeStoreId : undefined)
  if (
    (storeId && !input.allowedStoreIds.includes(storeId)) ||
    (rep && !storeId)
  ) {
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  }
  const scope: OrderScope = {
    tenantId: input.tenantId,
    storeId: storeId ?? undefined,
  }
  if (!rep) return scope
  const store = await db.store.findFirst({
    where: { id: storeId ?? undefined, tenantId: input.tenantId },
    select: { salesRepOrderVisibility: true },
  })
  if (!store)
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  if (store.salesRepOrderVisibility !== "ALL_STORE_ORDERS" || input.mine) {
    scope.createdByUserId = input.userId
  }
  return scope
}

export const openOrderWhere = {
  status: { notIn: ["CANCELLED", "DRAFT", "PENDING", "REFUNDED"] },
  OR: [{ paymentStatus: { not: "PAID" } }, { completedAt: null }],
} satisfies Prisma.CommercialOrderWhereInput

export function customerHistoryWhere(
  scope: OrderScope,
): Prisma.CommercialOrderWhereInput {
  const { createdByUserId, ...storeScope } = scope
  return createdByUserId
    ? { ...storeScope, OR: [{ createdByUserId }, openOrderWhere] }
    : storeScope
}

export const orderVisibilitySelect = {
  id: true,
  name: true,
  salesRepOrderVisibility: true,
  salesRepOrderVisibilityReviewedAt: true,
  salesRepOrderVisibilityUpdatedAt: true,
  salesRepOrderVisibilityUpdatedByUserId: true,
} satisfies Prisma.StoreSelect

export function getStoreOrderVisibility(
  db: DbClient,
  input: { tenantId: string; storeId: string },
) {
  return db.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId },
    select: orderVisibilitySelect,
  })
}

export async function updateStoreOrderVisibility(
  db: DbClient,
  input: {
    tenantId: string
    storeId: string
    userId: string
    visibility?: "OWN_SALES" | "ALL_STORE_ORDERS"
  },
) {
  const now = new Date()
  // "Keep as it is" acknowledges the current value without overwriting a
  // concurrent choice made on another device.
  const result = await db.store.updateMany({
    where: { id: input.storeId, tenantId: input.tenantId },
    data: {
      salesRepOrderVisibilityReviewedAt: now,
      ...(input.visibility
        ? {
            salesRepOrderVisibility: input.visibility,
            salesRepOrderVisibilityUpdatedAt: now,
            salesRepOrderVisibilityUpdatedByUserId: input.userId,
          }
        : {}),
    },
  })
  if (!result.count) return null
  return getStoreOrderVisibility(db, input)
}
