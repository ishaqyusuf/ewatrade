import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"

export const INVENTORY_ACTIONS = [
  { label: "Receive", mode: "receipt" },
  { label: "Count", mode: "count" },
  { label: "Adjust", mode: "adjustment" },
  { label: "Transform", mode: "transformation" },
  { label: "Custody", mode: "custody" },
  { label: "Transfer", mode: "transfer" },
] as const

export function canOperateInventory(role: string | null | undefined, mode?: string) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole ? canManageSalesOperations(normalizedRole) || (normalizedRole === "OPERATOR" && mode === "SCOPED") : false
}
