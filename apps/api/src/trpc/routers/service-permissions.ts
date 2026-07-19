import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { TRPCError } from "@trpc/server"

export function assertServiceOperator(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Service work.",
    })
  }
}

export function assertServiceManager(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageSalesOperations(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage this Service workflow.",
    })
  }
}

export function resolveServiceStoreId(
  stores: Array<{ id: string }>,
  activeStore: { id: string } | null,
  requestedStoreId?: string,
) {
  if (requestedStoreId) {
    if (!stores.some((store) => store.id === requestedStoreId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found." })
    }
    return requestedStoreId
  }
  const storeId = activeStore?.id ?? stores[0]?.id
  if (!storeId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a Store before operating Services.",
    })
  }
  return storeId
}
