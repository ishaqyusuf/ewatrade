export type WorkSummary = {
  summary: string
  dueCommitmentAt: Date | string | null
  handedOffAt: Date | string | null
  currentAssigneeUserId: string | null
}
export function workStatusLabel(value: string) {
  const labels: Record<string, string> = {
    queued: "Received",
    in_progress: "Working",
    ready_for_handoff: "Ready",
    partially_ready: "Part ready",
    blocked: "Blocked",
    completed: "Collected",
    cancelled: "Cancelled",
    paid: "Paid",
    partially_paid: "Part paid",
    unpaid: "Unpaid",
  }
  return labels[value.toLowerCase()] ?? value.toLowerCase().replaceAll("_", " ")
}
export function overdueWork(job: WorkSummary, now: number) {
  return (
    !job.handedOffAt &&
    !["completed", "cancelled"].includes(job.summary) &&
    Boolean(
      job.dueCommitmentAt && new Date(job.dueCommitmentAt).getTime() < now,
    )
  )
}
export function workMatches(
  job: WorkSummary,
  filter: string,
  actorId: string | undefined,
  now: number,
) {
  if (filter === "mine")
    return Boolean(actorId && job.currentAssigneeUserId === actorId)
  if (filter === "overdue") return overdueWork(job, now)
  if (filter === "ready")
    return job.summary === "ready_for_handoff" && !job.handedOffAt
  if (filter === "blocked") return job.summary === "blocked"
  return true
}
