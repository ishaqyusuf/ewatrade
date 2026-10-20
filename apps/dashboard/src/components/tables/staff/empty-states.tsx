"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ewatrade/ui"

export function StaffEmptyState() {
  useDashboardEmptyState("staff")
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No staff found</EmptyTitle>
        <EmptyDescription>
          Invite a staff member or adjust the current filters.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
