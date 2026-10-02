import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"

export function canOperateInventory(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole ? canManageSalesOperations(normalizedRole) : false
}
