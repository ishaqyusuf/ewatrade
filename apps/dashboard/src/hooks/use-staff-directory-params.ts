"use client"

import { staffDirectoryParams } from "@/hooks/staff-directory-params"
import type { StaffStatusFilter } from "@/lib/staff-management"
import { useQueryStates } from "nuqs"

export function useStaffDirectoryParams() {
  const [params, updateParams] = useQueryStates(staffDirectoryParams)

  return {
    staffQuery: params.staffQuery,
    staffStatus: params.staffStatus,
    setParams: (values: {
      staffQuery?: string | null
      staffStatus?: StaffStatusFilter | null
    }) => updateParams(values, { history: "replace", shallow: true }),
  }
}
