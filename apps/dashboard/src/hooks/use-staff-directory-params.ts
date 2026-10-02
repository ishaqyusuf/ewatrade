"use client"

import { staffDirectoryParams } from "@/hooks/staff-directory-params"
import type { StaffRoleFilter, StaffStatusFilter } from "@/lib/staff-management"
import { useQueryStates } from "nuqs"

export function useStaffDirectoryParams() {
  const [params, updateParams] = useQueryStates(staffDirectoryParams)

  return {
    staffQuery: params.staffQuery,
    staffRole: params.staffRole,
    staffStatus: params.staffStatus,
    setParams: (values: {
      staffQuery?: string | null
      staffRole?: StaffRoleFilter | null
      staffStatus?: StaffStatusFilter | null
    }) => updateParams(values, { history: "push", shallow: true }),
    clearFilters: () =>
      updateParams(
        { staffQuery: null, staffRole: null, staffStatus: null },
        { history: "push", shallow: true },
      ),
  }
}
