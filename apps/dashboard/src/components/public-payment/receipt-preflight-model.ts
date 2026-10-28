import type { PublicReportStatus } from "./payment-format"

/** How long the page waits for a draft receipt check before saying it is taking too long. */
export const PREFLIGHT_WAIT_MS = 3 * 60_000

/** Bounded: quick at first, slower later, nothing after the wait ends. */
export function preflightPollDelay(elapsedMs: number) {
  if (elapsedMs >= PREFLIGHT_WAIT_MS) return false
  return elapsedMs < 30_000 ? 2_500 : 6_000
}

/** A draft whose receipt check hasn't finished yet. A submitted report is never polled here. */
export function preflightRunning(
  status:
    | Pick<PublicReportStatus, "status" | "state" | "receiptAssessment">
    | undefined,
) {
  if (
    !status ||
    status.status !== "DRAFT" ||
    status.state === "draft_cancelled"
  )
    return false
  const assessment = status.receiptAssessment
  return (
    !assessment ||
    assessment.state === "pending" ||
    assessment.state === "checking"
  )
}

/** A submitted receipt generation can finish without any financial status/socket revision. */
export function receiptStatusPollKey(
  status:
    | (Pick<PublicReportStatus, "reportId" | "status"> & {
        receiptAssessment: Pick<
          NonNullable<PublicReportStatus["receiptAssessment"]>,
          "state" | "generation" | "pipelineVersion"
        > | null
      })
    | undefined,
) {
  const assessment = status?.receiptAssessment
  if (
    !status ||
    status.status === "DRAFT" ||
    !assessment ||
    (assessment.state !== "pending" && assessment.state !== "checking")
  )
    return null
  return `${status.reportId}:${assessment.generation}:${assessment.pipelineVersion}`
}

/** One bounded wall-clock window; hiding/offline never resets its deadline. */
export function receiptStatusPollDelay(input: {
  elapsedMs: number
  visible: boolean
  online: boolean
  expectedKey: string
  currentKey: string | null
}) {
  if (!input.visible || !input.online || input.currentKey !== input.expectedKey)
    return false
  return preflightPollDelay(input.elapsedMs)
}
