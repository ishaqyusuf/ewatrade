"use client"
import {
  useDashboardEmptyState,
  useDashboardWorkflow,
} from "@ewatrade/events/dashboard-client"

import { Button } from "@ewatrade/ui"
import Link from "next/link"

export function StoreConversationEmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean
  onClearFilters: () => void
}) {
  useDashboardEmptyState("conversations")
  return (
    <section className="grid justify-items-center gap-2 rounded-[var(--ui-radius-surface)] border border-dashed border-border bg-card p-10 text-center">
      <h2 className="font-semibold">
        {filtered ? "Nothing here" : "No conversations yet"}
      </h2>
      {filtered ? null : (
        <p className="max-w-md text-sm text-muted-foreground">
          Customer chats show here.
        </p>
      )}
      {filtered ? (
        <Button
          className="mt-2"
          onClick={onClearFilters}
          type="button"
          variant="outline"
        >
          Show all
        </Button>
      ) : null}
    </section>
  )
}

export function StoreConversationAccessState() {
  return (
    <section
      className="grid justify-items-center gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-8 text-center"
      role="alert"
    >
      <h2 className="font-semibold">You don’t answer chats for this store</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An owner can add you in Customer channels.
      </p>
      <Button
        className="mt-1"
        variant="outline"
        render={<Link href="/settings/channels" />}
      >
        Customer channels
      </Button>
    </section>
  )
}

export function StoreConversationErrorState({ retry }: { retry: () => void }) {
  const workflow = useDashboardWorkflow()
  return (
    <div
      className="rounded-[var(--ui-radius-surface)] border border-destructive/30 bg-destructive/5 p-5"
      role="alert"
    >
      <p className="font-medium">Couldn’t load conversations.</p>
      <Button
        className="mt-4"
        onClick={() => {
          workflow.track("retry", "started", { channel: "conversations" })
          retry()
        }}
        variant="outline"
      >
        Try again
      </Button>
    </div>
  )
}
