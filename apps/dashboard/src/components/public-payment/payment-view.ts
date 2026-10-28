import type { PublicPaymentLink, PublicReportStatus } from "./payment-format"

export type ReportOutcome = "paid" | "partially_paid" | "not_received"

export type PaymentView =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error" }
  /** The business is checking the customer's report. */
  | { kind: "waiting"; link: PublicPaymentLink; status: PublicReportStatus }
  /** A report was started here but never reached the business. */
  | { kind: "unfinished"; link: PublicPaymentLink }
  | {
      kind: "link"
      link: PublicPaymentLink
      /** The last decided report from this browser, shown above the page. */
      outcome: { state: ReportOutcome; status: PublicReportStatus } | null
    }

/**
 * What a decided report offers next. The result itself is the page; a new form starts only when
 * the customer picks this. A full payment, or a link that no longer takes payments, offers nothing.
 */
export function outcomeNextStep(
  outcome: ReportOutcome,
  input: { linkState: PublicPaymentLink["state"]; balanceMinor: number },
): "pay_remaining" | "tell_again" | null {
  if (input.linkState !== "active" || input.balanceMinor <= 0) return null
  if (outcome === "partially_paid") return "pay_remaining"
  if (outcome === "not_received") return "tell_again"
  return null
}

/** The payment reference a report was made against, once the server sends one. */
export function reportReference(status: {
  reportId: string
  paymentReference?: string | null
}) {
  return status.paymentReference?.trim() || null
}

/**
 * Business-confirmation provenance for a decided report. Only the server's canonical confirmation
 * counts: a matched reference, a receipt check or a CONFIRMED status without a recorded payment
 * never reads as verified. Reports read before the server sends provenance return null.
 */
export function verifiedConfirmation(status: {
  reportId: string
  verification?: {
    state: "unverified" | "confirmed"
    confirmedAt: Date | string | null
    canonicalPaymentId: string | null
  } | null
  /** A confirmed transfer the server recorded as a customer receipt (an excess) instead. */
  customerReceiptId?: string | null
}): { confirmedAt: Date | string | null } | null {
  const verification = status.verification
  if (
    verification?.state !== "confirmed" ||
    !(verification.canonicalPaymentId || status.customerReceiptId)
  )
    return null
  return { confirmedAt: verification.confirmedAt }
}

export type ConfirmedExcess = {
  amountMinor: number
  /** held_credit: kept as the customer's credit; the others are not money returned. */
  resolution:
    | "held_credit"
    | "refund_requested"
    | "refund_details_needed"
    | "business_review"
  /** The saved refund request's state, only for refund_requested. */
  refund: "requested" | "approved" | "returned" | "cancelled" | null
}

/** A refund preference, a reserved refund and returned money are different server outcomes. */
export function confirmedExcessLabel(excess: ConfirmedExcess) {
  if (excess.resolution === "held_credit") return "Extra held as your credit"
  if (excess.resolution === "refund_details_needed")
    return "Extra awaiting refund bank details"
  if (excess.resolution === "business_review")
    return "Extra awaiting business review"
  if (excess.refund === "returned") return "Refund recorded as returned"
  if (excess.refund === "approved") return "Extra reserved for refund"
  if (excess.refund === "cancelled")
    return "Refund cancelled · extra still held"
  return "Refund requested · money not yet returned"
}

/**
 * What this report's confirmed transfer did, from the server's canonical allocation: received,
 * applied to this order and any extra. A proposal never appears here; a refund request, its
 * approval and money actually returned stay distinct. Null until the server records one.
 */
export function confirmedOutcome(status: {
  confirmedAllocation?: {
    receivedAmountMinor: number
    orderAmountMinor: number
    excessAmountMinor: number
    refundState: string | null
    excessResolution: ConfirmedExcess["resolution"] | null
  } | null
}): {
  receivedMinor: number
  appliedMinor: number
  excess: ConfirmedExcess | null
} | null {
  const allocation = status.confirmedAllocation
  if (!allocation) return null
  const resolution = allocation.excessResolution
  return {
    receivedMinor: allocation.receivedAmountMinor,
    appliedMinor: allocation.orderAmountMinor,
    excess:
      resolution && allocation.excessAmountMinor > 0
        ? {
            amountMinor: allocation.excessAmountMinor,
            resolution,
            refund:
              resolution !== "refund_requested"
                ? null
                : allocation.refundState === "RESERVED"
                  ? "approved"
                  : allocation.refundState === "COMPLETED"
                    ? "returned"
                    : allocation.refundState === "CANCELLED"
                      ? "cancelled"
                      : "requested",
          }
        : null,
  }
}

/**
 * A decided report and the link are separate reads, and the link is read again only after the
 * decision arrives. Until then the page shows the report's order money as one snapshot, so the
 * summary and the next amount agree with "Still to pay". Everything else, including whether the
 * link still takes payments, stays the link's. A link read after the report is not detected:
 * its money waits for the next report read (focus or Reload).
 *
 * The remaining transfer is per payment attempt. When the link still shows the report's own
 * attempt, the report's authoritative remainder (credit and confirmed transfers on that attempt
 * already subtracted) is used even if the link read is older. A newer attempt on the link keeps
 * its own amounts: it never inherits the old attempt's exhausted remainder.
 */
function withReportMoney(
  link: PublicPaymentLink,
  status: PublicReportStatus,
): PublicPaymentLink {
  const sameAttempt =
    typeof status.paymentAttemptId === "string" &&
    status.paymentAttemptId === link.paymentAttemptId
  return {
    ...link,
    totalMinor: status.totalMinor,
    paidMinor: status.paidMinor,
    balanceMinor: status.balanceMinor,
    ...(sameAttempt
      ? {
          attemptAppliedMinor: status.attemptAppliedMinor,
          attemptReceivedMinor: status.attemptReceivedMinor,
          amountPrefilledMinor: Math.min(
            status.remainingTransferMinor,
            status.balanceMinor,
          ),
        }
      : {
          amountPrefilledMinor: Math.min(
            link.amountPrefilledMinor,
            status.balanceMinor,
          ),
        }),
  }
}

export function resolvePaymentView(input: {
  link: PublicPaymentLink | undefined
  linkError: "not_found" | "error" | null
  hasReportToken: boolean
  status: PublicReportStatus | undefined
  statusPending: boolean
  /** not_found: the stored report token expired or no longer exists. */
  statusError: "not_found" | "error" | null
  /**
   * The stored report is this visit's own draft, prepared for the receipt check inside the open
   * "I have paid" step. It stays the payment page; a draft found on a later visit is unfinished.
   */
  preflight?: boolean
}): PaymentView {
  const { link, status } = input
  if (!link) {
    if (input.linkError === "not_found") return { kind: "not_found" }
    if (input.linkError === "error") return { kind: "error" }
    return { kind: "loading" }
  }
  if (
    input.hasReportToken &&
    input.preflight &&
    (!status || status.status === "DRAFT")
  )
    return { kind: "link", link, outcome: null }
  if (input.hasReportToken && status) {
    if (status.state === "draft_cancelled") return { kind: "unfinished", link }
    if (status.state === "checking")
      return status.status === "DRAFT"
        ? { kind: "unfinished", link }
        : { kind: "waiting", link, status }
    return {
      kind: "link",
      link: withReportMoney(link, status),
      outcome: { state: status.state, status },
    }
  }
  if (input.hasReportToken && input.statusError === "error")
    return { kind: "error" }
  if (input.hasReportToken && input.statusPending) return { kind: "loading" }
  return { kind: "link", link, outcome: null }
}
