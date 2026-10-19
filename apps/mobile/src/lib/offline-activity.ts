import type { MobileActivityInput } from "@ewatrade/events/mobile-activity"

type SyncActivity = Extract<MobileActivityInput, { name: "mobile_sync_result" }>
type ReviewActivity = Extract<
  MobileActivityInput,
  { name: "mobile_offline_review_result" }
>
export type OfflineReviewAction = ReviewActivity["properties"]["action"]

const applied = new Set<unknown>(["APPLIED", "approved"])
const held = new Set<unknown>([
  "held",
  "PENDING",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "DISCARDED",
  "rejected",
])

/**
 * Only a complete, recognized response establishes completion. A thrown request
 * can have committed effects, so failed transport always means unknown here.
 * Counts above 1,000 are reported as the bounded 1,000 bucket; response coverage
 * is checked against the original count, before that telemetry-only clamp.
 */
export function syncActivity(input: {
  outcome: "applied" | "failed"
  statuses: readonly unknown[]
  itemCount: number
  durationMs: number
}): SyncActivity | null {
  if (
    !Number.isSafeInteger(input.itemCount) ||
    input.itemCount <= 0 ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0 ||
    (input.outcome !== "applied" && input.outcome !== "failed")
  )
    return null

  let status: SyncActivity["properties"]["status"] = "unknown"
  if (
    input.outcome === "applied" &&
    Array.isArray(input.statuses) &&
    input.statuses.length === input.itemCount
  ) {
    // Array iteration includes holes as undefined; sparse results cannot count
    // as complete acknowledgements.
    const statuses = Array.from(input.statuses)
    if (statuses.every((value) => applied.has(value))) status = "completed"
    else if (statuses.every((value) => applied.has(value) || held.has(value)))
      status = "partial"
  }
  return {
    name: "mobile_sync_result",
    properties: {
      status,
      item_count: Math.min(input.itemCount, 1000),
      duration_ms: Math.min(input.durationMs, 3_600_000),
    },
  }
}

/** Fixed status vocabulary only: never copy a server error, result or entity. */
export function reviewActivity(
  action: OfflineReviewAction,
  resultStatus: unknown,
): ReviewActivity {
  let status: ReviewActivity["properties"]["status"] = "unknown"
  if (applied.has(resultStatus)) status = "applied"
  else if (
    resultStatus === "REVIEW_REQUIRED" ||
    resultStatus === "BLOCKED" ||
    resultStatus === "held"
  )
    status = "review_required"
  else if (resultStatus === "PENDING") status = "pending"
  else if (resultStatus === "DISCARDED" || resultStatus === "rejected")
    status = "discarded"
  return {
    name: "mobile_offline_review_result",
    properties: { action, status },
  }
}
