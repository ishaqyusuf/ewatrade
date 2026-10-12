"use client"

import { Button } from "@ewatrade/ui"
import { useState } from "react"
import {
  type StaffAccessWorkload,
  staffAccessWorkloadJob,
  staffAccessWorkloadState,
  staffAccessWorkloadTimeValid,
} from "./staff-access-workload-state"

function ObservedTime({ value }: { value: string }) {
  if (!staffAccessWorkloadTimeValid(value)) return <>Unavailable</>
  return (
    <time dateTime={value}>
      {new Date(value).toISOString().replace("T", " ").replace("Z", " UTC")}
    </time>
  )
}

export function StaffAccessWorkloadView({
  workload,
  membershipId,
  disabled = false,
}: {
  workload: StaffAccessWorkload
  membershipId: string
  disabled?: boolean
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (staffAccessWorkloadState(workload, membershipId) !== "ready")
    return (
      <section
        aria-label="Assigned Service work"
        className="grid gap-2 border-t pt-3"
      >
        <h3 className="font-medium">Assigned Service work</h3>
        <p role="alert">
          Current assigned work is unavailable in this review. Save and review
          again before changing access.
        </p>
      </section>
    )
  const selected = staffAccessWorkloadJob(workload, membershipId, selectedId)
  return (
    <section
      aria-label="Assigned Service work"
      className="grid gap-3 border-t pt-3"
    >
      <h3 className="font-medium">Assigned Service work</h3>
      <p>
        <strong>
          {workload.count} outstanding {workload.count === 1 ? "Job" : "Jobs"}
        </strong>{" "}
        currently assigned. Showing {workload.shown} of {workload.count}.
      </p>
      <p className="text-xs text-muted-foreground">
        {workload.scope === "all_business_stores_current_assignee"
          ? "Across all business Stores, including archived Stores."
          : "At the reviewed Store."}{" "}
        Checked <ObservedTime value={workload.asOf} />.
      </p>
      {workload.count === 0 ? (
        <p>No outstanding Jobs currently assigned.</p>
      ) : (
        <ul className="grid gap-2">
          {workload.jobs.map((job) => (
            <li key={job.jobId} className="grid gap-1 rounded-md border p-3">
              <p className="font-medium">Assigned Job</p>
              <p className="break-words">
                {job.storeName} · {job.storeStatus.toLowerCase()}
              </p>
              <p className="text-xs text-muted-foreground">
                Created <ObservedTime value={job.createdAt} /> ·{" "}
                {job.priority.toLowerCase()}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={disabled}
                aria-expanded={selected?.jobId === job.jobId}
                onClick={() =>
                  setSelectedId(
                    selected?.jobId === job.jobId ? null : job.jobId,
                  )
                }
              >
                {selected?.jobId === job.jobId
                  ? "Close Job review"
                  : "Review assigned Job"}
              </Button>
              {selected?.jobId === job.jobId ? (
                <StaffAccessWorkloadDetail job={selected} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {workload.hasMore ? (
        <p className="text-xs text-muted-foreground">
          Only the first {workload.shown} Jobs are listed. The complete total
          includes the remaining {workload.count - workload.shown} Jobs.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Current assignment does not show performed work or historical sales.
        Changing Store access does not transfer or reassign these Jobs.
      </p>
      <p className="text-xs text-muted-foreground">
        Job review stays inline to keep your unsaved access draft. Opening the
        full Job over this draft is not available here yet. Save and review your
        draft before using the full Job view.
      </p>
    </section>
  )
}

export function StaffAccessWorkloadDetail({
  job,
}: { job: StaffAccessWorkload["jobs"][number] }) {
  return (
    <div
      className="grid gap-2 border-t pt-2"
      aria-label="Assigned Job review details"
    >
      <dl className="grid grid-cols-2 gap-2">
        <dt>Job revision at review</dt>
        <dd>{job.revision}</dd>
        <dt>Priority</dt>
        <dd>{job.priority.toLowerCase().replaceAll("_", " ")}</dd>
        <dt>Created</dt>
        <dd>
          <ObservedTime value={job.createdAt} />
        </dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        This Job is currently assigned to the person whose access you are
        editing and has at least one line that is neither completed nor
        cancelled. These are review snapshot facts.
      </p>
    </div>
  )
}
