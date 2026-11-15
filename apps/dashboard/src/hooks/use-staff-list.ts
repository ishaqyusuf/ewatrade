"use client"

import type { StaffMemberRow } from "@/lib/staff-management"
import { useQuery } from "@tanstack/react-query"

/** Every Staff page list; sheets invalidate it after a change. */
export const STAFF_LIST_QUERY_KEY = ["dashboard-staff"] as const

async function fetchStaff() {
  const response = await fetch("/api/staff")
  const result = (await response.json()) as {
    staff?: StaffMemberRow[]
    error?: string
  }
  if (!response.ok || !result.staff)
    throw new Error(result.error ?? "Couldn’t load staff. Try again.")
  return result.staff
}

/**
 * The whole business's staff, loaded once with the page. Search and status
 * filter it on the page, so typing reads nothing.
 */
export function useStaffList(initial: StaffMemberRow[]) {
  return useQuery({
    queryKey: STAFF_LIST_QUERY_KEY,
    queryFn: fetchStaff,
    initialData: initial,
    staleTime: 30_000,
  })
}
