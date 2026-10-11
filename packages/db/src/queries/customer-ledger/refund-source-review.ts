import type { CommercialPaymentMethod, Prisma } from "../../../generated/prisma/client"
import { FinanceError, financeAmount } from "../finance/rules"

export type HeldCreditRefundSourceInput = {
  creditEntryId: string
  amountMinor: string
  moneyAccountId: string
  method: CommercialPaymentMethod
  effectiveAt: Date
}

/** Shared provenance and available-funds validation; caller supplies scoped Book/account. */
export async function reviewHeldCreditRefundSource(
  tx: Prisma.TransactionClient,
  input: HeldCreditRefundSourceInput,
  book: { id: string },
  account: { id: string },
) {
  const amount = financeAmount(input.amountMinor)
  const credit = await tx.customerLedgerEntry.findFirst({
    where: {
      id: input.creditEntryId,
      accountId: account.id,
      side: "CREDIT",
      kind: { in: ["OPENING_CREDIT", "RECEIPT"] },
      reversals: { none: {} },
    },
  })
  if (!credit)
    throw new FinanceError(
      "NOT_FOUND",
      "Held credit not found in this customer account.",
    )
  if (input.effectiveAt < credit.effectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Money cannot be returned before its credit was recorded.",
    )
  // Verify that the selected subledger credit really controls held funds in this book.
  const source =
    credit.kind === "RECEIPT"
      ? { sourceKind: "CUSTOMER_RECEIPT", sourceId: credit.sourceId }
      : { sourceKind: "CUSTOMER_LEDGER_OPENING", sourceId: credit.id }
  const posting = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: { bookId: book.id, ...source },
    },
    include: {
      reversal: { select: { id: true } },
      lines: {
        include: { account: { select: { purpose: true, kind: true } } },
      },
    },
  })
  const heldPosting = posting?.lines.reduce(
    (sum, line) =>
      line.account.purpose === "CUSTOMER_ADVANCE" &&
      line.account.kind === "LIABILITY"
        ? sum + line.creditMinor - line.debitMinor
        : sum,
    BigInt(0),
  )
  const receipt =
    credit.kind === "RECEIPT"
      ? await tx.customerLedgerReceipt.findFirst({
          where: {
            id: credit.sourceId,
            entryId: credit.id,
            accountId: account.id,
            bookId: book.id,
          },
          select: { id: true },
        })
      : null
  if (
    !posting ||
    posting.reversal ||
    heldPosting !== credit.amountMinor ||
    (credit.kind === "RECEIPT" &&
      (credit.sourceKind !== "CUSTOMER_RECEIPT" || !receipt)) ||
    (credit.kind === "OPENING_CREDIT" &&
      (credit.sourceKind !== "CUSTOMER_OPENING" ||
        credit.sourceId !== `${account.id}:CREDIT`))
  )
    throw new FinanceError(
      "CONFLICT",
      "Reconcile the customer's held-credit posting before returning money.",
    )
  const [allocated, released, money, advance] = await Promise.all([
    tx.customerLedgerAllocation.aggregate({
      where: { accountId: account.id, creditEntryId: credit.id },
      _sum: { amountMinor: true },
    }),
    tx.customerLedgerAllocationRelease.aggregate({
      where: {
        allocation: { accountId: account.id, creditEntryId: credit.id },
      },
      _sum: { amountMinor: true },
    }),
    tx.financeAccount.findFirst({
      where: {
        id: input.moneyAccountId,
        bookId: book.id,
        kind: "ASSET",
        purpose: { in: ["CASH", "BANK", "CLEARING"] },
        archivedAt: null,
      },
    }),
    tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
    }),
  ])
  const used =
    (allocated._sum.amountMinor ?? BigInt(0)) -
    (released._sum.amountMinor ?? BigInt(0))
  if (used < BigInt(0) || amount > credit.amountMinor - used)
    throw new FinanceError(
      "CONFLICT",
      "Refund exceeds unused held credit. Release any charge allocations first.",
    )
  if (!money || !advance)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose an active money account in this financial book.",
    )
  if (
    (input.method === "CASH" && money.purpose !== "CASH") ||
    (input.method === "BANK_TRANSFER" && money.purpose !== "BANK") ||
    (["CARD", "POS"].includes(input.method) && money.purpose === "CASH")
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "The money account does not match the refund method.",
    )
  return { credit, money, advance, amount, availableBefore: credit.amountMinor - used, availableAfter: credit.amountMinor - used - amount }
}
