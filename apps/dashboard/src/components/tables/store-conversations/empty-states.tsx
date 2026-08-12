"use client"

import { Button } from "@ewatrade/ui"

export function StoreConversationEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
      <h2 className="font-semibold">No conversations match this view</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Try another Store, Request kind, assignment, or SLA filter.
      </p>
    </div>
  )
}

export function StoreConversationErrorState({ retry }: { retry: () => void }) {
  return (
    <div
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
      role="alert"
    >
      <p className="font-medium">Conversations are temporarily unavailable.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Retry the queue. If the problem continues, contact your Store
        administrator.
      </p>
      <Button className="mt-4" onClick={retry} variant="outline">
        Retry
      </Button>
    </div>
  )
}
