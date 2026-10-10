import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import type { TenantContext } from "@ewatrade/db/tenant-context"
import { TRPCError } from "@trpc/server"

/** Call with freshly loaded membership and persisted transfer/source Store IDs. */
export function assertGeneralTransferAccess(
  tenant: TenantContext,
  input: {
    sourceStoreId: string
    targetStoreId: string
    stage: "dispatch" | "receive" | "cancel"
  },
) {
  const deny = (): never => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This transfer requires inventory access to both Stores and confirmation at the receiving or sending Store.",
    })
  }
  const role = normalizeRole(tenant.membership.role)
  if (!role || !canManageSalesOperations(role)) deny()
  if (input.sourceStoreId === input.targetStoreId) deny()
  const confirmationStoreId =
    input.stage === "receive" ? input.targetStoreId : input.sourceStoreId
  if (tenant.activeStore?.id !== confirmationStoreId) deny()
  for (const storeId of [input.sourceStoreId, input.targetStoreId]) {
    if (!tenant.stores.some((store) => store.id === storeId)) deny()
    if (
      tenant.staffAccess &&
      (!canStaffAccessStore(tenant.staffAccess, storeId) ||
        !canStaffPerform(tenant.staffAccess, "stock", storeId))
    )
      deny()
  }
  return confirmationStoreId
}
