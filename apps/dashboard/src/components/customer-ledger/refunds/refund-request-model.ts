import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

/**
 * A merchant-entered refund request (MB-01). It records what the customer
 * asked for and where to send it. It doesn't hold or send money, and typing
 * a bank and account number isn't checking that they belong to the customer.
 */

export type RefundRequestPayload = Omit<
  RouterInputs["customerLedger"]["requestRefund"],
  "clientCommandId"
>

export type RefundRequestFields = {
  sourceId: string
  amount: string
  reason: string
  bankName: string
  accountNumber: string
  accountName: string
}

type Account = {
  id: string
  bookId: string
  revision: string
}
type Source = { id: string; remainingAmountMinor: string }

const printable = (value: string) =>
  Array.from(value).every((character) => {
    const code = character.charCodeAt(0)
    return code >= 32 && code !== 127
  })

/**
 * The exact request the server accepts, or the first thing to fix. Amounts
 * are whole minor units checked against the source's current remaining
 * money; the account number keeps its leading zeros.
 */
export function prepareRefundRequest(
  fields: RefundRequestFields,
  context: { account: Account; source: Source | undefined },
): { payload: RefundRequestPayload } | { problem: string } {
  const { account, source } = context
  if (!source || source.id !== fields.sourceId)
    return { problem: "Choose the paid-ahead payment to return from." }
  let amountMinor: string
  try {
    amountMinor = parseFinanceMoney(fields.amount)
  } catch (failure) {
    return {
      problem: failure instanceof Error ? failure.message : "Check the amount.",
    }
  }
  if (BigInt(amountMinor) > BigInt(source.remainingAmountMinor))
    return { problem: "That’s more than is left on this payment." }
  const reason = fields.reason.trim()
  if (!reason) return { problem: "Add a short reason." }
  if (reason.length > 400)
    return { problem: "Keep the reason under 400 characters." }
  const bankName = fields.bankName.trim()
  if (bankName.length < 2 || bankName.length > 120 || !printable(bankName))
    return { problem: "Enter the bank name." }
  const accountNumber = fields.accountNumber.trim()
  if (!/^[A-Za-z0-9]{6,34}$/.test(accountNumber))
    return {
      problem:
        "Enter the account number: 6 to 34 letters or digits, no spaces.",
    }
  const accountName = fields.accountName.trim()
  if (
    accountName.length < 2 ||
    accountName.length > 160 ||
    !printable(accountName)
  )
    return { problem: "Enter the account holder’s name." }
  return {
    payload: {
      bookId: account.bookId,
      accountId: account.id,
      expectedRevision: account.revision,
      creditEntryId: source.id,
      amountMinor,
      reason,
      destination: { bankName, accountNumber, accountName },
    },
  }
}

/**
 * Whether a reviewed request still matches what the server shows now: the
 * same account revision and a source with at least the amount left. A stale
 * review needs going back; an uncertain earlier send is checked first.
 */
export function refundRequestReviewIsCurrent(
  payload: RefundRequestPayload,
  current: { revision: string | undefined; source: Source | undefined },
) {
  return (
    current.revision === payload.expectedRevision &&
    current.source?.id === payload.creditEntryId &&
    BigInt(current.source.remainingAmountMinor) >= BigInt(payload.amountMinor)
  )
}

/**
 * What an unconfirmed earlier send on this customer's account means for a
 * new request. The shared runner keeps one per account, for any operation:
 * - "own": an earlier refund request; its exact retry must reuse the
 *   original account revision the runner kept (never the current one).
 * - "own-unrebuildable": an earlier refund request without that revision;
 *   it can only be checked, not rebuilt.
 * - "other": a different change; check it before starting a request.
 */
export function refundRequestRecovery(
  retained: {
    operation: string
    recoveryMetadata?: { expectedSnapshotSequence?: string }
  } | null,
):
  | { kind: "none" }
  | { kind: "own"; expectedRevision: string }
  | { kind: "own-unrebuildable" }
  | { kind: "other" } {
  if (!retained) return { kind: "none" }
  if (retained.operation !== "requestRefund") return { kind: "other" }
  const revision = retained.recoveryMetadata?.expectedSnapshotSequence
  return revision && /^(0|[1-9]\d{0,18})$/.test(revision)
    ? { kind: "own", expectedRevision: revision }
    : { kind: "own-unrebuildable" }
}
