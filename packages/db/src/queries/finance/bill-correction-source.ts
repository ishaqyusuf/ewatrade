import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { FinanceError } from "./rules"
export type Correction = FinanceActor & {
  bookId: string
  clientCommandId: string
  effectiveAt: Date
  reason: string
}

export function correctionReason(input: Omit<Correction, "clientCommandId">) {
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

export async function readBillCorrectionPosting(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId">,
  source: {
    kind: "EXPENSE_BILL" | "BILL_PAYMENT" | "OWNER_BILL_PAYMENT"
    id: string
  },
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
  return original
}
export async function readBillPaymentCorrectionSource(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId"> & { paymentId: string },
) {
  const payment = await tx.financeBillPayment.findFirst({
    where: { id: input.paymentId, bookId: input.bookId },
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
  return payment
}
export async function readExpenseVoidSource(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId"> & { billId: string },
) {
  const bill = await tx.financeBill.findFirst({
    where: { id: input.billId, bookId: input.bookId },
  })
  if (!bill)
    throw new FinanceError("NOT_FOUND", "Expense not found in this business.")
  if (bill.kind !== "EXPENSE" || bill.voidedAt)
    throw new FinanceError(
      "CONFLICT",
      "Only an active expense can be cancelled here.",
    )
  const [activePayments, reversedPayments] = await Promise.all([
    tx.financeBillPayment.count({
      where: { bookId: input.bookId, billId: bill.id, reversedAt: null },
    }),
    tx.financeBillPayment.aggregate({
      where: { bookId: input.bookId, billId: bill.id },
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
  return bill
}
