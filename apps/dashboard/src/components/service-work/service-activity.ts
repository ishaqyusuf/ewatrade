import { type WorkJob, formatPrice, lineStage } from "./service-utils"

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Job created",
  AUTHORIZED: "Work authorized",
  AUTHORIZATION_REVOKED: "Work authorization revoked",
  SPLIT: "Work split",
  ASSIGNED: "Work assigned",
  REASSIGNED: "Assignment changed",
  DUE_COMMITMENT_CREATED: "Due date set",
  DUE_COMMITMENT_REVISED: "Due date changed",
  EVIDENCE_PUBLISHED: "Photo shared with customer",
  EVIDENCE_REVOKED: "Photo hidden from customer",
  PICKUP: "Work picked up",
  DELIVERY: "Work delivered",
  REMOTE_HANDOFF: "Job completed",
  REWORK: "Rework created",
  CANCELLED: "Work cancelled",
}

/** "Collected by customer · by Ada · ₦2,000 still owed" */
function handoffEntry(
  job: Pick<WorkJob, "currencyCode" | "handoff">,
): { title: string; detail: string } | null {
  const handoff = job.handoff
  if (!handoff?.method) return null
  return {
    title:
      handoff.method === "delivered"
        ? "Delivered to customer"
        : "Collected by customer",
    detail: [
      handoff.byName ? `by ${handoff.byName}` : null,
      handoff.balanceOwedMinor > 0
        ? `${formatPrice(handoff.balanceOwedMinor, job.currencyCode)} still owed`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }
}

export function serviceActivityEvents(
  job: Pick<
    WorkJob,
    "events" | "lines" | "createdAt" | "currencyCode" | "handoff"
  >,
) {
  const handoff = handoffEntry(job)
  const events = job.events
    .filter(
      (event) =>
        // These have their full contents in the existing note/photo/problem entries.
        ![
          "NOTE_ADDED",
          "EVIDENCE_CAPTURED",
          "DELAY",
          "FAILED_ATTEMPT",
          "QUALITY_EXCEPTION",
          "CUSTOMER_REJECTION",
        ].includes(event.type),
    )
    .map((event) => {
      const line = job.lines.find((line) => line.id === event.lineId)
      if (event.type === "REMOTE_HANDOFF" && handoff)
        return {
          id: event.id,
          at: new Date(event.effectiveAt ?? event.createdAt),
          ...handoff,
        }
      const title =
        event.type === "STATUS_CHANGED" &&
        !event.lineId &&
        event.toStatus === "COMPLETED"
          ? "Job completed"
          : event.type === "STATUS_CHANGED" && event.toStatus
            ? `${event.fromStatus ? `${lineStage(event.fromStatus, line?.catalogItemName ?? "Service").label} → ` : ""}${lineStage(event.toStatus, line?.catalogItemName ?? "Service").label}`
            : event.type === "CREATED" && line
              ? "Work added"
              : (EVENT_LABELS[event.type] ??
                event.type.toLowerCase().replaceAll("_", " "))
      return {
        id: event.id,
        at: new Date(event.effectiveAt ?? event.createdAt),
        title,
        detail: [line?.offeringName, event.reason].filter(Boolean).join(" · "),
      }
    })
  if (!events.some((event) => event.title === "Job created"))
    events.push({
      id: "job-created",
      at: new Date(job.createdAt),
      title: "Job created",
      detail: "",
    })
  return events
}
