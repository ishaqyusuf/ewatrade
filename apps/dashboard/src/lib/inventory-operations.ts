import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"

/** Stock changes in plain words; Stock in first (the page button), the rest under More. */
export const INVENTORY_ACTIONS = [
  {
    label: "Stock in",
    mode: "receipt",
  },
  { label: "Count stock", mode: "count" },
  {
    label: "Correct stock",
    mode: "adjustment",
  },
  {
    label: "Damaged or lost",
    mode: "adjustment",
    preset: "loss",
  },
  {
    label: "Used in the business",
    mode: "internal_use",
  },
  {
    label: "Pack or unpack",
    mode: "transformation",
  },
  {
    label: "Send to another store",
    mode: "transfer",
  },
  {
    label: "Hand to staff",
    mode: "custody",
  },
] as const

export function canOperateInventory(
  role: string | null | undefined,
  mode?: string,
) {
  const normalizedRole = normalizeRole(role)
  return normalizedRole
    ? canManageSalesOperations(normalizedRole) ||
        (normalizedRole === "OPERATOR" && mode === "SCOPED")
    : false
}
