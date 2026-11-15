"use client"

import { Button } from "@ewatrade/ui"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

/** Search and filters, then one Refresh button; the top bar names the page. */
export function ActivityHeader({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1 md:max-w-xl">{children}</div>
      <Button
        variant="outline"
        size="icon"
        aria-label="Refresh activity"
        title="Refresh"
        disabled={refreshing}
        onClick={onRefresh}
        className="ml-auto shrink-0"
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          className={
            refreshing
              ? "size-5 animate-spin motion-reduce:animate-none"
              : "size-5"
          }
        />
      </Button>
    </div>
  )
}
