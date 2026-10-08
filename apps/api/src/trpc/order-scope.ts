import { resolveOrderScope } from "@ewatrade/db/queries"
import type { TRPCContext } from "./init"

export function orderScope(
  ctx: Pick<TRPCContext, "db"> & {
    session: NonNullable<TRPCContext["session"]>
    tenantContext: NonNullable<TRPCContext["tenantContext"]>
  },
  input?: { storeId?: string; mine?: boolean },
) {
  const tenant = ctx.tenantContext
  return resolveOrderScope(ctx.db, {
    tenantId: tenant.tenant.id,
    userId: ctx.session.user.id,
    role: tenant.membership.role,
    activeStoreId: tenant.activeStore?.id ?? tenant.stores?.[0]?.id,
    allowedStoreIds: tenant.stores?.map((store) => store.id) ?? [],
    ...input,
  })
}
