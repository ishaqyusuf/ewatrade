import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { type StaffAccess, canStaffPerform } from "@ewatrade/auth/store-access"
import { TRPCError } from "@trpc/server"

export function catalogDetailScope(
  input: { itemId: string; storeId: string },
  tenant: {
    staffAccess?: StaffAccess
    tenant: { id: string }
    membership: { role: string }
    stores: { id: string }[]
    activeStore: { id: string } | null
  },
) {
  const role = normalizeRole(tenant.membership.role)
  if (!role || !canOperatePos(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to view the Catalog.",
    })
  const active = tenant.activeStore ?? tenant.stores[0]
  if (
    !active ||
    active.id !== input.storeId ||
    !tenant.stores.some((store) => store.id === input.storeId)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Active store not found.",
    })
  return {
    ...input,
    tenantId: tenant.tenant.id,
    inventory:
      tenant.staffAccess?.mode === "SCOPED"
        ? canStaffPerform(tenant.staffAccess, "stock", input.storeId)
        : canManageSalesOperations(role),
  }
}
