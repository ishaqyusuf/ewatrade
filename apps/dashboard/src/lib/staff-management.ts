import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"

export type StaffRoleFilter =
  | "admin"
  | "all"
  | "cashier"
  | "manager"
  | "operator"
  | "owner"

export type StaffStatusFilter = "active" | "all" | "invited" | "suspended"

export type StaffInviteRole = "cashier" | "manager" | "operator"

export type StaffMemberRow = {
  acceptedAt: string | null
  createdAt: string
  id: string
  invitedAt: string | null
  invitedByUserId: string | null
  role: string
  status: string
  updatedAt: string
  user: {
    avatarUrl: string | null
    displayName: string
    email: string
    id: string
    image: string | null
    name: string
  }
}

export type StaffFilters = {
  role?: StaffRoleFilter
  search?: string
  status?: StaffStatusFilter
}

export function canManageStaff(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canManageSalesOperations(normalizedRole) : false
}

export function getStaffDisplayName(staff: StaffMemberRow) {
  return (
    staff.user.displayName?.trim() ||
    staff.user.name?.trim() ||
    staff.user.email
  )
}

export function getStaffRoleLabel(role: string) {
  switch (role.trim().toUpperCase()) {
    case "OWNER":
      return "Owner"
    case "ADMIN":
      return "Admin"
    case "MANAGER":
      return "Manager"
    case "OPERATOR":
      return "Operator"
    case "CASHIER":
      return "Cashier"
    default:
      return "Staff"
  }
}

export function getStaffStatusLabel(status: string) {
  switch (status.trim().toUpperCase()) {
    case "ACTIVE":
      return "Active"
    case "INVITED":
      return "Invited"
    case "SUSPENDED":
      return "Suspended"
    default:
      return "Unknown"
  }
}

export function canUpdateStaffStatus(staff: StaffMemberRow) {
  const role = staff.role.trim().toUpperCase()
  const status = staff.status.trim().toUpperCase()

  return (
    ["CASHIER", "MANAGER", "OPERATOR"].includes(role) &&
    ["ACTIVE", "INVITED", "SUSPENDED"].includes(status)
  )
}

export function getNextStaffStatus(staff: StaffMemberRow) {
  const status = staff.status.trim().toUpperCase()

  return status === "SUSPENDED" ? "active" : "suspended"
}

export function filterStaffRows(
  staff: StaffMemberRow[],
  filters: StaffFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const role = filters.role && filters.role !== "all" ? filters.role : ""
  const status =
    filters.status && filters.status !== "all" ? filters.status : ""

  return staff.filter((member) => {
    const matchesRole = role ? member.role.trim().toLowerCase() === role : true
    const matchesStatus = status
      ? member.status.trim().toLowerCase() === status
      : true
    const matchesSearch = search
      ? [
          getStaffDisplayName(member),
          member.user.email,
          member.role,
          member.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesRole && matchesStatus && matchesSearch
  })
}
