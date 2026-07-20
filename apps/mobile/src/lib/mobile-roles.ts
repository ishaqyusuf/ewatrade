type MobileProfile = {
  role?: string
  status?: string
} | null

export function normalizeMobileRole(role: string | undefined) {
  return role?.trim().toUpperCase() ?? ""
}

export function isSalesRepRole(role: string | undefined) {
  const normalizedRole = normalizeMobileRole(role)

  return normalizedRole === "CASHIER" || normalizedRole === "OPERATOR"
}

export function canManageMobileOperations(role: string | undefined) {
  const normalizedRole = normalizeMobileRole(role)
  return (
    normalizedRole === "OWNER" ||
    normalizedRole === "ADMIN" ||
    normalizedRole === "MANAGER"
  )
}

export function isInvitedStaffProfile(profile: MobileProfile) {
  const role = normalizeMobileRole(profile?.role)
  const status = profile?.status?.trim().toUpperCase()

  return (
    status === "INVITED" &&
    (role === "CASHIER" || role === "MANAGER" || role === "OPERATOR")
  )
}

export function getMobileRoleLabel(role: string | undefined) {
  const normalizedRole = normalizeMobileRole(role)

  if (normalizedRole === "CASHIER") return "Attendant"
  if (normalizedRole === "OPERATOR") return "Operator"
  if (normalizedRole === "MANAGER") return "Manager"
  if (normalizedRole === "OWNER") return "Owner"

  return role ?? "Staff"
}
