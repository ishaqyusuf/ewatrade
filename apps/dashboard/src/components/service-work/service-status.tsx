import { cn } from "@ewatrade/ui"
import { type JobStep, type WorkJob, jobGate } from "./service-utils"

const COLORS = {
  queued: "bg-slate-400",
  in_progress: "bg-sky-500",
  partially_ready: "bg-cyan-500",
  blocked: "bg-amber-500",
  ready_for_handoff: "bg-violet-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
  all: "bg-foreground/60",
  open: "bg-sky-500",
} as const

export function ServiceStatusSquare({
  status,
}: { status: keyof typeof COLORS }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-[2px]",
        COLORS[status],
      )}
    />
  )
}

/** Current truth comes from the server; choosing an item runs an existing command. */
type StatusChoice = {
  value: WorkJob["summary"]
  label: string
  enabled: boolean
  step: JobStep | "start" | "ready" | null
}

export function serviceStatusChoices(job: WorkJob): StatusChoice[] {
  const open = job.summary !== "completed" && job.summary !== "cancelled"
  const gated = Boolean(jobGate(job))
  return [
    { value: "queued", label: "Not started", enabled: false, step: null },
    {
      value: "in_progress",
      label: "In progress",
      enabled:
        open &&
        !gated &&
        job.lines.some((line) => ["QUEUED", "BLOCKED"].includes(line.status)),
      step: job.summary === "blocked" ? "resume" : "start",
    },
    ...(job.summary === "partially_ready"
      ? [
          {
            value: "partially_ready" as const,
            label: "Partly ready",
            enabled: false,
            step: null,
          },
        ]
      : []),
    {
      value: "blocked",
      label: "Stuck",
      enabled:
        open &&
        !gated &&
        job.lines.some((line) =>
          ["QUEUED", "IN_PROGRESS"].includes(line.status),
        ),
      step: "stuck",
    },
    {
      value: "ready_for_handoff",
      label: "Ready for customer",
      enabled:
        open &&
        !gated &&
        job.lines.some((line) =>
          ["QUEUED", "IN_PROGRESS"].includes(line.status),
        ),
      step: "ready",
    },
    // Work completion records fulfillment; payment remains an independent action.
    {
      value: "completed",
      label: "Completed",
      enabled: open && !gated,
      step: "complete",
    },
    ...(job.summary === "cancelled"
      ? [
          {
            value: "cancelled" as const,
            label: "Cancelled",
            enabled: false,
            step: null,
          },
        ]
      : []),
  ]
}
