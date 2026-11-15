import type { StaffStatusFilter } from "@/lib/staff-management"
import { parseAsString, parseAsStringEnum } from "nuqs/server"

/** Search and status filter the loaded Staff list on the page. */
export const staffDirectoryParams = {
  staffQuery: parseAsString.withDefault(""),
  staffStatus: parseAsStringEnum<StaffStatusFilter>([
    "active",
    "all",
    "invited",
    "suspended",
  ]).withDefault("all"),
}
