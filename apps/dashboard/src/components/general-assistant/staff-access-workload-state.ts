import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type StaffAccessWorkload =
  RouterOutputs["retailOps"]["staffStoreAccessReview"]["outstandingServiceWork"]

export function staffAccessWorkloadTimeValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}
function identityValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 160 &&
    value.trim() === value &&
    !/[\u0000-\u001f]/u.test(value)
  )
}
function rowValid(job: StaffAccessWorkload["jobs"][number]) {
  return (
    Boolean(job) &&
    identityValid(job.jobId) &&
    identityValid(job.storeId) &&
    typeof job.storeName === "string" &&
    job.storeName.trim().length > 0 &&
    ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(job.storeStatus) &&
    ["NORMAL", "URGENT"].includes(job.priority) &&
    Number.isSafeInteger(job.revision) &&
    job.revision >= 0 &&
    staffAccessWorkloadTimeValid(job.createdAt)
  )
}

export function staffAccessWorkloadState(
  workload: StaffAccessWorkload,
  membershipId: string,
) {
  if (
    !workload ||
    !Array.isArray(workload.jobs) ||
    !identityValid(membershipId) ||
    !staffAccessWorkloadTimeValid(workload.asOf) ||
    workload.jobs.some((job) => !rowValid(job))
  )
    return "unavailable" as const
  const limited = workload.count > workload.jobs.length
  if (
    workload.membershipId !== membershipId ||
    workload.coverage !== "available" ||
    workload.countCoverage !== "complete" ||
    workload.attribution !== "current_assignee" ||
    ![
      "all_business_stores_current_assignee",
      "selected_store_current_assignee",
    ].includes(workload.scope) ||
    !Number.isSafeInteger(workload.count) ||
    workload.count < 0 ||
    workload.shown !== workload.jobs.length ||
    workload.count < workload.shown ||
    !Number.isInteger(workload.limit) ||
    workload.limit < 1 ||
    workload.limit > 50 ||
    workload.jobs.length > workload.limit ||
    workload.shown !== Math.min(workload.count, workload.limit) ||
    (workload.scope === "all_business_stores_current_assignee"
      ? workload.storeId !== null
      : !identityValid(workload.storeId) ||
        workload.jobs.some((job) => job.storeId !== workload.storeId)) ||
    workload.hasMore !== limited ||
    workload.detailsCoverage !== (limited ? "limited" : "complete") ||
    new Set(workload.jobs.map((job) => job.jobId)).size !==
      workload.jobs.length ||
    !identityValid(workload.membershipId)
  )
    return "unavailable" as const
  return "ready" as const
}

/** Only an exact row in the current review can be inspected; no latest/first fallback. */
export function staffAccessWorkloadJob(
  workload: StaffAccessWorkload,
  membershipId: string,
  jobId: string | null,
) {
  if (staffAccessWorkloadState(workload, membershipId) !== "ready" || !jobId)
    return null
  return workload.jobs.find((job) => job.jobId === jobId) ?? null
}
