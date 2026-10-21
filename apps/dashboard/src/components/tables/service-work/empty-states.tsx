"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function ServiceWorkEmptyState({ filtered }: { filtered: boolean }) {
  useDashboardEmptyState("service-work")
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <HugeiconsIcon
        icon={ToolsIcon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered ? "No jobs match" : "No jobs here"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Clear the search or filters to see every job."
          : "Jobs show up when an order includes a service you track."}
      </p>
    </div>
  )
}
