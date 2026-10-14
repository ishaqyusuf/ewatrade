import { createHash } from "node:crypto"

/**
 * F04 payout contract. Pure decisions for verified payees, the reviewed payout,
 * the in-app step-up and dispatch. No network call or database write happens
 * here. Owner policy (12 Oct 2026):
 * - registered Paystack business with transfers enabled; approval by an in-app
 *   step-up bound to the exact review (Paystack OTP disabled);
 * - no app-imposed amount limit (provider limits still apply);
 * - v1 pays recorded supplier bills only; the business bears the transfer fee,
 *   recorded under "Bank & transfer charges";
 * - only Paystack's recipient code, bank name, account name and last 4 digits
 *   are kept; the full account number is discarded after recipient creation;
 * - one Owner-controlled payouts stop blocks new approvals and submissions;
 * - Owners and Admins approve; Managers may prepare drafts.
 */
export const payoutPolicy = {
  purposes: ["supplier_bill"] as const,
  feeBearer: "business" as const,
  feeExpenseCategory: "Bank & transfer charges",
  approverRoles: ["OWNER", "ADMIN"] as const,
  drafterRoles: ["OWNER", "ADMIN", "MANAGER"] as const,
}
export type PayoutPurpose = (typeof payoutPolicy.purposes)[number]
export const canApprovePayouts = (role: string | null | undefined) =>
  (payoutPolicy.approverRoles as readonly string[]).includes(role ?? "")
export const canDraftPayouts = (role: string | null | undefined) =>
  (payoutPolicy.drafterRoles as readonly string[]).includes(role ?? "")

export type PayoutBeneficiaryInput = {
  bankCode: string
  accountNumber: string
}
/** What the provider's account resolution returned, or null when it failed. */
export type ResolvedAccount = {
  bankCode: string
  accountNumber: string
  accountName: string
} | null

export type PayoutRefusal = {
  ok: false
  code:
    | "INVALID_ACCOUNT"
    | "UNRESOLVED_ACCOUNT"
    | "RESOLUTION_MISMATCH"
    | "NAME_NOT_CONFIRMED"
    | "FORBIDDEN"
    | "PAYOUTS_STOPPED"
    | "PURPOSE_NOT_ALLOWED"
    | "INVALID_AMOUNT"
    | "CURRENCY_MISMATCH"
    | "BENEFICIARY_UNVERIFIED"
    | "STEP_UP_REQUIRED"
    | "STEP_UP_STALE"
    | "STEP_UP_MISMATCH"
    | "NOT_DISPATCHABLE"
  message: string
}
const refuse = (
  code: PayoutRefusal["code"],
  message: string,
): PayoutRefusal => ({ ok: false, code, message })
const positiveMinor = (value: number) =>
  Number.isSafeInteger(value) && value > 0
const validTime = (value: Date) =>
  value instanceof Date && Number.isFinite(value.getTime())

/**
 * A payee is verified only when the provider resolved exactly the entered bank
 * and account with a real account name, and a person confirmed that name.
 * Names are never fuzzy-matched; an empty name is not an identity.
 */
export function decideBeneficiaryVerification(input: {
  entered: PayoutBeneficiaryInput
  resolved: ResolvedAccount
  confirmedName: string | null
}):
  | {
      ok: true
      accountName: string
      accountSuffix: string
      bankCode: string
    }
  | PayoutRefusal {
  const number = input.entered.accountNumber.trim()
  if (!/^\d{6,20}$/.test(number) || !input.entered.bankCode.trim())
    return refuse(
      "INVALID_ACCOUNT",
      "Enter the bank and a digits-only account number.",
    )
  const resolvedName = input.resolved?.accountName.trim() ?? ""
  if (!input.resolved || !resolvedName)
    return refuse(
      "UNRESOLVED_ACCOUNT",
      "The bank could not confirm this account's name. Check the bank and account number.",
    )
  if (
    input.resolved.accountNumber !== number ||
    input.resolved.bankCode !== input.entered.bankCode.trim()
  )
    return refuse(
      "RESOLUTION_MISMATCH",
      "The bank confirmed a different account. Check the details again.",
    )
  if (input.confirmedName?.trim() !== resolvedName)
    return refuse(
      "NAME_NOT_CONFIRMED",
      `Confirm the account name "${resolvedName}" before saving this payee.`,
    )
  return {
    ok: true,
    accountName: resolvedName,
    accountSuffix: number.slice(-4),
    bankCode: input.resolved.bankCode,
  }
}

export type PayoutReviewInput = {
  beneficiary: {
    id: string
    version: number
    status: "UNVERIFIED" | "VERIFIED" | "DISABLED"
    accountName: string
    accountSuffix: string
    bankName: string
    currencyCode: string
  }
  debitAccount: { id: string; name: string; currencyCode: string }
  /** v1: the supplier bill this payout settles. */
  source: { purpose: string; id: string }
  amountMinor: number
  feeMinor: number
  currencyCode: string
  actor: { role: string }
  payoutsStopped: boolean
}

/** The exact facts a person reviews; the digest binds approval to them. */
export function decidePayoutReview(input: PayoutReviewInput):
  | {
      ok: true
      review: {
        payee: string
        accountSuffix: string
        bank: string
        debitAccount: string
        amountMinor: number
        feeMinor: number
        payeeReceivesMinor: number
        totalDebitMinor: number
        currencyCode: string
        purpose: PayoutPurpose
        sourceId: string
        feeExpenseCategory: string
      }
      digest: string
    }
  | PayoutRefusal {
  const { beneficiary, debitAccount } = input
  if (input.payoutsStopped)
    return refuse(
      "PAYOUTS_STOPPED",
      "Payouts are stopped for this business. The Owner can turn them back on.",
    )
  if (!canApprovePayouts(input.actor.role))
    return refuse(
      "FORBIDDEN",
      "Only an Owner or Admin can approve payouts. You can prepare a draft for them.",
    )
  const purpose = payoutPolicy.purposes.find(
    (value) => value === input.source.purpose,
  )
  if (!purpose || !input.source.id.trim())
    return refuse(
      "PURPOSE_NOT_ALLOWED",
      "Payouts can only pay a recorded supplier bill for now.",
    )
  if (beneficiary.status !== "VERIFIED")
    return refuse(
      "BENEFICIARY_UNVERIFIED",
      "Verify this payee's bank account before paying them.",
    )
  if (
    !positiveMinor(input.amountMinor) ||
    !Number.isSafeInteger(input.feeMinor) ||
    input.feeMinor < 0
  )
    return refuse("INVALID_AMOUNT", "Enter an amount greater than zero.")
  const currency = input.currencyCode.toUpperCase()
  if (
    beneficiary.currencyCode.toUpperCase() !== currency ||
    debitAccount.currencyCode.toUpperCase() !== currency
  )
    return refuse(
      "CURRENCY_MISMATCH",
      "The payee, the paying account and the amount must use one currency.",
    )
  // The business bears the fee: the supplier receives the reviewed amount.
  const payeeReceivesMinor = input.amountMinor
  const totalDebitMinor = input.amountMinor + input.feeMinor
  // Exact representability, not a business limit: every derived value is safe.
  if (!Number.isSafeInteger(totalDebitMinor))
    return refuse("INVALID_AMOUNT", "This amount is too large to process.")
  const review = {
    payee: beneficiary.accountName,
    accountSuffix: beneficiary.accountSuffix,
    bank: beneficiary.bankName,
    debitAccount: debitAccount.name,
    amountMinor: input.amountMinor,
    feeMinor: input.feeMinor,
    payeeReceivesMinor,
    totalDebitMinor,
    currencyCode: currency,
    purpose,
    sourceId: input.source.id,
    feeExpenseCategory: payoutPolicy.feeExpenseCategory,
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        ...review,
        beneficiaryId: beneficiary.id,
        beneficiaryVersion: beneficiary.version,
        debitAccountId: debitAccount.id,
      }),
    )
    .digest("hex")
  return { ok: true, review, digest }
}

export const stepUpMaxAgeMs = 5 * 60 * 1000

/**
 * The in-app step-up (re-entered credential or device check, verified by the
 * caller) must be fresh, by the approving user, and for this exact review.
 */
export function decideStepUp(input: {
  reviewDigest: string
  approverUserId: string
  stepUp: { userId: string; reviewDigest: string; verifiedAt: Date } | null
  now: Date
}): { ok: true } | PayoutRefusal {
  const { stepUp } = input
  if (!stepUp)
    return refuse("STEP_UP_REQUIRED", "Confirm it's you before sending money.")
  if (
    stepUp.userId !== input.approverUserId ||
    stepUp.reviewDigest !== input.reviewDigest
  )
    return refuse(
      "STEP_UP_MISMATCH",
      "The payout changed after you confirmed. Review it and confirm again.",
    )
  if (
    !validTime(input.now) ||
    !validTime(stepUp.verifiedAt) ||
    input.now.getTime() - stepUp.verifiedAt.getTime() > stepUpMaxAgeMs ||
    stepUp.verifiedAt.getTime() > input.now.getTime()
  )
    return refuse(
      "STEP_UP_STALE",
      "Confirm it's you again to send this payout.",
    )
  return { ok: true }
}

/**
 * Stable provider reference, fixed when the payout is approved and stored
 * before any call (lowercase a-z, 0-9, '-' and '_', at least 16 characters).
 * Paystack documents retrying an inconclusive request with the SAME reference
 * to avoid double crediting, and treats a new reference as a new transfer; so
 * one payout has exactly one reference for its whole life. Documented behavior
 * is not yet exercised in sandbox.
 */
export function payoutReference(payoutIntentId: string) {
  const digest = createHash("sha256")
    .update(payoutIntentId)
    .digest("hex")
    .slice(0, 32)
  return `po_${digest}`
}

/**
 * Local lifecycle. Paystack's merchant-URL approval statuses map in:
 * `received` (awaiting approval) is nonterminal like PENDING; `blocked` and
 * `rejected` are terminal refusals with no money moved. None of them is a
 * settlement.
 */
export type PayoutStatus =
  | "APPROVED"
  | "SUBMITTING"
  | "RECEIVED"
  | "PENDING"
  | "UNKNOWN"
  | "SUCCEEDED"
  | "FAILED"
  | "REVERSED"
  | "ABANDONED"
  | "BLOCKED"
  | "REJECTED"
const terminal = new Set<PayoutStatus>([
  "SUCCEEDED",
  "FAILED",
  "REVERSED",
  "ABANDONED",
  "BLOCKED",
  "REJECTED",
])
export function payoutStatusFromProvider(status: string): PayoutStatus | null {
  const map: Record<string, PayoutStatus> = {
    pending: "PENDING",
    received: "RECEIVED",
    otp: "PENDING",
    success: "SUCCEEDED",
    failed: "FAILED",
    reversed: "REVERSED",
    abandoned: "ABANDONED",
    blocked: "BLOCKED",
    rejected: "REJECTED",
  }
  return map[status.toLowerCase()] ?? null
}

/**
 * First submission once; afterwards the reference is looked up. Only when the
 * provider definitively has no transfer for the reference may the same
 * reference be submitted again — never a new one. The payouts stop blocks new
 * submissions but never lookups.
 */
export function decidePayoutDispatch(input: {
  status: PayoutStatus
  submissionCount: number
  /** Result of verify-by-reference, when one was made. */
  lookup: "found" | "not_found" | "inconclusive" | null
  payoutsStopped: boolean
}):
  | { action: "submit" }
  | { action: "resubmit_same_reference" }
  | { action: "verify_by_reference" }
  | { action: "none"; reason: "settled" | "stopped" }
  | PayoutRefusal {
  if (terminal.has(input.status)) return { action: "none", reason: "settled" }
  if (input.status === "APPROVED" && input.submissionCount === 0)
    return input.payoutsStopped
      ? { action: "none", reason: "stopped" }
      : { action: "submit" }
  if (
    input.status === "SUBMITTING" ||
    input.status === "UNKNOWN" ||
    input.status === "APPROVED"
  ) {
    if (input.lookup === "not_found")
      return input.payoutsStopped
        ? { action: "none", reason: "stopped" }
        : { action: "resubmit_same_reference" }
    return { action: "verify_by_reference" }
  }
  if (input.status === "PENDING" || input.status === "RECEIVED")
    return { action: "verify_by_reference" }
  return refuse("NOT_DISPATCHABLE", "This payout can't be sent.")
}
