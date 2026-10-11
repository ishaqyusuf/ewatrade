import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import type { FinanceBillPaymentInput } from "./bills"
import {
  normalizeFinanceBillPayment,
  reviewFinanceBillPaymentSource,
} from "./bill-payment-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
/** Advisory evidence; execution repeats source checks while holding the Book lock. */
export async function getFinanceBillPaymentReview(
  tx: Prisma.TransactionClient,
  input: Omit<FinanceBillPaymentInput, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  const { amount, ownerFunded } = normalizeFinanceBillPayment(input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const { bill, account, payable } = await reviewFinanceBillPaymentSource(
    tx,
    input,
    book,
  )
  if (payable.archivedAt)
    throw new FinanceError("NOT_FOUND", "The payable account is unavailable.")
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    billId: bill.id,
    payeeName: bill.payeeName,
    description: bill.description,
    incurredAt: bill.incurredAt.toISOString(),
    dueAt: bill.dueAt?.toISOString() ?? null,
    totalMinor: bill.totalMinor.toString(),
    paidBeforeMinor: bill.paidMinor.toString(),
    paidAfterMinor: (bill.paidMinor + amount).toString(),
    outstandingBeforeMinor: (bill.totalMinor - bill.paidMinor).toString(),
    outstandingAfterMinor: (
      bill.totalMinor -
      bill.paidMinor -
      amount
    ).toString(),
    funding: ownerFunded
      ? ("OWNER_CAPITAL" as const)
      : ("BUSINESS_ACCOUNT" as const),
    accountId: account.id,
    accountName: account.name,
    payableAccountId: payable.id,
    payableAccountName: payable.name,
    amountMinor: amount.toString(),
    effectiveAt: input.effectiveAt.toISOString(),
    reference: input.reference?.trim() || null,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
