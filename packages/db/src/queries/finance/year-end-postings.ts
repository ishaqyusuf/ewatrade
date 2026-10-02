import {
  FinanceError,
  type FinanceLineInput,
  MAX_FINANCE_AMOUNT,
  validateFinanceLines,
} from "./rules"

type YearEndAccount = {
  accountId: string
  bookId: string
  kind: string
  closingDebitMinor: string
  closingCreditMinor: string
  archivedAt: Date | null
}

type YearEndPostingInput = {
  bookId: string
  retainedEarnings: {
    accountId: string
    bookId: string
    kind: string
    purpose: string
    archivedAt: Date | null
  }
  temporaryAccounts: YearEndAccount[]
}

const ZERO = BigInt(0)
// Aggregate balances can exceed one BIGINT column; each emitted line cannot.
// Bound by the largest possible Book sequence and 100 lines per journal.
const MAX_BALANCE =
  MAX_FINANCE_AMOUNT * BigInt("9223372036854775807") * BigInt(100)
const TEMPORARY_LINES_PER_JOURNAL = 49

function balanceAmount(value: string) {
  if (!/^(0|[1-9]\d{0,34})$/.test(value))
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Year-end balances must be exact whole minor-unit amounts.",
    )
  const amount = BigInt(value)
  if (amount > MAX_BALANCE)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "A year-end account balance exceeds the supported ledger range.",
    )
  return amount
}

/**
 * Internal posting composer, not a source authority or public journal endpoint.
 * Validate the entire held-Book account set eagerly before returning a bounded
 * journal iterator. The owning year-end repository must prove fiscal/source
 * completeness and preserve the iterator order in its atomic command.
 */
export function composeFinanceYearEndPostings(input: YearEndPostingInput) {
  const target = input.retainedEarnings
  if (
    !input.bookId.trim() ||
    !target.accountId.trim() ||
    target.bookId !== input.bookId ||
    target.kind !== "EQUITY" ||
    target.purpose !== "RETAINED_EARNINGS" ||
    target.archivedAt !== null
  )
    throw new FinanceError(
      "CONFLICT",
      "Select an active retained-earnings account in the original financial book.",
    )
  if (input.temporaryAccounts.length > 200)
    throw new FinanceError(
      "CONFLICT",
      "The complete temporary-account review exceeds the supported account bound.",
    )
  const ids = new Set<string>()
  const balances = input.temporaryAccounts
    .map((account) => {
      if (
        !account.accountId.trim() ||
        account.bookId !== input.bookId ||
        !["INCOME", "EXPENSE"].includes(account.kind) ||
        account.accountId === target.accountId ||
        ids.has(account.accountId)
      )
        throw new FinanceError(
          "CONFLICT",
          "Year-end requires every original temporary account exactly once in the same book.",
        )
      ids.add(account.accountId)
      const debit = balanceAmount(account.closingDebitMinor)
      const credit = balanceAmount(account.closingCreditMinor)
      if (debit !== ZERO && credit !== ZERO)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Year-end requires net closing balances rather than gross journal movement.",
        )
      const netDebit = debit - credit
      if (netDebit !== ZERO && account.archivedAt !== null)
        throw new FinanceError(
          "CONFLICT",
          "Restore an archived temporary account with a remaining balance before year-end.",
        )
      return { accountId: account.accountId, netDebit }
    })
    .sort((left, right) =>
      left.accountId < right.accountId
        ? -1
        : left.accountId > right.accountId
          ? 1
          : 0,
    )
  const earnings = balances.reduce((sum, row) => sum - row.netDebit, ZERO)
  const retainedEarningsId = target.accountId
  const temporaryLineCount = balances.reduce((sum, row) => {
    const magnitude = row.netDebit < ZERO ? -row.netDebit : row.netDebit
    return (
      sum + (magnitude + MAX_FINANCE_AMOUNT - BigInt(1)) / MAX_FINANCE_AMOUNT
    )
  }, ZERO)
  const batchSize = BigInt(TEMPORARY_LINES_PER_JOURNAL)

  function* journals(): Generator<FinanceLineInput[]> {
    let temporary: FinanceLineInput[] = []
    let debitLessCredit = ZERO
    function balancedJournal() {
      const lines = [...temporary]
      let remaining =
        debitLessCredit < ZERO ? -debitLessCredit : debitLessCredit
      const side = debitLessCredit > ZERO ? "CREDIT" : "DEBIT"
      while (remaining > ZERO) {
        const amount =
          remaining > MAX_FINANCE_AMOUNT ? MAX_FINANCE_AMOUNT : remaining
        lines.push({
          accountId: retainedEarningsId,
          side,
          amountMinor: amount.toString(),
        })
        remaining -= amount
      }
      validateFinanceLines(lines)
      return lines
    }
    for (const row of balances) {
      let remaining = row.netDebit < ZERO ? -row.netDebit : row.netDebit
      const side = row.netDebit > ZERO ? "CREDIT" : "DEBIT"
      while (remaining > ZERO) {
        const amount =
          remaining > MAX_FINANCE_AMOUNT ? MAX_FINANCE_AMOUNT : remaining
        temporary.push({
          accountId: row.accountId,
          side,
          amountMinor: amount.toString(),
        })
        debitLessCredit += side === "DEBIT" ? amount : -amount
        remaining -= amount
        if (temporary.length === TEMPORARY_LINES_PER_JOURNAL) {
          yield balancedJournal()
          temporary = []
          debitLessCredit = ZERO
        }
      }
    }
    if (temporary.length) yield balancedJournal()
  }

  return {
    earningsMinor: earnings.toString(),
    journalCount: (
      (temporaryLineCount + batchSize - BigInt(1)) /
      batchSize
    ).toString(),
    postingLineCountUpperBound: (temporaryLineCount * BigInt(2)).toString(),
    journals: journals(),
  }
}
