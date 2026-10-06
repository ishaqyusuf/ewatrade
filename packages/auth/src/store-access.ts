import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
} from "./roles"

export type StoreStaffRole = "CASHIER" | "OPERATOR" | "MANAGER"
export type StaffAction =
  | "orders"
  | "stock"
  | "reconciliation"
  | "catalog"
  | "staff"
  | "business"
export type StaffAccess = {
  businessRole: EwaTradeRole
  status: string
  mode: "LEGACY" | "SCOPED"
  catalogEditor: boolean
  assignments: ReadonlyArray<{
    storeId: string
    role: StoreStaffRole
    status: string
  }>
}

/** Never combine roles from different Stores or treat a preferred Store as a grant. */
export function canStaffPerform(
  access: StaffAccess,
  action: StaffAction,
  storeId?: string | null,
): boolean {
  if (access.status !== "ACTIVE") return false
  if (canManageTenant(access.businessRole)) return true
  if (access.businessRole === "SUPPORT" || access.businessRole === "MEMBER")
    return false
  if (access.mode === "LEGACY") {
    if (action === "business") return false
    return action === "orders"
      ? canOperatePos(access.businessRole)
      : canManageSalesOperations(access.businessRole)
  }
  if (action === "staff" || action === "business") return false
  if (action === "catalog") {
    return (
      access.catalogEditor &&
      access.assignments.some(
        (row) => row.status === "ACTIVE" && row.role === "MANAGER",
      )
    )
  }
  const assignment = access.assignments.find(
    (row) => row.storeId === storeId && row.status === "ACTIVE",
  )
  if (!assignment) return false
  if (action === "orders") return true
  if (action === "stock")
    return assignment.role === "OPERATOR" || assignment.role === "MANAGER"
  return assignment.role === "MANAGER"
}

export function canStaffAccessStore(
  access: StaffAccess,
  storeId: string,
): boolean {
  if (access.status !== "ACTIVE") return false
  if (
    access.mode === "SCOPED" &&
    (access.businessRole === "SUPPORT" || access.businessRole === "MEMBER")
  )
    return false
  return (
    canManageTenant(access.businessRole) ||
    access.mode === "LEGACY" ||
    access.assignments.some(
      (row) => row.storeId === storeId && row.status === "ACTIVE",
    )
  )
}
