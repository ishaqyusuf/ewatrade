import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"

/** The Update stock menu, in plain words; `hint` is the line under each item. */
export const INVENTORY_ACTIONS = [
  {
    label: "Stock in",
    hint: "Collected, bought or returned",
    mode: "receipt",
  },
  { label: "Count stock", hint: "Check what is really there", mode: "count" },
  {
    label: "Correct stock",
    hint: "Fix a number that is wrong",
    mode: "adjustment",
  },
  {
    label: "Damaged or lost",
    hint: "Broken, died, expired or stolen",
    mode: "adjustment",
    preset: "loss",
  },
  {
    label: "Used in the business",
    hint: "Feed, cleaning or own use",
    mode: "internal_use",
  },
  {
    label: "Pack or unpack",
    hint: "Fill or open packs kept separately",
    mode: "transformation",
  },
  {
    label: "Send to another store",
    hint: "Leaves now, arrives when received",
    mode: "transfer",
  },
  {
    label: "Hand to staff",
    hint: "Stock a staff member carries",
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
