export type FinanceCloseCheckStatus = "PASS" | "BLOCKED" | "REVIEW_REQUIRED"

export type FinanceCloseChecklistEvidence = {
  bookId: string
  currencyCode: string
  from: Date | string
  through: Date | string
  snapshotSequence: string
  dateLockEligible: boolean
  operationallyReconciled: false
  checks: Array<{ id: string; status: FinanceCloseCheckStatus }>
  trialBalance: { balanced: boolean; differenceMinor: string }
}

export function assertFinanceCloseChecklistScope(input: {
  checklist: FinanceCloseChecklistEvidence
  bookId: string
  currencyCode: string
  from: Date | string
  through: Date | string
  snapshotSequence: string
}) {
  const { checklist } = input
  if (
    checklist.bookId !== input.bookId ||
    checklist.currencyCode !== input.currencyCode ||
    new Date(checklist.from).getTime() !== new Date(input.from).getTime() ||
    new Date(checklist.through).getTime() !==
      new Date(input.through).getTime() ||
    checklist.snapshotSequence !== input.snapshotSequence ||
    checklist.operationallyReconciled !== false
  )
    throw new Error(
      "The close checklist changed. Refresh the period before reviewing again.",
    )
}

export function financeCloseChecklistCanProceed(
  checklist: Pick<
    FinanceCloseChecklistEvidence,
    "dateLockEligible" | "checks" | "trialBalance"
  >,
) {
  return (
    checklist.dateLockEligible &&
    checklist.trialBalance.balanced &&
    checklist.trialBalance.differenceMinor === "0" &&
    checklist.checks.every((check) => check.status !== "BLOCKED")
  )
}

export function financeCloseChecklistMatchesReview(
  current: FinanceCloseChecklistEvidence,
  reviewed: FinanceCloseChecklistEvidence,
) {
  return JSON.stringify(current) === JSON.stringify(reviewed)
}
