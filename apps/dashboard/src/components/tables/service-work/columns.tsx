"use client"
import {
  type JobStep,
  type WorkJob,
  formatPrice,
  formatWhen,
  isJobLate,
  jobNextStep,
  jobStage,
  jobWhat,
  toneClass,
} from "@/components/service-work/service-utils"
import { selectColumn } from "@/components/tables/core"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import { MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table"

export type ServiceWorkColumnActions = {
  assigneeName: (userId: string | null) => string | null
  canManage: boolean
  isPending: boolean
  openJob: (jobId: string) => void
  openStep: (jobId: string, step: JobStep) => void
  quickStep: (job: WorkJob, step: "start" | "ready") => void
  timeZone: string
}

/** Who is doing it, in words: a name for managers, otherwise Assigned / Not assigned. */
export function getServiceWorkAssignment(
  job: WorkJob,
  assigneeName?: (userId: string | null) => string | null,
) {
  if (!job.currentAssigneeUserId) return "Not assigned"
  return assigneeName?.(job.currentAssigneeUserId) ?? "Assigned"
}

export function ServiceWorkStatusBadge({ job }: { job: WorkJob }) {
  const stage = jobStage(job)
  return (
    <Badge className={cn("rounded-full", toneClass(stage.tone))}>
      {stage.label}
    </Badge>
  )
}

export function ServiceWorkDue({
  job,
  timeZone,
}: {
  job: WorkJob
  timeZone: string
}) {
  const late = isJobLate(job)
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          !job.dueCommitmentAt && "text-muted-foreground",
          late && "font-medium text-destructive",
        )}
      >
        {formatWhen(job.dueCommitmentAt, timeZone)}
      </span>
      {late ? (
        <span className="border border-destructive px-1 text-[11px] font-semibold text-destructive">
          Late
        </span>
      ) : null}
      {job.priority === "urgent" ? (
        <span className="text-[11px] font-semibold tracking-wide text-warning-foreground uppercase">
          Urgent
        </span>
      ) : null}
    </span>
  )
}

export function ServiceWorkMoney({ job }: { job: WorkJob }) {
  if (job.balanceDueMinor > 0)
    return (
      <span>
        <span className="font-medium tabular-nums">
          {formatPrice(job.balanceDueMinor, job.currencyCode)}
        </span>{" "}
        <span className="text-muted-foreground">to pay</span>
      </span>
    )
  return <span className="text-muted-foreground">Paid</span>
}

export function ServiceWorkRowActions({
  job,
  actions,
}: {
  job: WorkJob
  actions: ServiceWorkColumnActions
}) {
  const next = jobNextStep(job, actions.canManage)
  const open = job.summary !== "completed" && job.summary !== "cancelled"
  return (
    <div className="flex items-center justify-end gap-1">
      {next ? (
        <Button
          size="sm"
          variant="outline"
          disabled={actions.isPending}
          data-row-interactive="true"
          onClick={(event) => {
            event.stopPropagation()
            if (next.action === "start" || next.action === "ready")
              actions.quickStep(job, next.action)
            else actions.openStep(job.id, next.action)
          }}
        >
          {next.label}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${job.orderNumber}`}
              data-row-interactive="true"
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuItem onClick={() => actions.openJob(job.id)}>
            Open job
          </DropdownMenuItem>
          {open && actions.canManage ? (
            <>
              <DropdownMenuItem
                onClick={() => actions.openStep(job.id, "assign")}
              >
                Change who is doing it
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.openStep(job.id, "due")}>
                Change due date
              </DropdownMenuItem>
            </>
          ) : null}
          {open ? (
            <DropdownMenuItem onClick={() => actions.openStep(job.id, "note")}>
              Add a note
            </DropdownMenuItem>
          ) : null}
          {job.balanceDueMinor > 0 ? (
            <DropdownMenuItem onClick={() => actions.openStep(job.id, "pay")}>
              Take payment
            </DropdownMenuItem>
          ) : null}
          {actions.canManage ? (
            <DropdownMenuItem
              onClick={() => actions.openStep(job.id, "message")}
            >
              Message the customer
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function createServiceWorkColumns(
  actions: ServiceWorkColumnActions,
): ColumnDef<WorkJob>[] {
  return [
    selectColumn((job) => `job ${job.orderNumber}`),
    {
      id: "order",
      size: 210,
      minSize: 160,
      maxSize: 380,
      enableHiding: false,
      meta: {
        headerLabel: "Job",
        sticky: true,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60",
        reorderable: false,
        skeleton: { type: "text" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline"
            onClick={() => actions.openJob(row.original.id)}
          >
            {row.original.customerName || "Walk-in customer"}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.orderNumber}
          </p>
        </div>
      ),
    },
    {
      id: "work",
      size: 190,
      minSize: 140,
      maxSize: 400,
      meta: { headerLabel: "Service", skeleton: { type: "text" } },
      cell: ({ row }) => (
        <span className="line-clamp-2">{jobWhat(row.original)}</span>
      ),
    },
    {
      id: "assignment",
      size: 130,
      minSize: 100,
      maxSize: 240,
      meta: {
        headerLabel: "Who",
        sortField: "priority",
        skeleton: { type: "text" },
      },
      cell: ({ row }) => {
        const who = getServiceWorkAssignment(row.original, actions.assigneeName)
        return (
          <span
            className={cn(
              !row.original.currentAssigneeUserId && "text-muted-foreground",
            )}
          >
            {who}
          </span>
        )
      },
    },
    {
      id: "due",
      size: 160,
      minSize: 130,
      maxSize: 300,
      meta: { headerLabel: "Due", skeleton: { type: "text" } },
      cell: ({ row }) => (
        <ServiceWorkDue job={row.original} timeZone={actions.timeZone} />
      ),
    },
    {
      id: "money",
      size: 120,
      minSize: 100,
      maxSize: 220,
      meta: { headerLabel: "Money", skeleton: { type: "text" } },
      cell: ({ row }) => <ServiceWorkMoney job={row.original} />,
    },
    {
      id: "status",
      size: 150,
      minSize: 130,
      maxSize: 240,
      meta: { headerLabel: "Status", skeleton: { type: "badge" } },
      cell: ({ row }) => <ServiceWorkStatusBadge job={row.original} />,
    },
    {
      id: "actions",
      size: 170,
      minSize: 160,
      maxSize: 240,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        className: "z-20 bg-background group-hover:bg-muted/40",
        reorderable: false,
        skeleton: { type: "icon" },
      },
      cell: ({ row }) => (
        <ServiceWorkRowActions job={row.original} actions={actions} />
      ),
    },
  ]
}
