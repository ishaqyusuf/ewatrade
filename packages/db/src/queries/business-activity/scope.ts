import { Prisma } from "../../../generated/prisma/client"
import { isOrderSalesRep } from "../order-visibility"
import {
  RetailOpsSubscriptionError,
  assertRetailOpsPlanIdFeature,
  resolveRetailOpsPlanId,
} from "../retail-ops-subscriptions"
import { BusinessActivityError } from "./errors"

export type BusinessActivityViewer = { tenantId: string; viewerUserId: string }

export async function businessActivityScope(
  tx: Prisma.TransactionClient,
  input: BusinessActivityViewer,
) {
  await tx.$queryRaw`
    SELECT "id" FROM "Membership" WHERE "tenantId"=${input.tenantId}
    AND "userId"=${input.viewerUserId} FOR SHARE`
  const member = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.viewerUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: {
      id: true,
      role: true,
      staffAccessMode: true,
      staffAccessRevision: true,
      tenant: {
        select: {
          timezone: true,
          metadata: true,
          subscription: {
            select: {
              plan: { select: { key: true } },
              provider: true,
              status: true,
              billingSubscriptionId: true,
              currentPeriodEndsAt: true,
            },
          },
        },
      },
      staffStoreAssignments: {
        where: {
          tenantId: input.tenantId,
          status: "ACTIVE",
          store: { tenantId: input.tenantId, status: "ACTIVE" },
        },
        select: { storeId: true, role: true },
      },
    },
  })
  if (
    !member ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(member.role)
  )
    throw new BusinessActivityError(
      "FORBIDDEN",
      "Current business operations access is required for Activity.",
    )
  const manages = member.role === "OWNER" || member.role === "ADMIN"
  const stores = await tx.store.findMany({
    where: {
      tenantId: input.tenantId,
      ...(!manages ? { status: "ACTIVE" as const } : {}),
      ...(!manages && member.staffAccessMode === "SCOPED"
        ? {
            id: {
              in: member.staffStoreAssignments.map((grant) => grant.storeId),
            },
          }
        : {}),
    },
    select: { id: true, name: true, salesRepOrderVisibility: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
  if (!manages && !stores.length)
    throw new BusinessActivityError(
      "FORBIDDEN",
      "Choose a Store you can access to read Activity.",
    )
  let finance = false
  if (manages) {
    try {
      assertRetailOpsPlanIdFeature(
        resolveRetailOpsPlanId({
          metadata: member.tenant.metadata,
          subscription: member.tenant.subscription,
        }),
        "finance",
      )
      finance = true
    } catch (error) {
      if (!(error instanceof RetailOpsSubscriptionError)) throw error
    }
  }
  const scope = {
    ...input,
    membershipId: member.id,
    role: member.role,
    manages,
    finance,
    timeZone: member.tenant.timezone,
    stores,
    signature: JSON.stringify([
      input.tenantId,
      input.viewerUserId,
      member.id,
      member.role,
      member.staffAccessMode,
      member.staffAccessRevision,
      finance,
      stores.map((store) => [store.id, store.salesRepOrderVisibility]),
    ]),
  }
  return scope
}
export type BusinessActivityScope = Awaited<
  ReturnType<typeof businessActivityScope>
>

/** Same creator-visibility rule as resolveOrderScope, correlated before pagination/count. */
export function businessActivityScopeSql(
  scope: BusinessActivityScope,
): Prisma.Sql {
  const tenant = Prisma.sql`e."tenantId"=${scope.tenantId}`
  if (scope.manages)
    return Prisma.sql`${tenant} ${scope.finance ? Prisma.empty : Prisma.sql`AND e.category <> 'finance'`}`
  const allOrderStores = scope.stores
    .filter(
      (store) =>
        !isOrderSalesRep(scope.role) ||
        store.salesRepOrderVisibility === "ALL_STORE_ORDERS",
    )
    .map((store) => store.id)
  const ids = scope.stores.map((store) => store.id)
  const creator = allOrderStores.length
    ? Prisma.sql`(o."createdByUserId"=${scope.viewerUserId} OR o."storeId" IN (${Prisma.join(allOrderStores)}))`
    : Prisma.sql`o."createdByUserId"=${scope.viewerUserId}`
  return Prisma.sql`${tenant}
    AND e.type IN ('order.recorded','payment.recorded','payment.refund_recorded')
    AND e."storeId" IN (${Prisma.join(ids)})
    AND EXISTS (SELECT 1 FROM "CommercialOrder" o
      WHERE o.id=e.payload->>'orderId' AND o."tenantId"=${scope.tenantId}
      AND o."storeId"=e."storeId" AND ${creator})`
}
