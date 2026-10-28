import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"

/**
 * Received more than the Order's balance (MB-01). The server decides the
 * split: the Order gets what it still owes, the rest is held as the
 * customer's money. The browser only shows that split from the server's own
 * snapshot; it never invents an account, revision or balance.
 */

type MerchantReport = RouterOutputs["businessBanking"]["report"]
export type CustomerFundsReview = NonNullable<
  MerchantReport["customerFundsReview"]
>
export type AllocationReview = NonNullable<
  RouterInputs["businessBanking"]["reviewReport"]["allocationReview"]
>

export type ExcessPlan =
  /** Nothing entered, or no more than the balance: the ordinary record. */
  | { kind: "none" }
  /** More than the balance, and the current customer-funds snapshot allows it. */
  | {
      kind: "excess"
      receivedMinor: number
      applyMinor: number
      heldMinor: number
      allocationReview: AllocationReview
    }
  /** More than the balance, but there's no customer-funds snapshot to use. */
  | { kind: "unavailable" }
  /** The snapshot and the report disagree about the Order: refresh first. */
  | { kind: "changed" }

export function excessPlan(input: {
  receivedMinor: number | null
  order: { totalMinor: number; paidMinor: number; balanceMinor: number }
  snapshot: CustomerFundsReview | null | undefined
}): ExcessPlan {
  const { receivedMinor, order, snapshot } = input
  if (
    receivedMinor === null ||
    !Number.isSafeInteger(receivedMinor) ||
    receivedMinor <= 0 ||
    receivedMinor <= order.balanceMinor
  )
    return { kind: "none" }
  if (!snapshot) return { kind: "unavailable" }
  if (
    snapshot.expectedOrderTotalMinor !== order.totalMinor ||
    snapshot.expectedOrderPaidMinor !== order.paidMinor
  )
    return { kind: "changed" }
  // Exactly the server's rule: the Order takes min(received, what it owes).
  const due = Math.max(
    0,
    snapshot.expectedOrderTotalMinor - snapshot.expectedOrderPaidMinor,
  )
  const applyMinor = Math.min(receivedMinor, due)
  return {
    kind: "excess",
    receivedMinor,
    applyMinor,
    heldMinor: receivedMinor - applyMinor,
    allocationReview: {
      orderAmountMinor: applyMinor,
      expectedCustomerFundsAccountId: snapshot.expectedCustomerFundsAccountId,
      expectedCustomerFundsRevision: snapshot.expectedCustomerFundsRevision,
      expectedOrderUpdatedAt: snapshot.expectedOrderUpdatedAt,
      expectedOrderTotalMinor: snapshot.expectedOrderTotalMinor,
      expectedOrderPaidMinor: snapshot.expectedOrderPaidMinor,
    },
  }
}

/**
 * The snapshot part of the bank-check key: a refreshed customer-funds
 * account, revision or Order makes an earlier check stale.
 */
export function fundsSnapshotKey(
  snapshot: CustomerFundsReview | null | undefined,
) {
  if (!snapshot) return "none"
  return JSON.stringify([
    snapshot.expectedCustomerFundsAccountId,
    snapshot.expectedCustomerFundsRevision,
    new Date(snapshot.expectedOrderUpdatedAt).toISOString(),
    snapshot.expectedOrderTotalMinor,
    snapshot.expectedOrderPaidMinor,
  ])
}

/**
 * The customer's own preference for extra money. It's what they asked for,
 * never an approved refund or a held amount.
 */
export function allocationPreferenceWords(
  preference: string | null,
  requestedApplyMinor: string | null,
  money: (minor: number) => string,
) {
  const asked =
    requestedApplyMinor && /^\d{1,15}$/.test(requestedApplyMinor)
      ? ` They asked to put ${money(Number(requestedApplyMinor))} on this order.`
      : ""
  switch (preference) {
    case "ORDER_MORE":
      return `Customer said they meant to pay more on this order.${asked}`
    case "CREDIT":
      return `Customer asked to keep the extra as credit with you.${asked}`
    case "REFUND":
      return `Customer asked for the extra back.${asked} That’s a request, not an approved refund.`
    case "UNRESOLVED":
      return `Customer didn’t say what to do with the extra.${asked}`
    default:
      return null
  }
}

/** A NIBSS session ID exactly as the server accepts it: 30 digits, nothing else. */
export function nibssSessionIdProblem(reference: string) {
  const value = reference.trim()
  if (!value) return "Enter the NIBSS session ID from your bank record."
  if (!/^\d+$/.test(value)) return "Use digits only, no spaces."
  if (value.length !== 30)
    return `A NIBSS session ID has 30 digits. This one has ${value.length}.`
  return null
}

export type ConfirmedAllocation = NonNullable<
  MerchantReport["confirmedAllocation"]
>

const REFUND_STATE_WORDS: Record<string, string> = {
  REQUESTED:
    "A refund request is open for the extra. It isn’t held or sent until you approve it.",
  RESERVED:
    "The refund for the extra is approved and held. It hasn’t been recorded as sent.",
  COMPLETED: "The refund for the extra was recorded as returned.",
  CANCELLED:
    "The refund request for the extra was cancelled. That request holds nothing.",
}

const RESOLUTION_WORDS: Record<string, string> = {
  held_credit: "The extra was kept as the customer’s credit.",
  business_review:
    "The customer didn’t say what to do with the extra. It was kept as their money for you to decide.",
  refund_details_needed:
    "The customer asked for the extra back, but no refund request was opened: their bank details are needed.",
  refund_requested: "A refund request was opened for the extra.",
}

/**
 * This payment's saved split, from the server only: what was received, what
 * went to the Order and what was kept, plus what happened to any extra.
 * These are the amounts when it was recorded, not today's balance.
 */
export function confirmedAllocationSummary(allocation: ConfirmedAllocation) {
  const rows: Array<{ label: string; minor: number }> = [
    {
      label: "Received in this payment",
      minor: allocation.receivedAmountMinor,
    },
    { label: "Went to the Order", minor: allocation.orderAmountMinor },
  ]
  if (allocation.excessAmountMinor > 0)
    rows.push({
      label: "Kept as customer money",
      minor: allocation.excessAmountMinor,
    })
  const state = allocation.refundState
  const extra =
    allocation.excessAmountMinor <= 0
      ? null
      : state
        ? (REFUND_STATE_WORDS[state] ?? `Refund request: ${state}.`)
        : allocation.excessResolution
          ? (RESOLUTION_WORDS[allocation.excessResolution] ?? null)
          : null
  return { rows, extra }
}
