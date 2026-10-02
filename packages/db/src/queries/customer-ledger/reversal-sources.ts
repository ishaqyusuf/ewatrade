import type { Prisma } from "../../../generated/prisma/client"

const zero = BigInt(0)

export function lineMatches(
  line: {
    accountId: string
    debitMinor: bigint
    creditMinor: bigint
    account: { kind: string; purpose: string }
  },
  expected: {
    accountId?: string
    kind: string
    purpose: string
    side: "DEBIT" | "CREDIT"
    amount: bigint
  },
) {
  return (
    (!expected.accountId || line.accountId === expected.accountId) &&
    line.account.kind === expected.kind &&
    line.account.purpose === expected.purpose &&
    (expected.side === "DEBIT"
      ? line.debitMinor === expected.amount && line.creditMinor === zero
      : line.creditMinor === expected.amount && line.debitMinor === zero)
  )
}

export function postingLinesMatch(
  lines: Array<{
    accountId: string
    debitMinor: bigint
    creditMinor: bigint
    account: { kind: string; purpose: string }
  }>,
  expected: Parameters<typeof lineMatches>[1][],
) {
  return (
    lines.length === expected.length &&
    expected.every(
      (line) =>
        lines.filter((candidate) => lineMatches(candidate, line)).length === 1,
    )
  )
}

async function findSourceJournal(
  tx: Prisma.TransactionClient,
  bookId: string,
  sourceKind: string,
  sourceId: string,
) {
  return tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: { bookId, sourceKind, sourceId },
    },
    include: {
      reversal: {
        select: {
          id: true,
          sourceKind: true,
          sourceId: true,
          reversalOfId: true,
          effectiveAt: true,
        },
      },
      lines: {
        include: {
          account: { select: { id: true, kind: true, purpose: true } },
        },
      },
    },
  })
}

export async function assertExactHeldCreditSource(
  tx: Prisma.TransactionClient,
  input: { bookId: string; accountId: string },
  credit: {
    id: string
    kind: string
    side: string
    amountMinor: bigint
    sourceKind: string
    sourceId: string
    effectiveAt: Date
  },
  advanceAccountId: string,
) {
  const isReceipt = credit.kind === "RECEIPT"
  if (
    (isReceipt &&
      (credit.side !== "CREDIT" || credit.sourceKind !== "CUSTOMER_RECEIPT")) ||
    (!isReceipt &&
      (credit.kind !== "OPENING_CREDIT" ||
        credit.side !== "CREDIT" ||
        credit.sourceKind !== "CUSTOMER_OPENING" ||
        credit.sourceId !== `${input.accountId}:CREDIT`))
  )
    return false

  const receipt = isReceipt
    ? await tx.customerLedgerReceipt.findFirst({
        where: {
          id: credit.sourceId,
          entryId: credit.id,
          accountId: input.accountId,
          bookId: input.bookId,
        },
      })
    : null
  if (isReceipt && !receipt) return false
  const journal = await findSourceJournal(
    tx,
    input.bookId,
    isReceipt ? "CUSTOMER_RECEIPT" : "CUSTOMER_LEDGER_OPENING",
    isReceipt ? credit.sourceId : credit.id,
  )
  if (
    !journal ||
    journal.reversalOfId !== null ||
    journal.reversal ||
    journal.effectiveAt.getTime() !== credit.effectiveAt.getTime()
  )
    return false

  if (isReceipt && receipt) {
    const money = journal.lines.find(
      (line) => line.accountId === receipt?.moneyAccountId,
    )
    const advance = journal.lines.find(
      (line) => line.accountId === advanceAccountId,
    )
    return (
      journal.lines.length === 2 &&
      !!money &&
      !!advance &&
      ["CASH", "BANK", "CLEARING"].includes(money.account.purpose) &&
      lineMatches(money, {
        accountId: receipt.moneyAccountId,
        kind: "ASSET",
        purpose: money.account.purpose,
        side: "DEBIT",
        amount: credit.amountMinor,
      }) &&
      lineMatches(advance, {
        accountId: advanceAccountId,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        side: "CREDIT",
        amount: credit.amountMinor,
      })
    )
  }

  return postingLinesMatch(journal.lines, [
    {
      accountId: advanceAccountId,
      kind: "LIABILITY",
      purpose: "CUSTOMER_ADVANCE",
      side: "CREDIT",
      amount: credit.amountMinor,
    },
    {
      kind: "EQUITY",
      purpose: "OPENING_EQUITY",
      side: "DEBIT",
      amount: credit.amountMinor,
    },
  ])
}
