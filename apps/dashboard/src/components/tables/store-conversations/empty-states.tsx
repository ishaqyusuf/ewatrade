"use client"

import { Button } from "@ewatrade/ui"
import Link from "next/link"

export function StoreConversationEmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean
  onClearFilters: () => void
}) {
  return (
    <section className="grid justify-items-center gap-2 rounded-none border border-dashed border-border bg-background p-10 text-center">
      <h2 className="font-semibold">
        {filtered
          ? "No conversations match these filters"
          : "No conversations in this queue"}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Clear the filters or choose another Store to see more conversations."
          : "New customer conversations will appear here when they reach this Store."}
      </p>
      {filtered ? (
        <Button
          className="mt-2"
          onClick={onClearFilters}
          type="button"
          variant="outline"
          appearance="form"
        >
          Clear filters
        </Button>
      ) : null}
    </section>
  )
}

export function StoreConversationAccessState() {
  return (
    <section
      className="grid justify-items-center gap-3 rounded-none border border-border bg-background p-8 text-center"
      role="alert"
    >
      <h2 className="font-semibold">Active Store attendant access required</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An active Store attendant assignment is required to access
        conversations. Ask an Owner or Admin to assign you in Customer channels.
      </p>
      <Button
        className="mt-1"
        render={<Link href="/settings/channels" />}
        appearance="form"
      >
        Open Customer channels
      </Button>
    </section>
  )
}

export function StoreConversationErrorState({ retry }: { retry: () => void }) {
  return (
    <div
      className="rounded-none border border-destructive/30 bg-destructive/5 p-5"
      role="alert"
    >
      <p className="font-medium">Conversations are temporarily unavailable.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Retry the queue. If the problem continues, contact your Store
        administrator.
      </p>
      <Button
        className="mt-4"
        onClick={retry}
        variant="outline"
        appearance="form"
      >
        Retry
      </Button>
    </div>
  )
}
