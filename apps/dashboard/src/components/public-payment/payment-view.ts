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
}): { confirmedAt: Date | string | null } | null {
  const verification = status.verification
  if (verification?.state !== "confirmed" || !verification.canonicalPaymentId)
    return null
  return { confirmedAt: verification.confirmedAt }
}

/**
 * A decided report and the link are separate reads, and the link is read again only after the
 * decision arrives. Until then the page shows the report's order money as one snapshot, so the
 * summary and the next amount agree with "Still to pay". Everything else, including whether the
 * link still takes payments, stays the link's. A link read after the report is not detected:
 * its money waits for the next report read (focus or Reload).
 */
function withReportMoney(
  link: PublicPaymentLink,
  status: PublicReportStatus,
): PublicPaymentLink {
  return {
    ...link,
    totalMinor: status.totalMinor,
    paidMinor: status.paidMinor,
    balanceMinor: status.balanceMinor,
    amountPrefilledMinor: Math.min(
      link.amountRequestedMinor,
      status.balanceMinor,
    ),
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
}): PaymentView {
  const { link, status } = input
  if (!link) {
    if (input.linkError === "not_found") return { kind: "not_found" }
    if (input.linkError === "error") return { kind: "error" }
    return { kind: "loading" }
  }
  if (input.hasReportToken && status) {
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
