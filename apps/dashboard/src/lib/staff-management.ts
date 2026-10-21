import {
  canManageSalesOperations,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"

export type StaffRoleFilter =
  | "admin"
  | "all"
  | "cashier"
  | "manager"
  | "operator"
  | "owner"

export type StaffStatusFilter = "active" | "all" | "invited" | "suspended"

export type StaffInviteRole = "cashier" | "manager" | "operator"

export type StaffAccessView = {
  /** Owners, admins and legacy-mode staff can use every Store. */
  allStores: boolean
  catalogEditor: boolean
  defaultStoreId: string | null
  stores: Array<{ storeId: string; storeName: string; role: string }>
  invitationId: string | null
  invitationExpiresAt: string | null
}

export type StaffMemberRow = {
  access?: StaffAccessView
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

export function canManageStaff(role: string | null | undefined, mode?: string) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole
    ? mode === "SCOPED"
      ? canManageTenant(normalizedRole)
      : canManageSalesOperations(normalizedRole)
    : false
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
      return "Sales rep"
    case "CASHIER":
      return "Cashier"
    default:
      return "Staff"
  }
}

/** What each role can do, in the words the Staff page uses. */
export const staffRoleDescriptions: Record<string, string> = {
  OWNER: "Owns the business. Can do everything, including billing.",
  ADMIN: "Runs every store, the catalog, staff and reports.",
  MANAGER: "Runs their stores: orders, stock, cash counts and reports.",
  CASHIER: "Sells and takes payments. Can’t change stock or prices.",
  OPERATOR: "Sells, takes payments and updates stock. Can’t change prices.",
}

/**
 * The role people work as: Store roles decide what staff limited to some
 * Stores can do, so their shared Store role wins over the business role.
 */
export function getStaffWorkingRole(staff: StaffMemberRow): string | null {
  const access = staff.access
  if (!access || access.allStores || !access.stores.length) return staff.role
  const roles = new Set(access.stores.map((store) => store.role.toUpperCase()))
  return roles.size === 1 ? ([...roles][0] ?? null) : null
}

/** "Mixed roles" when Stores differ; otherwise the working role's label. */
export function getStaffWorkingRoleLabel(staff: StaffMemberRow) {
  const role = getStaffWorkingRole(staff)
  return role ? getStaffRoleLabel(role) : "Mixed roles"
}

export type StaffStatusKey =
  | "active"
  | "cancelled"
  | "expired"
  | "invited"
  | "suspended"

/** Active, invited, invite expired or suspended; expiry comes from the pending link. */
export function getStaffStatusKey(
  staff: StaffMemberRow,
  now = Date.now(),
): StaffStatusKey {
  const status = staff.status.trim().toUpperCase()
  if (status === "SUSPENDED") return "suspended"
  if (status !== "INVITED") return "active"
  // Invited with no live link: the invite was cancelled but they are still listed.
  if (staff.access && !staff.access.invitationId) return "cancelled"
  const expiresAt = staff.access?.invitationExpiresAt
  return expiresAt && new Date(expiresAt).getTime() <= now
    ? "expired"
    : "invited"
}

export const staffStatusKeyLabels: Record<StaffStatusKey, string> = {
  active: "Active",
  cancelled: "Invite cancelled",
  expired: "Invite expired",
  invited: "Invited",
  suspended: "Suspended",
}

export type StaffAction =
  | "access"
  | "cancel"
  | "reactivate"
  | "remove"
  | "resend"
  | "suspend"

/** Actions in display order; owners and admins have none here. */
export function getStaffActions(staff: StaffMemberRow): StaffAction[] {
  if (!canUpdateStaffStatus(staff)) return []
  const key = getStaffStatusKey(staff)
  if (key === "active") return ["access", "suspend"]
  // Only people who finished onboarding can be reactivated; people who never
  // joined are removed instead (the seat is freed and they can be invited again).
  if (key === "suspended")
    return staff.acceptedAt ? ["reactivate", "access"] : ["remove"]
  if (key === "cancelled") return ["remove"]
  return ["resend", "cancel"]
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
