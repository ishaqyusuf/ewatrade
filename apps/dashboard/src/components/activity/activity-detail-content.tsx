"use client"

import type {
  BusinessActivityDetail,
  BusinessActivityView,
} from "@ewatrade/notifications/business-events"
import { cn } from "@ewatrade/ui"
import { HelpCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import {
  ACTIVITY_CATEGORY_LABELS,
  activityStatusTone,
  formatActivityDateTime,
  formatActivityStatus,
  recordedThroughAssistant,
  wasRecordedLater,
} from "./activity-format"
import { ActivityAmount, AssistantFlag } from "./activity-row"

const ORIGIN_LABELS: Record<
  NonNullable<BusinessActivityView["origin"]>["channel"],
  string
> = {
  dashboard: "Dashboard",
  pos: "Point of sale",
  online: "Online store",
  native: "Mobile app",
  assistant: "Assistant",
  system: "EwaTrade",
  import: "Import",
  unknown: "Not recorded",
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b py-2.5 text-sm max-sm:grid-cols-[96px_1fr]">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function ActivityDetailContent({
  detail,
  timeZone,
  onOpenRelated,
}: {
  detail: BusinessActivityDetail
  timeZone: string
  onOpenRelated: (key: string) => void
}) {
  const { event, changes, relatedEvents } = detail
  const atEvent = event.statusAtEvent?.value
  const now = event.currentStatus?.value
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {ACTIVITY_CATEGORY_LABELS[event.category]}
        {event.store?.name ? ` · ${event.store.name}` : ""}
      </p>
      {event.amount ? (
        <p className="text-2xl">
          <ActivityAmount event={event} />
        </p>
      ) : null}
      {event.actor.coverage !== "recorded" ? (
        <p className="flex items-start gap-2 border bg-muted px-3 py-2.5 text-[13px]">
          <HugeiconsIcon icon={HelpCircleIcon} className="mt-0.5 size-4" />
          {event.coverage === "legacy_fact"
            ? "Recorded before Activity tracking started. Who recorded it wasn't captured, so EwaTrade doesn't guess."
            : "Who recorded this wasn't captured, so EwaTrade doesn't guess."}
        </p>
      ) : null}
      <dl className="border-t">
        <Field label="Happened">
          {formatActivityDateTime(event.occurredAt, timeZone)}
        </Field>
        {wasRecordedLater(event, timeZone) ? (
          <Field label="Recorded">
            {formatActivityDateTime(event.recordedAt, timeZone)}
            <span className="block text-muted-foreground">
              Entered later with an earlier date
            </span>
          </Field>
        ) : null}
        <Field label="Person">
          {event.actor.coverage === "recorded" && event.actor.name ? (
            event.actor.name
          ) : (
            <span className="italic text-muted-foreground">Unknown person</span>
          )}
        </Field>
        {event.detail ? <Field label="Details">{event.detail}</Field> : null}
        {atEvent || now ? (
          <Field label="Status">
            {atEvent ? (
              <span className="block">
                <span className="bg-secondary px-1.5 text-xs">
                  {formatActivityStatus(atEvent)}
                </span>{" "}
                <span className="text-muted-foreground">when recorded</span>
              </span>
            ) : null}
            {now && now !== atEvent ? (
              <span className="mt-1 block">
                <span
                  className={cn(
                    "px-1.5 text-xs",
                    activityStatusTone(now) === "negative"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                  )}
                >
                  {formatActivityStatus(now)}
                </span>{" "}
                <span className="text-muted-foreground">now</span>
              </span>
            ) : null}
          </Field>
        ) : null}
        {event.origin ? (
          <Field label="Recorded in">
            {recordedThroughAssistant(event) ? (
              <>
                <AssistantFlag />
                <span className="mt-1 block text-muted-foreground">
                  Prepared by the Assistant and confirmed by{" "}
                  {event.actor.name ?? "a team member"}.
                </span>
              </>
            ) : (
              ORIGIN_LABELS[event.origin.channel]
            )}
          </Field>
        ) : null}
        {relatedEvents.map((related) => (
          <Field key={related.key} label="Related">
            <button
              type="button"
              className="text-left underline underline-offset-3"
              onClick={() => onOpenRelated(related.key)}
            >
              {related.label}
            </button>
          </Field>
        ))}
      </dl>
      {changes.length ? (
        <section aria-labelledby="activity-changes" className="grid gap-2">
          <h3 id="activity-changes" className="text-sm font-medium">
            What changed
          </h3>
          <dl className="border-t">
            {changes.map((change) => (
              <Field key={change.label} label={change.label}>
                <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                  {change.before ?? "Not set"}
                </span>
                {" → "}
                {change.after ?? "Not set"}
              </Field>
            ))}
          </dl>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Activity is a read-only history. Changes happen on the original record.
      </p>
    </div>
  )
}
