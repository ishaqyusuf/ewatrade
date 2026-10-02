import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import { TRPCError } from "@trpc/server"
type CatalogPhotoRequestContext = {
  session: { user: { id: string } } | null
  tenantContext: {
    tenant: { id: string }
    membership: { role: string }
    activeStore?: { id: string } | null
    stores: Array<{ id: string }>
  } | null
  qaSessionScope: { storeId: string } | null
}

export function catalogPhotoActorScope(
  ctx: CatalogPhotoRequestContext,
  requestedStoreId?: string,
) {
  const tenant = ctx.tenantContext
  const role = tenant && normalizeRole(tenant.membership.role)
  if (!tenant || !ctx.session || !role || !canManageSalesOperations(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Catalog management permission required.",
    })
  }
  const storeId =
    requestedStoreId ?? tenant.activeStore?.id ?? tenant.stores[0]?.id
  if (!storeId || !tenant.stores.some((store) => store.id === storeId)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Store not found for this business.",
    })
  }
  if (ctx.qaSessionScope && ctx.qaSessionScope.storeId !== storeId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This QA session is limited to its selected Store.",
    })
  }
  return {
    actorUserId: ctx.session.user.id,
    tenantId: tenant.tenant.id,
    storeId,
  }
}
