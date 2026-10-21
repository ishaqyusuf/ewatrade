import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { usesCustomerSignOff } from "@ewatrade/utils/service-work-presentation"

export type WorkJob = RouterOutputs["services"]["queue"][number]
export type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
export type ServiceRequest = RouterOutputs["serviceAccess"]["requests"][number]

export function formatMoney(value: number | null, currencyCode: string) {
  if (value === null) return "Quote required"
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

/** Whole naira without ".00"; kobo only when there are kobo. */
export function formatPrice(value: number | null, currencyCode: string) {
  if (value === null) return "Price after quote"
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(value / 100)
}

export function formatDue(
  value: string | Date | null,
  timeZone = "Africa/Lagos",
) {
  if (!value) return "No promised date"
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone,
    timeStyle: "short",
  }).format(new Date(value))
}

export function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function tone(summary: WorkJob["summary"]) {
  if (summary === "blocked") return "bg-warning text-warning-foreground"
  if (summary === "ready_for_handoff" || summary === "partially_ready") {
    return "bg-highlight text-highlight-foreground"
  }
  if (summary === "in_progress") return "bg-info text-info-foreground"
  return "bg-muted text-muted-foreground"
}

export function availableActions(status: WorkJob["lines"][number]["status"]) {
  if (status === "QUEUED") {
    return ["in_progress", "ready_for_handoff", "blocked"] as const
  }
  if (status === "IN_PROGRESS") {
    return ["ready_for_handoff", "blocked"] as const
  }
  if (status === "BLOCKED") return ["in_progress", "cancelled"] as const
  if (status === "READY_FOR_HANDOFF") {
    return ["in_progress"] as const
  }
  return [] as const
}

export function catalogOfferingDisplayName(
  itemName: string,
  variantName: string,
  offeringName: string,
) {
  const parts: string[] = []

  for (const source of [itemName, variantName, offeringName]) {
    for (const rawPart of source.split(/\s+[·|/]\s+/)) {
      const part = rawPart.trim()
      if (!part) continue

      const normalized = part.toLocaleLowerCase()
      if (
        parts.some((existing) => existing.toLocaleLowerCase() === normalized)
      ) {
        continue
      }

      parts.push(part)
    }
  }

  return parts.join(" · ")
}

export function flattenServiceOfferings(items: CatalogItem[], storeId: string) {
  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings
        .filter(
          (offering) =>
            offering.kind === "service" &&
            offering.status === "active" &&
            offering.stores.some(
              (availability) =>
                availability.storeId === storeId && availability.isAvailable,
            ),
        )
        .map((offering) => ({
          ...offering,
          displayName: catalogOfferingDisplayName(
            item.name,
            variant.name,
            offering.name,
          ),
        })),
    ),
  )
}

const TONES = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-info text-info-foreground",
  warning: "bg-warning text-warning-foreground",
  ready: "bg-highlight text-highlight-foreground",
} as const

export type StatusTone = keyof typeof TONES

export function toneClass(tone: StatusTone) {
  return TONES[tone]
}

/** Plain words for a customer request's status. */
export function requestStatus(status: string): {
  label: string
  tone: StatusTone
} {
  switch (status) {
    case "SUBMITTED":
      return { label: "New", tone: "ready" }
    case "NEEDS_INFORMATION":
      return { label: "Waiting for customer", tone: "info" }
    case "QUOTED":
      return { label: "Quote sent", tone: "info" }
    case "CONVERTED":
      return { label: "Accepted", tone: "ready" }
    case "DECLINED":
      return { label: "Declined", tone: "muted" }
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "muted" }
    default:
      return { label: label(status), tone: "muted" }
  }
}

export function isOpenRequest(status: string) {
  return status === "SUBMITTED" || status === "NEEDS_INFORMATION"
}

export type ServiceStage =
  | "open"
  | "todo"
  | "doing"
  | "stuck"
  | "ready"
  | "done"

export const SERVICE_STAGE_TABS: Array<{ value: ServiceStage; label: string }> =
  [
    { value: "open", label: "Open" },
    { value: "todo", label: "Not started" },
    { value: "doing", label: "In progress" },
    { value: "stuck", label: "Stuck" },
    { value: "ready", label: "Ready for customer" },
    { value: "done", label: "Handed over" },
  ]

type JobLike = Pick<
  WorkJob,
  "summary" | "lines" | "balanceDueMinor" | "handedOffAt"
>

function jobSignOff(job: Pick<WorkJob, "lines">) {
  return usesCustomerSignOff(job.lines.map((line) => line.catalogItemName))
}

/** The first line still waiting for payment or a manager, if any. */
export function jobGate(job: Pick<WorkJob, "lines">) {
  return (
    job.lines.find(
      (line) =>
        line.status !== "COMPLETED" &&
        line.status !== "CANCELLED" &&
        line.authorizationStatus !== "AUTHORIZED",
    )?.authorizationStatus ?? null
  )
}

/** Plain status for a job, in the words the list and sheet use. */
export function jobStage(job: JobLike): { label: string; tone: StatusTone } {
  const signOff = jobSignOff(job)
  switch (job.summary) {
    case "queued": {
      const gate = jobGate(job)
      if (gate === "PENDING_PAYMENT")
        return { label: "Waiting for payment", tone: "info" }
      if (gate === "PENDING_RELEASE")
        return { label: "Needs manager OK", tone: "info" }
      if (gate === "REVOKED") return { label: "On hold", tone: "warning" }
      return { label: "Not started", tone: "muted" }
    }
    case "in_progress":
      return { label: "In progress", tone: "info" }
    case "partially_ready":
      return { label: "Partly ready", tone: "info" }
    case "blocked":
      return { label: "Stuck", tone: "warning" }
    case "ready_for_handoff":
      return {
        label: signOff ? "Customer sign-off" : "Ready for customer",
        tone: "ready",
      }
    case "completed":
      return { label: signOff ? "Completed" : "Handed over", tone: "muted" }
    default:
      return { label: "Cancelled", tone: "muted" }
  }
}

/** Plain status for one part (line) of a job. */
export function lineStage(
  status: WorkJob["lines"][number]["status"],
  serviceName: string,
): { label: string; tone: StatusTone } {
  const signOff = usesCustomerSignOff([serviceName])
  switch (status) {
    case "QUEUED":
      return { label: "Not started", tone: "muted" }
    case "IN_PROGRESS":
      return { label: "In progress", tone: "info" }
    case "BLOCKED":
      return { label: "Stuck", tone: "warning" }
    case "READY_FOR_HANDOFF":
      return { label: signOff ? "Customer sign-off" : "Ready", tone: "ready" }
    case "COMPLETED":
      return { label: signOff ? "Completed" : "Handed over", tone: "muted" }
    default:
      return { label: "Cancelled", tone: "muted" }
  }
}

export type JobStep =
  | "pay"
  | "handover"
  | "stuck"
  | "resume"
  | "cancel"
  | "approve"
  | "assign"
  | "due"
  | "note"
  | "problem"
  | "photo"
  | "message"
  | "track"
  | "split"
  | "redo"

export const JOB_STEP_TITLES: Record<JobStep, string> = {
  pay: "Take payment",
  handover: "Hand over to the customer",
  stuck: "Mark stuck",
  resume: "Continue work",
  cancel: "Cancel this work",
  approve: "Approve the start",
  assign: "Who is doing it",
  due: "Change due date",
  note: "Add a note",
  problem: "Report a problem",
  photo: "Add a photo",
  message: "Message the customer",
  track: "Tracking link",
  split: "Split the work",
  redo: "Redo part of the work",
}

/**
 * The one thing to do next on a job. "start" and "ready" happen at once;
 * the rest open that step in the job sheet.
 */
export function jobNextStep(
  job: JobLike,
  canManage: boolean,
): { action: "start" | "ready" | JobStep; label: string } | null {
  const signOff = jobSignOff(job)
  switch (job.summary) {
    case "queued": {
      const gate = jobGate(job)
      if (gate === "PENDING_PAYMENT")
        return { action: "pay", label: "Take payment" }
      if (gate === "PENDING_RELEASE" || gate === "REVOKED")
        return canManage ? { action: "approve", label: "Approve start" } : null
      return { action: "start", label: "Start" }
    }
    case "in_progress":
    case "partially_ready":
      return {
        action: "ready",
        label: signOff ? "Ready for sign-off" : "Mark ready",
      }
    case "blocked":
      return { action: "resume", label: "Continue work" }
    case "ready_for_handoff":
      return {
        action: "handover",
        label: signOff ? "Complete job" : "Hand over",
      }
    default:
      return null
  }
}

function dayKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(value)
}

/** "Today, 2:00pm" · "Tomorrow, 10:00am" · "Yesterday, 4:00pm" · "Thu 23 Oct, 9:00am" */
export function formatWhen(
  value: string | Date | null,
  timeZone = "Africa/Lagos",
  now = new Date(),
) {
  if (!value) return "No due date"
  const date = new Date(value)
  const time = new Intl.DateTimeFormat("en-NG", {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(/\s/g, "")
    .toLowerCase()
  const day = dayKey(date, timeZone)
  const today = dayKey(now, timeZone)
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000), timeZone)
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), timeZone)
  const label =
    day === today
      ? "Today"
      : day === tomorrow
        ? "Tomorrow"
        : day === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-NG", {
              day: "numeric",
              month: "short",
              timeZone,
              weekday: "short",
            }).format(date)
  return `${label}, ${time}`
}

export function isJobLate(
  job: Pick<WorkJob, "dueCommitmentAt" | "summary">,
  now = new Date(),
) {
  return (
    Boolean(job.dueCommitmentAt) &&
    new Date(job.dueCommitmentAt as string | Date) < now &&
    job.summary !== "completed" &&
    job.summary !== "cancelled"
  )
}

/** "Bird vaccination · 300" or "Bird vaccination · 300, Farm delivery · 1". */
export function jobWhat(job: Pick<WorkJob, "lines">) {
  return job.lines
    .filter((line) => line.status !== "CANCELLED")
    .map((line) => `${line.catalogItemName} · ${line.allocatedQuantity}`)
    .join(", ")
}
