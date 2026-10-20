"use client"

import type { StaffMemberRow, StaffRoleFilter } from "@/lib/staff-management"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

/** Every Staff page list; sheets invalidate it after a change. */
export const STAFF_LIST_QUERY_KEY = ["dashboard-staff"] as const

async function fetchStaff(search: string, role: StaffRoleFilter) {
  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (role !== "all") params.set("role", role)
  const response = await fetch(`/api/staff?${params.toString()}`)
  const result = (await response.json()) as {
    staff?: StaffMemberRow[]
    error?: string
  }
  if (!response.ok || !result.staff)
    throw new Error(result.error ?? "Couldn’t load staff. Try again.")
  return result.staff
}

/** Staff for the search and role filters; status is filtered on the page. */
export function useStaffList({
  search,
  role,
  initial,
}: {
  search: string
  role: StaffRoleFilter
  initial: { search: string; role: StaffRoleFilter; staff: StaffMemberRow[] }
}) {
  const term = search.trim()
  const isInitial = term === initial.search.trim() && role === initial.role
  return useQuery({
    queryKey: [...STAFF_LIST_QUERY_KEY, term, role],
    queryFn: () => fetchStaff(term, role),
    initialData: isInitial ? initial.staff : undefined,
    placeholderData: keepPreviousData,
  })
}
