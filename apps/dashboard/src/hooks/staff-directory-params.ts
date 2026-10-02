import type { StaffRoleFilter, StaffStatusFilter } from "@/lib/staff-management"
import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const staffDirectoryParams = {
  staffQuery: parseAsString.withDefault(""),
  staffRole: parseAsStringEnum<StaffRoleFilter>([
    "admin",
    "all",
    "cashier",
    "manager",
    "operator",
    "owner",
  ]).withDefault("all"),
  staffStatus: parseAsStringEnum<StaffStatusFilter>([
    "active",
    "all",
    "invited",
    "suspended",
  ]).withDefault("all"),
}

const loadStaffDirectoryState = createLoader(staffDirectoryParams)

export async function loadStaffDirectoryParams(
  searchParams: Parameters<typeof loadStaffDirectoryState>[0],
) {
  const params = await loadStaffDirectoryState(searchParams)
  return {
    staffQuery: params.staffQuery,
    staffRole: params.staffRole,
    staffStatus: params.staffStatus,
  }
}
