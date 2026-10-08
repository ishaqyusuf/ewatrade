"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  InlineRowCheckbox,
  InlineSelectionBar,
  useInlineSelection,
} from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import { useMemo } from "react"

export type PeriodAuditEvent = {
  id: string
  kind: string
  actorUserId: string
  createdAt: string | Date
  result: unknown
}

function auditText(result: unknown) {
  if (!result || typeof result !== "object" || !("audit" in result)) return null
  const audit = result.audit
  if (!audit || typeof audit !== "object") return null
  return {
    reason:
      "reason" in audit && typeof audit.reason === "string" ? audit.reason : "",
    through:
      "endsAt" in audit &&
      typeof audit.endsAt === "string" &&
      Number.isFinite(new Date(audit.endsAt).getTime())
        ? audit.endsAt.slice(0, 10)
        : "",
    snapshot:
      "snapshotSequence" in audit && typeof audit.snapshotSequence === "string"
        ? audit.snapshotSequence
        : "",
  }
}

export function FinancePeriodAuditView({
  events,
  pending,
  error,
  fetching,
  hasNextPage,
  onLoadOlder,
  onRefresh,
  scope,
}: {
  /** Selection resets when this changes, e.g. the Book. */
  scope: string
  events: readonly PeriodAuditEvent[]
  pending: boolean
  error: string | null
  fetching: boolean
  hasNextPage: boolean
  onLoadOlder: () => void
  onRefresh: () => void
}) {
  const eventIds = useMemo(() => events.map((event) => event.id), [events])
  const selection = useInlineSelection({ ids: eventIds, scope })
  if (pending) return <output>Loading close/reopen history…</output>
  if (error) {
    return (
      <div className="grid gap-3 pt-3">
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
        <Button
          appearance="form"
          variant="outline"
          disabled={fetching}
          onClick={onRefresh}
        >
          {fetching ? "Retrying…" : "Try again"}
        </Button>
      </div>
    )
  }
  return (
    <div className="grid gap-3 pt-3">
      {events.length ? (
        <div className="grid gap-1">
          <InlineSelectionBar
            label="Select all loaded close/reopen changes"
            selection={selection}
          />
          <ol className="divide-y divide-border">
            {events.map((event) => {
              const audit = auditText(event.result)
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 py-3 text-sm"
                  data-state={
                    selection.isSelected(event.id) ? "selected" : undefined
                  }
                >
                  <span className="pt-0.5">
                    <InlineRowCheckbox
                      selection={selection}
                      id={event.id}
                      label={`Select ${event.kind === "PERIOD_CLOSE" ? "close" : "reopen"} through ${audit?.through || "unknown date"}`}
                    />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="font-medium">
                      {event.kind === "PERIOD_CLOSE" ? "Closed" : "Reopened"}{" "}
                      period through {audit?.through || "unknown date"}
                    </p>
                    <p className="break-words">
                      {audit?.reason || "No recorded reason"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded {new Date(event.createdAt).toISOString()} ·
                      Snapshot {audit?.snapshot || "unknown"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      Actor: {event.actorUserId}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No close/reopen changes recorded yet.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {events.length} changes loaded{hasNextPage ? "" : " · End of history"}
        </p>
        <div className="flex flex-wrap gap-2">
          {hasNextPage ? (
            <Button
              appearance="form"
              variant="outline"
              size="sm"
              disabled={fetching}
              onClick={onLoadOlder}
            >
              {fetching ? "Loading…" : "Load older changes"}
            </Button>
          ) : null}
          <Button
            appearance="form"
            variant="outline"
            size="sm"
            disabled={fetching}
            onClick={onRefresh}
          >
            Refresh history
          </Button>
        </div>
      </div>
    </div>
  )
}
