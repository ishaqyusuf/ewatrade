import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

/**
 * Pure rules for managing customer refund requests (MB-01, Workshop v18).
 * A request, its approval and reservation, and the record of money already
 * returned are separate server states. Nothing here sends or holds money.
 */

export type RefundRequestRow =
  RouterOutputs["customerLedger"]["refundRequests"]["requests"][number]
export type RefundRequestDetail =
  RouterOutputs["customerLedger"]["refundRequestDetail"]

export const REFUND_STATUSES = [
  "REQUESTED",
  "RESERVED",
  "COMPLETED",
  "CANCELLED",
] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

export const refundStatusWords: Record<
  RefundStatus,
  { label: string; tone: "review" | "held" | "done" | "closed" }
> = {
  REQUESTED: { label: "To review", tone: "review" },
  RESERVED: { label: "Approved · reserved", tone: "held" },
  COMPLETED: { label: "Returned", tone: "done" },
  CANCELLED: { label: "Cancelled", tone: "closed" },
}

export function refundStatus(value: string): RefundStatus | null {
  return (REFUND_STATUSES as readonly string[]).includes(value)
    ? (value as RefundStatus)
    : null
}

/**
 * The list badge from the saved review state. "More details needed" is a
 * review note on a requested refund, not a separate money state.
 */
export function refundReviewLabel(
  row: Pick<RefundRequestRow, "status" | "reviewState">,
) {
  const status = refundStatus(row.status)
  if (status === "REQUESTED" && row.reviewState === "NEEDS_DETAILS")
    return "More details needed"
  return status ? refundStatusWords[status].label : row.status
}

/**
 * What this screen may offer for a request, only from the server's own
 * status and flags. An unknown status offers nothing. Approval needs a
 * readable destination; recording money already sent needs one too, so the
 * merchant can see where it went. Cancelling only needs `canCancel`.
 */
export function refundActions(
  detail: Pick<
    RefundRequestDetail,
    "status" | "canApprove" | "canCancel" | "destinationStatus" | "destination"
  >,
) {
  const status = refundStatus(detail.status)
  const readable =
    detail.destinationStatus === "AVAILABLE" && detail.destination !== null
  return {
    status,
    readable,
    approve: status === "REQUESTED" && detail.canApprove && readable,
    askForDetails: status === "REQUESTED",
    recordReturn: status === "RESERVED" && readable,
    cancel:
      (status === "REQUESTED" || status === "RESERVED") && detail.canCancel,
  }
}

/**
 * The bank as the customer or merchant typed it. Older requests saved only
 * a code, shown as such. Neither is a verified bank or a routing lookup.
 */
export function refundBankLabel(destination: {
  bankName?: string | null
  bankCode?: string | null
}) {
  const name = destination.bankName?.trim()
  if (name) return name
  const code = destination.bankCode?.trim()
  return code ? `Bank code ${code}` : "Bank not given"
}

/** "•••• 6789": enough to recognise the account without showing it. */
export function maskedAccountNumber(accountNumber: string) {
  const tail = accountNumber.slice(-4)
  return tail ? `•••• ${tail}` : "—"
}

/**
 * What "Customer and destination verified" vouches for: this request version,
 * the account revision it was read at and the exact saved destination. Any
 * refresh that changes one of them makes an earlier check stale.
 */
export function reserveAckKey(
  detail: Pick<
    RefundRequestDetail,
    "id" | "version" | "accountRevision" | "destinationFingerprint"
  >,
) {
  return JSON.stringify([
    "reserve",
    detail.id,
    detail.version,
    detail.accountRevision,
    detail.destinationFingerprint,
  ])
}

/**
 * What "I already sent this money" vouches for: this reserved request version
 * and the exact account, day and outgoing reference being recorded. Null
 * while any of them is missing.
 */
export function returnAckKey(
  detail: Pick<RefundRequestDetail, "id" | "version" | "accountRevision">,
  fields: { moneyAccountId: string; day: string; reference: string },
) {
  const reference = fields.reference.trim()
  if (!fields.moneyAccountId || !fields.day || !reference) return null
  return JSON.stringify([
    "return",
    detail.id,
    detail.version,
    detail.accountRevision,
    fields.moneyAccountId,
    fields.day,
    reference,
  ])
}

/** Local calendar day ("YYYY-MM-DD") of an instant, as the date picker shows it. */
export function localDay(value: Date | string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/**
 * The instant recorded for money already sent on `day`. Today is the moment
 * the form opened; earlier days are local midday. Never before the approval
 * (the server refuses that) and never after the form opened. The result is
 * stable for one form, so a retry sends exactly the same details.
 */
export function returnEffectiveAt(
  day: string,
  input: { openedAt: Date; approvedAt: Date | string | null },
): { at: Date } | { problem: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  // Midday that day; Feb 31, month 13 or day 00 would roll into another day.
  const midday = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : null
  if (!midday || localDay(midday) !== day)
    return { problem: "Choose the day you sent the money." }
  const approvedAt = input.approvedAt ? new Date(input.approvedAt) : null
  if (!approvedAt || Number.isNaN(approvedAt.getTime()))
    return { problem: "Approve and reserve this refund first." }
  const today = localDay(input.openedAt)
  if (day > today) return { problem: "The day can't be in the future." }
  if (day < localDay(approvedAt))
    return {
      problem: "The money can't have been sent before the refund was approved.",
    }
  const at = day === today ? input.openedAt : midday
  return { at: at < approvedAt ? approvedAt : at }
}
