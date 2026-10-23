"use client"
import {
  ServiceStatusSquare,
  serviceStatusChoices,
} from "@/components/service-work/service-status"
import {
  type JobStep,
  type WorkJob,
  formatPrice,
  formatWhen,
  isJobLate,
  jobGate,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import { ArrowDown01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons"
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

export function ServiceWorkStatusMenu({
  job,
  actions,
}: { job: WorkJob; actions: ServiceWorkColumnActions }) {
  const choices = serviceStatusChoices(job)
  const stage = jobStage(job)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={actions.isPending}
            aria-label={`Update status for ${job.orderNumber}`}
            data-row-interactive="true"
            onClick={(event) => event.stopPropagation()}
          >
            <ServiceStatusSquare status={job.summary} />
            {stage.label}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3"
              aria-hidden="true"
            />
          </Button>
        }
      />
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuRadioGroup
          value={job.summary}
          onValueChange={(value) => {
            const choice = choices.find((item) => item.value === value)
            if (!choice?.enabled || !choice.step || value === job.summary)
              return
            if (choice.step === "start" || choice.step === "ready")
              actions.quickStep(job, choice.step)
            else actions.openStep(job.id, choice.step)
          }}
        >
          {choices.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.value}
              value={choice.value}
              disabled={!choice.enabled && choice.value !== job.summary}
            >
              <ServiceStatusSquare status={choice.value} />
              {choice.value === job.summary ? stage.label : choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ServiceWorkRowActions({
  job,
  actions,
}: { job: WorkJob; actions: ServiceWorkColumnActions }) {
  const open = job.summary !== "completed" && job.summary !== "cancelled"
  const gate = jobGate(job)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={actions.isPending}
            aria-label={`Actions for ${job.orderNumber}`}
            data-row-interactive="true"
            onClick={(event) => event.stopPropagation()}
          >
            <HugeiconsIcon
              icon={MoreVerticalIcon}
              className="size-4"
              aria-hidden="true"
            />
          </Button>
        }
      />
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuItem onClick={() => actions.openJob(job.id)}>
          Open job
        </DropdownMenuItem>
        {!job.handedOffAt &&
        ["ready_for_handoff", "completed"].includes(job.summary) ? (
          <DropdownMenuItem
            onClick={() => actions.openStep(job.id, "handover")}
          >
            Hand over to customer
          </DropdownMenuItem>
        ) : null}
        {job.balanceDueMinor > 0 ? (
          <DropdownMenuItem onClick={() => actions.openStep(job.id, "pay")}>
            Take payment
          </DropdownMenuItem>
        ) : null}
        {open &&
        actions.canManage &&
        (gate === "PENDING_RELEASE" || gate === "REVOKED") ? (
          <DropdownMenuItem onClick={() => actions.openStep(job.id, "approve")}>
            Approve start
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => actions.openStep(job.id, "note")}>
          Add a note
        </DropdownMenuItem>
        {open ? (
          <>
            <DropdownMenuItem
              onClick={() => actions.openStep(job.id, "problem")}
            >
              Report a problem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.openStep(job.id, "photo")}>
              Add a photo
            </DropdownMenuItem>
          </>
        ) : null}
        {actions.canManage ? (
          <>
            {open ? (
              <>
                <DropdownMenuItem
                  onClick={() => actions.openStep(job.id, "assign")}
                >
                  Change who is doing it
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => actions.openStep(job.id, "due")}
                >
                  Change due date
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem
              onClick={() => actions.openStep(job.id, "message")}
            >
              Message customer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.openStep(job.id, "track")}>
              Tracking link
            </DropdownMenuItem>
            {open ? (
              <DropdownMenuItem
                onClick={() => actions.openStep(job.id, "cancel")}
              >
                Cancel work
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
      cell: ({ row }) => (
        <ServiceWorkStatusMenu job={row.original} actions={actions} />
      ),
    },
    {
      id: "actions",
      size: 80,
      minSize: 72,
      maxSize: 120,
      enableHiding: false,
      meta: { headerLabel: "Actions", skeleton: { type: "text" } },
      cell: ({ row }) => (
        <ServiceWorkRowActions job={row.original} actions={actions} />
      ),
    },
  ]
}
