import { Prisma } from "../../../generated/prisma/client"

export class CustomerMessageError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
    message: string,
  ) {
    super(message)
    this.name = "CustomerMessageError"
  }
}
export type CustomerMessageScope = {
  tenantId: string
  storeId: string
  actorUserId: string
}

/** Recheck the current persisted grant, not a role remembered by the client. */
export async function customerMessageScope(
  tx: Prisma.TransactionClient,
  input: CustomerMessageScope,
  admin = false,
) {
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId"=${input.actorUserId} FOR SHARE`
  const member = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: {
      id: true,
      role: true,
      staffAccessMode: true,
      staffStoreAssignments: {
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: "ACTIVE",
        },
        select: { role: true },
      },
    },
  })
  const manages = member?.role === "OWNER" || member?.role === "ADMIN"
  if (
    !member ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(
      member.role,
    ) ||
    (admin && !manages) ||
    (!manages &&
      member.staffAccessMode === "SCOPED" &&
      !member.staffStoreAssignments.length)
  )
    throw new CustomerMessageError(
      "FORBIDDEN",
      "Current business and Store access is required.",
    )
  const store = await tx.store.findFirst({
    where: { id: input.storeId, tenantId: input.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      countryCode: true,
      supportPhone: true,
      salesRepOrderVisibility: true,
      tenant: {
        select: {
          name: true,
          countryCode: true,
          timezone: true,
          dataClassification: true,
        },
      },
    },
  })
  if (!store)
    throw new CustomerMessageError("NOT_FOUND", "Choose an accessible Store.")
  const ownOrders =
    ["CASHIER", "OPERATOR"].includes(member.role) &&
    store.salesRepOrderVisibility !== "ALL_STORE_ORDERS"
  return { store, member, canManageTemplates: manages, ownOrders }
}

export const customerMessageTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 10_000,
  timeout: 30_000,
}
