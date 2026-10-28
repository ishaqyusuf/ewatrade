import { formatMinorMoney } from "@ewatrade/utils"

/** businessBanking.report `customerFundsReview` (Finance Owner/Admin only). */
export type CustomerFundsReview = {
  expectedCustomerFundsAccountId: string
  expectedCustomerFundsRevision: string
  expectedOrderUpdatedAt: Date
  expectedOrderTotalMinor: number
  expectedOrderPaidMinor: number
}

export type AllocationPreference =
  | "ORDER_MORE"
  | "CREDIT"
  | "REFUND"
  | "UNRESOLVED"

/** The reviewReport schema's largest received amount. */
export const MAX_RECEIVED_MINOR = 100_000_000

/**
 * The saved review snapshot, only while it agrees with the Order totals on
 * the same report. Without it the received amount stays capped at the
 * balance, as before.
 */
export function usableFundsReview(report: {
  customerFundsReview: CustomerFundsReview | null
  totalMinor: number
  paidMinor: number
}) {
  const review = report.customerFundsReview
  if (
    !review ||
    review.expectedOrderTotalMinor !== report.totalMinor ||
    review.expectedOrderPaidMinor !== report.paidMinor
  )
    return null
  return review
}

/**
 * Received R = applied to the Order A + held as customer credit E, in whole
 * minor units. A is always min(R, balance): the server refuses any other
 * split, so the merchant reviews it rather than choosing it. Null when R
 * fits within the balance (an ordinary payment) or isn't a valid amount.
 */
export function excessSplit(
  receivedMinor: number | null,
  review: CustomerFundsReview | null,
) {
  if (
    !review ||
    receivedMinor === null ||
    !Number.isSafeInteger(receivedMinor) ||
    receivedMinor <= 0 ||
    receivedMinor > MAX_RECEIVED_MINOR
  )
    return null
  const balanceMinor = Math.max(
    0,
    review.expectedOrderTotalMinor - review.expectedOrderPaidMinor,
  )
  if (receivedMinor <= balanceMinor) return null
  return {
    receivedMinor,
    orderAmountMinor: balanceMinor,
    excessMinor: receivedMinor - balanceMinor,
    allocationReview: {
      orderAmountMinor: balanceMinor,
      expectedCustomerFundsAccountId: review.expectedCustomerFundsAccountId,
      expectedCustomerFundsRevision: review.expectedCustomerFundsRevision,
      expectedOrderUpdatedAt: review.expectedOrderUpdatedAt,
      expectedOrderTotalMinor: review.expectedOrderTotalMinor,
      expectedOrderPaidMinor: review.expectedOrderPaidMinor,
    },
  }
}

export type ExcessSplit = NonNullable<ReturnType<typeof excessSplit>>

/**
 * What the customer asked for on the payment page. It is a request only:
 * nothing is credited, reserved or returned because of it.
 */
export function customerPreferenceFacts(
  report: {
    allocationPreference: AllocationPreference | null
    requestedApplyMinor: string | null
  },
  currencyCode: string,
) {
  if (!report.allocationPreference) return []
  const labels: Record<AllocationPreference, string> = {
    ORDER_MORE: "Pay this Order",
    CREDIT: "Keep the extra as credit",
    REFUND: "Refund the extra",
    UNRESOLVED: "Asked you to decide",
  }
  const requested =
    report.requestedApplyMinor && /^\d{1,15}$/.test(report.requestedApplyMinor)
      ? Number(report.requestedApplyMinor)
      : null
  return [
    { label: "Customer asked", value: labels[report.allocationPreference] },
    ...(requested !== null && Number.isSafeInteger(requested)
      ? [
          {
            label: "Asked to apply to Order",
            value: formatMinorMoney(requested, currencyCode),
          },
        ]
      : []),
  ]
}

/** What the server does with the extra when this payment is recorded. */
export function excessTreatmentText(
  preference: AllocationPreference | null,
  excess: string,
) {
  return preference === "REFUND"
    ? `${excess} is kept as customer credit. If the customer sent refund details, a refund request is saved for Finance to review. No money is sent.`
    : `${excess} is kept as customer credit. Nothing is returned to the customer.`
}

/**
 * businessBanking.report/reportStatus `confirmedAllocation`: what the server
 * saved for this one report. It is report history, never the customer's
 * current credit balance.
 */
export type ConfirmedAllocation = {
  receivedAmountMinor: number
  orderAmountMinor: number
  excessAmountMinor: number
  refundState: string | null
  excessResolution:
    | "refund_requested"
    | "refund_details_needed"
    | "business_review"
    | "held_credit"
    | null
}

type OutcomeFact = {
  label: string
  value: string
  numeric?: boolean
  strong?: boolean
}

const REFUND_STATES: Record<string, { value: string; note: string | null }> = {
  REQUESTED: {
    value: "Requested · waiting for Finance review",
    note: "No money has been sent. Finance reviews the customer's bank details before anything is returned.",
  },
  RESERVED: {
    value: "Approved · set aside, not sent yet",
    note: "The extra is held for this refund. No money has been sent yet.",
  },
  COMPLETED: {
    value: "Returned · recorded by Finance",
    note: null,
  },
  CANCELLED: {
    value: "Cancelled · no money was sent",
    note: "This refund request was cancelled. Nothing was returned from it.",
  },
}

/**
 * The saved outcome of a confirmed report, from the server's projection only.
 * Null projection means the breakdown is unknown, so nothing is claimed.
 */
export function savedAllocationOutcome(
  allocation: ConfirmedAllocation | null,
  orderNumber: string,
  currencyCode: string,
) {
  if (!allocation)
    return {
      known: false as const,
      hasExtra: false,
      recordedOn: `on ${orderNumber}`,
      actionNeeded: false,
      facts: [] as OutcomeFact[],
      note: null,
      canOpenRefund: false,
    }
  const money = (minor: number) => formatMinorMoney(minor, currencyCode)
  const excess = allocation.excessAmountMinor
  const resolution = excess > 0 ? allocation.excessResolution : null
  const refund =
    resolution === "refund_requested"
      ? (REFUND_STATES[allocation.refundState ?? ""] ?? {
          value: "Requested · status unavailable",
          note: "Open the refund request to see where it is. No money is sent without Finance.",
        })
      : null
  const returned =
    resolution === "refund_requested" && allocation.refundState === "COMPLETED"
  const refundRow =
    refund?.value ??
    (resolution === "refund_details_needed"
      ? "Asked for · bank details not received"
      : "Not requested")
  const note =
    refund?.note ??
    (resolution === "refund_details_needed"
      ? "The customer asked for a refund, but no bank details were saved, so there's no refund request. The extra is kept as customer credit. Nothing has been sent."
      : resolution === "business_review"
        ? "The customer didn't choose what to do with the extra. It's kept as customer credit for you to review. Nothing has been returned."
        : null)
  return {
    known: true as const,
    hasExtra: excess > 0,
    recordedOn:
      excess === 0
        ? `on ${orderNumber}`
        : returned
          ? `for ${orderNumber}, with the extra returned to the customer`
          : `for ${orderNumber}, with the extra kept as customer credit`,
    actionNeeded:
      resolution === "refund_details_needed" ||
      resolution === "business_review" ||
      (resolution === "refund_requested" &&
        !returned &&
        allocation.refundState !== "CANCELLED"),
    facts:
      excess > 0
        ? ([
            {
              label: "You received",
              value: money(allocation.receivedAmountMinor),
              numeric: true,
            },
            {
              label: `Applied to ${orderNumber}`,
              value: money(allocation.orderAmountMinor),
              numeric: true,
            },
            {
              label: returned ? "Extra" : "Kept as customer credit",
              value: money(excess),
              numeric: true,
              strong: true,
            },
            { label: "Refund", value: refundRow },
          ] satisfies OutcomeFact[])
        : ([] as OutcomeFact[]),
    note,
    canOpenRefund: resolution === "refund_requested",
  }
}

export type SavedAllocationOutcome = ReturnType<typeof savedAllocationOutcome>
