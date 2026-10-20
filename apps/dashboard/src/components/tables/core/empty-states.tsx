"use client"
import {
  useDashboardEmptyState,
  useDashboardWorkflow,
} from "@ewatrade/events/dashboard-client"

import { Button } from "@ewatrade/ui"
import type { ReactNode } from "react"

export interface EmptyStateProps {
  title: string
  description: ReactNode
  actionLabel: string
  onAction: () => void
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  useDashboardEmptyState("directory")
  const workflow = useDashboardWorkflow()
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex max-w-lg flex-col items-center">
        <div className="mb-6 space-y-2 text-center">
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            workflow.track("empty_state", "started")
            onAction()
          }}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="No results"
      description="Try another search or adjust the filters."
      actionLabel="Clear filters"
      onAction={onClear}
    />
  )
}
