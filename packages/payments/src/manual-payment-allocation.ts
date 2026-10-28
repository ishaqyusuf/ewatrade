export type ManualPaymentExcessTreatment =
  | "KEEP_CREDIT"
  | "REFUND_REQUESTED"
  | "BUSINESS_REVIEW"
export type ManualPaymentAllocationProposal = {
  orderAmountMinor: number
  excessTreatment: ManualPaymentExcessTreatment
}

/** A customer proposal is evidence/consent only; actual allocation awaits bank confirmation. */
export function reviewManualPaymentAllocation(input: {
  claimedAmountMinor: number
  requestedAmountMinor: number
  orderBalanceMinor: number
  proposal: ManualPaymentAllocationProposal
}) {
  const { proposal } = input
  if (
    ![
      input.claimedAmountMinor,
      input.requestedAmountMinor,
      proposal.orderAmountMinor,
    ].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000,
    ) ||
    !Number.isSafeInteger(input.orderBalanceMinor) ||
    input.orderBalanceMinor < 0 ||
    input.claimedAmountMinor <= 0 ||
    input.requestedAmountMinor < 0 ||
    !["KEEP_CREDIT", "REFUND_REQUESTED", "BUSINESS_REVIEW"].includes(
      proposal.excessTreatment,
    )
  )
    throw new Error("Review the transferred amount and allocation.")
  if (
    proposal.orderAmountMinor > input.orderBalanceMinor ||
    proposal.orderAmountMinor > input.claimedAmountMinor
  )
    throw new Error(
      "The proposed Order payment exceeds the transfer or current balance.",
    )
  const excessMinor = input.claimedAmountMinor - proposal.orderAmountMinor
  // A report cannot silently divert money away from a due Order into held credit/refund.
  if (
    proposal.orderAmountMinor !==
    Math.min(input.claimedAmountMinor, input.orderBalanceMinor)
  )
    throw new Error(
      "Apply the transferred amount to this Order before reviewing its excess.",
    )
  return {
    claimedAmountMinor: input.claimedAmountMinor,
    proposedOrderAmountMinor: proposal.orderAmountMinor,
    excessAmountMinor: excessMinor,
    increasedInstallment:
      proposal.orderAmountMinor >
      Math.min(input.requestedAmountMinor, input.orderBalanceMinor),
    excessTreatment: excessMinor > 0 ? proposal.excessTreatment : null,
    remainingOrderMinor: input.orderBalanceMinor - proposal.orderAmountMinor,
  }
}

/** Attempt contribution is settled Order funding, not the customer's available credit. */
export function projectManualPaymentAttemptAmounts(input: {
  requestedMinor: number
  balanceMinor: number
  appliedMinor: bigint
  receivedMinor: bigint
}) {
  if (
    ![input.requestedMinor, input.balanceMinor].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    input.appliedMinor < BigInt(0) ||
    input.receivedMinor < BigInt(0) ||
    input.appliedMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    input.receivedMinor > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Invalid payment attempt attribution.")
  const remaining =
    BigInt(input.requestedMinor) - input.appliedMinor - input.receivedMinor
  const capped =
    remaining <= BigInt(0)
      ? BigInt(0)
      : remaining < BigInt(input.balanceMinor)
        ? remaining
        : BigInt(input.balanceMinor)
  return {
    attemptAppliedMinor: Number(input.appliedMinor),
    attemptReceivedMinor: Number(input.receivedMinor),
    remainingTransferMinor: Number(capped),
  }
}
