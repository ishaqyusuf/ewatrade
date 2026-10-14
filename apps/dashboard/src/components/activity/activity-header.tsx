"use client"

import type { BusinessActivityFilterOptions } from "@ewatrade/notifications/business-events"
import { Button } from "@ewatrade/ui"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const SCOPE_COPY: Record<BusinessActivityFilterOptions["scope"], string> = {
  business: "Everything recorded in this Business that you can see.",
  stores: "Activity in the Stores you can access.",
  own: "Records your role can open.",
}

export function ActivityHeader({
  scope,
  refreshing,
  onRefresh,
}: {
  scope: BusinessActivityFilterOptions["scope"] | null
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope ? SCOPE_COPY[scope] : "What happened, newest first."}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Refresh activity"
        title="Refresh"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          className={
            refreshing
              ? "size-4 animate-spin motion-reduce:animate-none"
              : "size-4"
          }
        />
      </Button>
    </div>
  )
}
