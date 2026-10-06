import { readStaffStoreAccess } from "@ewatrade/db/staff-store-access"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import type { StaffRequestContext } from "./staff-request-access"

/** Reuse the outer transaction for repository transaction boundaries. */
function repositoryClient(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, {
    get(target, property) {
      if (property === "$transaction")
        return async (
          operation: (client: Prisma.TransactionClient) => Promise<unknown>,
        ) => operation(tx)
      const value = Reflect.get(target, property)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as PrismaClient
}

export async function withStaffWriteTransaction<
  TContext extends StaffRequestContext,
  T,
>(ctx: TContext, operation: (ctx: TContext) => Promise<T>) {
  const tenant = ctx.tenantContext
  if (
    !tenant?.staffAccess ||
    tenant.staffAccess.mode !== "SCOPED" ||
    ["OWNER", "ADMIN"].includes(tenant.staffAccess.businessRole)
  )
    return operation(ctx)
  return ctx.db.$transaction(
    async (tx) => {
      // Access changes lock this same Membership FOR UPDATE. They cannot revoke
      // midway through an accepted write; the next request sees the new revision.
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${tenant.membership.id} AND "tenantId" = ${tenant.tenant.id} FOR SHARE`
      const fresh = await readStaffStoreAccess(
        tx,
        tenant.membership.id,
        tenant.tenant.id,
      )
      if (!fresh || fresh.staffAccessMode !== "SCOPED")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Staff access has changed. Refresh your workspace.",
        })
      return operation({
        ...ctx,
        db: repositoryClient(tx),
        tenantContext: {
          ...tenant,
          staffAccess: {
            businessRole: fresh.role,
            status: fresh.status,
            mode: fresh.staffAccessMode,
            catalogEditor: fresh.catalogEditor,
            assignments: fresh.staffStoreAssignments,
          },
        },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
