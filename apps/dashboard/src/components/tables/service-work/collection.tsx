"use client"

import {
  type WorkJob,
  formatPrice,
  formatWhen,
  isJobLate,
  jobWhat,
} from "@/components/service-work/service-utils"
import type { CollectionView } from "@/components/tables/core"
import { cn } from "@/utils"
import type { Row } from "@tanstack/react-table"
import type { MouseEvent } from "react"
import {
  type ServiceWorkColumnActions,
  ServiceWorkRowActions,
  ServiceWorkStatusMenu,
  getServiceWorkAssignment,
} from "./columns"

type CollectionProps = {
  rows: Row<WorkJob>[]
  timeZone: string
  actions: ServiceWorkColumnActions
}

/** Opens the job unless the tap landed on a control (name, status or actions menu). */
function rowOpenHandlers(job: WorkJob, actions: ServiceWorkColumnActions) {
  return {
    onClick: (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest("button,a,[role=menuitem],[data-row-interactive]"))
        return
      actions.openJob(job.id)
    },
  }
}

/** "₦8,000 due" or "Paid". */
function moneyText(job: WorkJob) {
  return job.balanceDueMinor > 0
    ? `${formatPrice(job.balanceDueMinor, job.currencyCode)} due`
    : "Paid"
}

function DueText({ job, timeZone }: { job: WorkJob; timeZone: string }) {
  const finished = job.summary === "completed" || job.summary === "cancelled"
  if (finished || (!job.dueCommitmentAt && job.priority !== "urgent"))
    return null
  const late = isJobLate(job)
  return (
    <span className="inline-flex items-center gap-1.5">
      {job.dueCommitmentAt ? (
        <span className={cn(late && "font-medium text-danger-foreground")}>
          {late ? "Late · " : "Due "}
          {formatWhen(job.dueCommitmentAt, timeZone)}
        </span>
      ) : null}
      {job.priority === "urgent" ? (
        <span className="rounded-full bg-warning px-2 text-xs font-medium text-warning-foreground">
          Urgent
        </span>
      ) : null}
    </span>
  )
}

/**
 * One row per job: who it is for and what, then its status (the status menu
 * moves it on) and what is still to pay. Tapping the row opens the job.
 */
function ServiceWorkList({ rows, timeZone, actions }: CollectionProps) {
  return (
    <ul
      aria-label="Service jobs"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {rows.map((row) => {
        const job = row.original
        const who =
          actions.canManage && job.currentAssigneeUserId
            ? getServiceWorkAssignment(job, actions.assigneeName)
            : null
        return (
          <li
            key={row.id}
            {...rowOpenHandlers(job, actions)}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 py-3 pr-1 pl-4 hover:bg-[var(--hover)]"
          >
            <div className="grid min-w-0 gap-1">
              <button
                type="button"
                className="block max-w-full truncate text-left text-base font-medium"
                onClick={() => actions.openJob(job.id)}
              >
                {job.customerName || "Walk-in customer"}
              </button>
              <span className="truncate text-sm text-muted-foreground">
                {[job.orderNumber, jobWhat(job), who]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <ServiceWorkStatusMenu job={job} actions={actions} />
                <span
                  className={cn(
                    "tabular-nums",
                    job.balanceDueMinor > 0
                      ? "font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {moneyText(job)}
                </span>
                <DueText job={job} timeZone={timeZone} />
              </div>
            </div>
            <ServiceWorkRowActions job={job} actions={actions} />
          </li>
        )
      })}
    </ul>
  )
}

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function ServiceWorkGrid({ rows, timeZone, actions }: CollectionProps) {
  return (
    <ul
      aria-label="Service jobs"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const job = row.original
        return (
          <li key={row.id} className="min-w-0">
            <article
              {...rowOpenHandlers(job, actions)}
              className="flex h-full cursor-pointer flex-col gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 hover:bg-[var(--hover)]"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="grid min-w-0">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-base font-medium"
                    onClick={() => actions.openJob(job.id)}
                  >
                    {job.customerName || "Walk-in customer"}
                  </button>
                  <span className="truncate text-sm text-muted-foreground">
                    {job.orderNumber} · {jobWhat(job)}
                  </span>
                </div>
                <ServiceWorkRowActions job={job} actions={actions} />
              </div>
              <div>
                <ServiceWorkStatusMenu job={job} actions={actions} />
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Money</dt>
                  <dd className="truncate tabular-nums">{moneyText(job)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="truncate">
                    {formatWhen(job.dueCommitmentAt, timeZone)}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

export function ServiceWorkCollection({
  view,
  ...props
}: CollectionProps & { view: CollectionView }) {
  return view === "cards" ? (
    <ServiceWorkGrid {...props} />
  ) : (
    <ServiceWorkList {...props} />
  )
}
