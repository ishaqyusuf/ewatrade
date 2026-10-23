import { type WorkJob, jobGate } from "./service-utils"

export function serviceBatchEligible(
  job: WorkJob,
  action: "mark_in_progress" | "mark_ready" | "resume" | "delay",
) {
  if (
    job.handedOffAt ||
    job.summary === "completed" ||
    job.summary === "cancelled"
  )
    return false
  if (action === "delay") return Boolean(job.dueCommitmentAt)
  if (jobGate(job)) return false
  if (action === "resume")
    return (
      job.summary === "blocked" &&
      job.lines.some(
        (line) =>
          line.status === "BLOCKED" &&
          line.authorizationStatus === "AUTHORIZED",
      )
    )
  if (action === "mark_in_progress")
    return (
      job.summary === "queued" &&
      job.lines.some(
        (line) =>
          line.status === "QUEUED" && line.authorizationStatus === "AUTHORIZED",
      )
    )
  return (
    ["in_progress", "partially_ready"].includes(job.summary) &&
    job.lines.some(
      (line) =>
        ["QUEUED", "IN_PROGRESS"].includes(line.status) &&
        line.authorizationStatus === "AUTHORIZED",
    )
  )
}
