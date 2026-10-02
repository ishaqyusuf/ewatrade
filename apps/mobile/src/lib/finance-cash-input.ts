import type { FinanceCommandRecoveryMetadata } from "@ewatrade/utils/finance-command-identity"
import { parseFinanceCashCount } from "@ewatrade/utils/finance-money"
import { financeUtcDate } from "./finance-expense-input"

export type CashReviewSource = {
  id: string
  asOf: Date | string
  currentSnapshotSequence: string
  differenceMinor: string
  reviewRequired: boolean
  adjustment: { id: string; reversal: { id: string } | null } | null
}
function reasonValue(reason: string) {
  const value = reason.trim()
  if (!value || value.length > 400)
    throw new Error("Enter an investigated reason of up to 400 characters.")
  return value
}
export function prepareCashCount(input: {
  bookId: string
  accountId: string
  activeCashAccountIds: string[]
  startsAt: Date | string
  asOf: Date
  amount: string
  reference: string
  now?: Date
}) {
  if (!input.activeCashAccountIds.includes(input.accountId))
    throw new Error("Choose an active cash account in this book.")
  const reference = input.reference.trim()
  if (!reference || reference.length > 200)
    throw new Error("Enter a count reference of up to 200 characters.")
  if (
    !Number.isFinite(input.asOf.getTime()) ||
    input.asOf < new Date(input.startsAt) ||
    input.asOf > (input.now ?? new Date())
  )
    throw new Error("The count time must be between bookkeeping start and now.")
  return {
    bookId: input.bookId,
    accountId: input.accountId,
    asOf: new Date(input.asOf),
    observedBalanceMinor: parseFinanceCashCount(input.amount),
    reference,
  }
}
function snapshot(
  count: CashReviewSource,
  metadata?: FinanceCommandRecoveryMetadata,
) {
  if (metadata?.countId && metadata.countId !== count.id)
    throw new Error(
      "Another count needs recovery. Review the earlier submission first.",
    )
  return metadata?.expectedSnapshotSequence ?? count.currentSnapshotSequence
}
export function prepareCashAdjustment(input: {
  bookId: string
  count: CashReviewSource
  reason: string
  metadata?: FinanceCommandRecoveryMetadata
}) {
  if (input.count.adjustment)
    throw new Error(
      "This count already has an adjustment. Review its retained history.",
    )
  if (input.count.reviewRequired)
    throw new Error(
      "Earlier cash history changed. Correct missing records and make a fresh count before adjusting.",
    )
  const difference = BigInt(input.count.differenceMinor)
  const amount = difference < 0n ? -difference : difference
  if (amount === 0n || amount > 100_000_000_000_000n)
    throw new Error(
      "Only a nonzero investigated difference within the transaction limit can be adjusted.",
    )
  return {
    bookId: input.bookId,
    countId: input.count.id,
    expectedSnapshotSequence: snapshot(input.count, input.metadata),
    reason: reasonValue(input.reason),
  }
}
export function prepareCashAdjustmentReversal(input: {
  bookId: string
  count: CashReviewSource
  reason: string
  date: string
  metadata?: FinanceCommandRecoveryMetadata
  now?: Date
}) {
  const adjustment = input.count.adjustment
  if (!adjustment || adjustment.reversal)
    throw new Error(
      "Choose an original cash adjustment that has not been reversed.",
    )
  if (input.metadata?.entryId && input.metadata.entryId !== adjustment.id)
    throw new Error(
      "The original adjustment changed. Review the earlier submission first.",
    )
  const original = new Date(input.count.asOf)
  const requested = financeUtcDate(
    input.date,
    `${original.toISOString().slice(0, 10)}T00:00:00.000Z`,
  )
  if (input.date > (input.now ?? new Date()).toISOString().slice(0, 10))
    throw new Error("Choose a correction date no later than today (UTC).")
  return {
    bookId: input.bookId,
    entryId: adjustment.id,
    expectedSnapshotSequence: snapshot(input.count, input.metadata),
    reason: reasonValue(input.reason),
    effectiveAt: requested < original ? original : requested,
  }
}
