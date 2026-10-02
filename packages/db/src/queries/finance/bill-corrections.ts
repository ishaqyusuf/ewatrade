import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import { FinanceError } from "./rules"

type Correction = FinanceActor & {
  bookId: string
  clientCommandId: string
  effectiveAt: Date
  reason: string
}

function correctionReason(input: Correction) {
  const reason = input.reason.trim()
  if (
    !reason ||
    reason.length > 400 ||
    !Number.isFinite(input.effectiveAt.getTime())
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A correction requires a valid date and reason of up to 400 characters.",
    )
  }
  return reason
}

async function reverseBillSource(
  tx: Prisma.TransactionClient,
  input: Correction,
  source: {
    kind: "EXPENSE_BILL" | "BILL_PAYMENT" | "OWNER_BILL_PAYMENT"
    id: string
  },
  reason: string,
) {
  const original = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: input.bookId,
        sourceKind: source.kind,
        sourceId: source.id,
      },
    },
    include: { lines: true, reversal: { select: { id: true } } },
  })
  if (!original || original.reversal || original.reversalOfId)
    throw new FinanceError(
      "CONFLICT",
      "The original financial posting is unavailable or already reversed.",
    )
  if (input.effectiveAt < original.effectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A correction cannot precede the original posting.",
    )
  await postFinanceJournalInTransaction(tx, {
    ...input,
    clientCommandId: financePostingCommandId(
      input.clientCommandId,
      "bill-correction",
    ),
    sourceKind: `${source.kind}_REVERSAL`,
    sourceId: original.id,
    reversalOfId: original.id,
    description: `Reversal: ${reason}`,
    storeId: original.storeId ?? undefined,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      side: line.debitMinor > BigInt(0) ? "CREDIT" : "DEBIT",
      amountMinor: (line.debitMinor > BigInt(0)
        ? line.debitMinor
        : line.creditMinor
      ).toString(),
      description: line.description ?? undefined,
    })),
  })
}

export async function reverseFinanceBillPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: Correction & { paymentId: string },
) {
  const reason = correctionReason(input)
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_BILL_PAYMENT",
    { paymentId: input.paymentId, effectiveAt: input.effectiveAt, reason },
    async (book) => {
      const payment = await tx.financeBillPayment.findFirst({
        where: { id: input.paymentId, bookId: book.id },
        include: { bill: true, account: { select: { purpose: true } } },
      })
      if (!payment)
        throw new FinanceError(
          "NOT_FOUND",
          "Bill payment not found in this business.",
        )
      if (
        payment.reversedAt ||
        payment.bill.voidedAt ||
        payment.bill.kind !== "EXPENSE"
      )
        throw new FinanceError(
          "CONFLICT",
          "Only an active expense payment can be reversed here.",
        )
      if (payment.bill.paidMinor < payment.amountMinor)
        throw new FinanceError(
          "CONFLICT",
          "The bill settlement needs reconciliation before correction.",
        )
      await reverseBillSource(
        tx,
        input,
        {
          kind:
            payment.account.purpose === "CAPITAL"
              ? "OWNER_BILL_PAYMENT"
              : "BILL_PAYMENT",
          id: payment.id,
        },
        reason,
      )
      await tx.financeBillPayment.update({
        where: { id: payment.id },
        data: {
          reversedAt: new Date(),
          reversalEffectiveAt: input.effectiveAt,
          reversedById: input.actorUserId,
          reversalReason: reason,
        },
      })
      await tx.financeBill.update({
        where: { id: payment.billId },
        data: { paidMinor: { decrement: payment.amountMinor } },
      })
      return { id: payment.id }
    },
  )
}

export async function voidFinanceExpenseInTransaction(
  tx: Prisma.TransactionClient,
  input: Correction & { billId: string },
) {
  const reason = correctionReason(input)
  return financeDocumentCommand(
    tx,
    input,
    "VOID_EXPENSE",
    { billId: input.billId, effectiveAt: input.effectiveAt, reason },
    async (book) => {
      const bill = await tx.financeBill.findFirst({
        where: { id: input.billId, bookId: book.id },
      })
      if (!bill)
        throw new FinanceError(
          "NOT_FOUND",
          "Expense not found in this business.",
        )
      if (bill.kind !== "EXPENSE" || bill.voidedAt)
        throw new FinanceError(
          "CONFLICT",
          "Only an active expense can be cancelled here.",
        )
      const [activePayments, reversedPayments] = await Promise.all([
        tx.financeBillPayment.count({
          where: { bookId: book.id, billId: bill.id, reversedAt: null },
        }),
        tx.financeBillPayment.aggregate({
          where: { bookId: book.id, billId: bill.id },
          _max: { reversalEffectiveAt: true },
        }),
      ])
      if (bill.paidMinor !== BigInt(0) || activePayments > 0)
        throw new FinanceError(
          "CONFLICT",
          "Reverse the expense payments before cancelling this bill.",
        )
      if (
        reversedPayments._max.reversalEffectiveAt &&
        input.effectiveAt < reversedPayments._max.reversalEffectiveAt
      )
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Cancellation cannot precede its payment reversals.",
        )
      await reverseBillSource(
        tx,
        input,
        { kind: "EXPENSE_BILL", id: bill.id },
        reason,
      )
      await tx.financeBill.update({
        where: { id: bill.id },
        data: {
          voidedAt: new Date(),
          voidEffectiveAt: input.effectiveAt,
          voidedById: input.actorUserId,
          voidReason: reason,
        },
      })
      return { id: bill.id }
    },
  )
}

export async function reverseFinanceBillPayment(
  db: PrismaClient,
  input: Correction & { paymentId: string },
) {
  return db.$transaction(
    (tx) => reverseFinanceBillPaymentInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function voidFinanceExpense(
  db: PrismaClient,
  input: Correction & { billId: string },
) {
  return db.$transaction((tx) => voidFinanceExpenseInTransaction(tx, input), {
    maxWait: 10_000,
    timeout: 30_000,
  })
}
