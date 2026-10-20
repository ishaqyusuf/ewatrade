"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@ewatrade/ui"

export function StaffEmptyState({ filtered }: { filtered: boolean }) {
  useDashboardEmptyState("staff")
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>
          {filtered ? "No staff match your search" : "No staff yet"}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Try another name or clear the filters."
            : "Invite your first cashier or sales rep."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
