export const ewatradeRoles = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "OPERATOR",
  "SUPPORT",
  "MEMBER",
] as const

export type EwaTradeRole = (typeof ewatradeRoles)[number]

const roleRank: Record<EwaTradeRole, number> = {
  OWNER: 99,
  ADMIN: 80,
  MANAGER: 60,
  CASHIER: 40,
  OPERATOR: 30,
  SUPPORT: 20,
  MEMBER: 10,
}

export function normalizeRole(
  input: string | null | undefined
): EwaTradeRole | null {
  if (!input) {
    return null
  }

  const normalized = input.trim().toUpperCase().replace(/-/g, "_")

  return ewatradeRoles.includes(normalized as EwaTradeRole)
    ? (normalized as EwaTradeRole)
    : null
}

export function isRoleAtLeast(
  actual: EwaTradeRole,
  required: EwaTradeRole
): boolean {
  return roleRank[actual] >= roleRank[required]
}

export function canManageTenant(role: EwaTradeRole) {
  return role === "OWNER" || role === "ADMIN"
}

export function canManageSalesOperations(role: EwaTradeRole) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER"
}

export function canOperatePos(role: EwaTradeRole) {
  return (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "CASHIER" ||
    role === "OPERATOR"
  )
}

export function getRoleDisplayName(
  role: EwaTradeRole | null | undefined
) {
  switch (role) {
    case "OWNER":
      return "Owner"
    case "ADMIN":
      return "Admin"
    case "MANAGER":
      return "Manager"
    case "CASHIER":
      return "Cashier"
    case "OPERATOR":
      return "Operator"
    case "SUPPORT":
      return "Support"
    case "MEMBER":
      return "Member"
    default:
      return "Guest"
  }
}

export function getRoleScopeSummary(
  role: EwaTradeRole | null | undefined
) {
  switch (role) {
    case "OWNER":
      return "Full ownership over business setup, billing, users, sales, and operations."
    case "ADMIN":
      return "Administrative control over catalog, staff, stock, sales, and reports."
    case "MANAGER":
      return "Daily operational control over products, reps, inventory, and reconciliation."
    case "CASHIER":
      return "Point-of-sale access for checkout, receipts, and session activity."
    case "OPERATOR":
      return "Operational access for stock, orders, fulfillment, and support workflows."
    case "SUPPORT":
      return "Support access for customer and merchant assistance without full admin control."
    case "MEMBER":
      return "Limited member access to assigned business or customer-facing activity."
    default:
      return "No active ewatrade role."
  }
}
