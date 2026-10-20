"use client"

import { useQuery } from "@tanstack/react-query"

export type StaffAccessRecord = {
  role: string
  status: string
  staffAccessMode: string
  staffAccessRevision: number
  catalogEditor: boolean
  staffStoreAssignments: Array<{ storeId: string; role: string }>
  retailOpsStaffProfile: { defaultStoreId: string | null } | null
}

export type StaffAccessResponse = {
  access: StaffAccessRecord | null
  stores: Array<{ id: string; name: string }>
  storeAccessReady: boolean
}

export function staffAccessQueryKey(userId: string) {
  return ["dashboard-staff-access", userId] as const
}

/** One person's Store access; Owners and Admins only (null for others). */
export function useStaffAccess(userId: string | null) {
  return useQuery({
    queryKey: staffAccessQueryKey(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/staff?staffUserId=${encodeURIComponent(userId ?? "")}`,
      )
      const result = (await response.json()) as StaffAccessResponse & {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? "Couldn’t load their access.")
      return result
    },
  })
}
