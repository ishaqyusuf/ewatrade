"use client"

import type { ServiceWorkOriginalRecord } from "@ewatrade/db/service-work-original"
import { Button } from "@ewatrade/ui"
import type { ReactNode } from "react"

const label = (value: string | null) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Not recorded"
function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}
function StoredTime({
  value,
  timeZone,
}: { value: string | null; timeZone: string }) {
  return value ? (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-NG", { timeZone })}
    </time>
  ) : (
    <>Not recorded</>
  )
}

export function ServiceWorkOriginalContent({
  record: r,
  timeZone,
  onOpenCurrentJob,
}: {
  record: ServiceWorkOriginalRecord
  timeZone: string
  onOpenCurrentJob: () => void
}) {
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3">
        <h3 className="font-medium">
          Original{" "}
          {r.kind === "service_work"
            ? "work event"
            : r.kind === "service_work_note"
              ? "internal note"
              : "exception occurrence"}
        </h3>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2">
          <Fact name="Record reference">
            {r.kind === "service_work"
              ? r.original.eventId
              : r.original.recordId}
          </Fact>
          <Fact name="Job reference">{r.original.jobId}</Fact>
          <Fact name="Line reference">
            {r.original.lineId ?? "Job-level record"}
          </Fact>
          <Fact name="Recorded actor reference">{r.original.actorUserId}</Fact>
          <Fact name="Recorded">
            <StoredTime value={r.original.createdAt} timeZone={timeZone} />
          </Fact>
          {r.kind === "service_work" ? (
            <>
              <Fact name="Event">{label(r.original.type)}</Fact>
              <Fact name="Source">{label(r.original.source)}</Fact>
              <Fact name="Effective">
                <StoredTime
                  value={r.original.effectiveAt}
                  timeZone={timeZone}
                />
              </Fact>
              <Fact name="Before">{label(r.original.beforeStatus)}</Fact>
              <Fact name="After">{label(r.original.afterStatus)}</Fact>
            </>
          ) : r.kind === "service_work_exception" ? (
            <>
              <Fact name="Exception type">{label(r.original.type)}</Fact>
              <Fact name="Occurred">
                <StoredTime value={r.original.occurredAt} timeZone={timeZone} />
              </Fact>
            </>
          ) : null}
        </dl>
        <div className="grid gap-1">
          <p className="font-medium">
            {r.kind === "service_work"
              ? "Original reason"
              : r.kind === "service_work_note"
                ? "Original note"
                : "Original description"}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {r.kind === "service_work"
              ? (r.original.reason ?? "Not recorded")
              : r.kind === "service_work_note"
                ? r.original.body
                : r.original.description}
          </p>
        </div>
        {r.kind === "service_work" ? (
          <>
            {"assignment" in r.original.details &&
            r.original.details.assignment ? (
              <p className="break-words">
                Recorded assignee reference:{" "}
                {r.original.details.assignment.assigneeUserId}
              </p>
            ) : null}
            {"promise" in r.original.details && r.original.details.promise ? (
              <dl className="grid grid-cols-2 gap-2">
                <Fact name="Previous promised time">
                  <StoredTime
                    value={r.original.details.promise.previousPromisedAt}
                    timeZone={timeZone}
                  />
                </Fact>
                <Fact name="Recorded promised time">
                  <StoredTime
                    value={r.original.details.promise.promisedAt}
                    timeZone={timeZone}
                  />
                </Fact>
              </dl>
            ) : null}
            {r.original.details.coverage !== "recorded" ? (
              <p className="text-xs text-muted-foreground">
                {r.original.details.coverage === "unavailable"
                  ? "Original event details are unavailable."
                  : "No additional event details are shown for this event type."}
              </p>
            ) : null}
          </>
        ) : null}
        {r.kind === "service_work_exception" ? (
          <p className="text-xs text-muted-foreground">
            The creation outcome was not saved as an immutable snapshot. The
            current outcome below does not establish the original outcome.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          User references are recorded IDs. Historical display names are
          unavailable. Times shown in {timeZone}.
        </p>
      </section>
      {r.kind === "service_work_exception" ? (
        <section className="grid gap-3 border-t pt-4">
          <h3 className="font-medium">Current exception resolution</h3>
          <dl className="grid grid-cols-2 gap-2">
            <Fact name="Current outcome">
              {label(r.currentException.outcome)}
            </Fact>
            <Fact name="Resolved">
              <StoredTime
                value={r.currentException.resolvedAt}
                timeZone={timeZone}
              />
            </Fact>
            <Fact name="Resolver reference">
              {r.currentException.resolvedByUserId ?? "Not recorded"}
            </Fact>
            <Fact name="Last updated">
              <StoredTime
                value={r.currentException.updatedAt}
                timeZone={timeZone}
              />
            </Fact>
          </dl>
        </section>
      ) : null}
      <section className="grid gap-3 border-t pt-4">
        <h3 className="font-medium">Current Job and line</h3>
        <dl className="grid grid-cols-2 gap-2">
          <Fact name="Job revision">{r.currentJob.revision}</Fact>
          <Fact name="Current assignee reference">
            {r.currentJob.currentAssigneeUserId ?? "Unassigned"}
          </Fact>
          <Fact name="Completed">
            <StoredTime value={r.currentJob.completedAt} timeZone={timeZone} />
          </Fact>
          <Fact name="Cancelled">
            <StoredTime value={r.currentJob.cancelledAt} timeZone={timeZone} />
          </Fact>
          <Fact name="Handed off">
            <StoredTime value={r.currentJob.handedOffAt} timeZone={timeZone} />
          </Fact>
          {r.currentLine ? (
            <>
              <Fact name="Current line status">
                {label(r.currentLine.status)}
              </Fact>
              <Fact name="Line revision">{r.currentLine.revision}</Fact>
            </>
          ) : null}
          <Fact name="Current facts checked">
            <StoredTime value={r.asOf} timeZone={timeZone} />
          </Fact>
        </dl>
        <p className="text-xs text-muted-foreground">
          Current Job and line facts can change after the original record was
          saved.
        </p>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={onOpenCurrentJob}
        >
          Open current Job
        </Button>
      </section>
    </div>
  )
}
