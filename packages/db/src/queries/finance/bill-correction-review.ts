import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import {
  type Correction,
  correctionReason,
  readBillCorrectionPosting,
  readBillPaymentCorrectionSource,
  readExpenseVoidSource,
} from "./bill-correction-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
async function context(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId">,
) {
  await assertFinanceManager(tx, input)
  const reason = correctionReason(input)
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
  return { book, reason }
}
async function postingReview(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId">,
  source: Parameters<typeof readBillCorrectionPosting>[2],
) {
  const posting = await readBillCorrectionPosting(tx, input, source)
  const accounts = await tx.financeAccount.findMany({
    where: {
      bookId: input.bookId,
      id: { in: posting.lines.map((line) => line.accountId) },
      archivedAt: null,
    },
    select: { id: true, name: true },
  })
  if (
    new Set(posting.lines.map((line) => line.accountId)).size !==
    accounts.length
  )
    throw new FinanceError(
      "NOT_FOUND",
      "An original posting account is unavailable.",
    )
  return {
    originalEntryId: posting.id,
    originalEffectiveAt: posting.effectiveAt.toISOString(),
    lines: posting.lines.map((line) => ({
      accountId: line.accountId,
      accountName: accounts.find((account) => account.id === line.accountId)!
        .name,
      debitMinor: line.creditMinor.toString(),
      creditMinor: line.debitMinor.toString(),
    })),
  }
}
export async function getFinanceBillPaymentReversalReview(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId"> & { paymentId: string },
) {
  const { book, reason } = await context(tx, input)
  const payment = await readBillPaymentCorrectionSource(tx, input)
  const posting = await postingReview(tx, input, {
    kind:
      payment.account.purpose === "CAPITAL"
        ? "OWNER_BILL_PAYMENT"
        : "BILL_PAYMENT",
    id: payment.id,
  })
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    closedThrough: book.closedThrough?.toISOString() ?? null,
    billId: payment.billId,
    paymentId: payment.id,
    payeeName: payment.bill.payeeName,
    description: payment.bill.description,
    amountMinor: payment.amountMinor.toString(),
    paidBeforeMinor: payment.bill.paidMinor.toString(),
    paidAfterMinor: (payment.bill.paidMinor - payment.amountMinor).toString(),
    outstandingBeforeMinor: (
      payment.bill.totalMinor - payment.bill.paidMinor
    ).toString(),
    outstandingAfterMinor: (
      payment.bill.totalMinor -
      payment.bill.paidMinor +
      payment.amountMinor
    ).toString(),
    funding:
      payment.account.purpose === "CAPITAL"
        ? ("OWNER_CAPITAL" as const)
        : ("BUSINESS_ACCOUNT" as const),
    effectiveAt: input.effectiveAt.toISOString(),
    reason,
    ...posting,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
export async function getFinanceExpenseVoidReview(
  tx: Prisma.TransactionClient,
  input: Omit<Correction, "clientCommandId"> & { billId: string },
) {
  const { book, reason } = await context(tx, input)
  const bill = await readExpenseVoidSource(tx, input)
  const posting = await postingReview(tx, input, {
    kind: "EXPENSE_BILL",
    id: bill.id,
  })
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    closedThrough: book.closedThrough?.toISOString() ?? null,
    billId: bill.id,
    payeeName: bill.payeeName,
    description: bill.description,
    totalMinor: bill.totalMinor.toString(),
    outstandingBeforeMinor: bill.totalMinor.toString(),
    outstandingAfterMinor: "0",
    effectiveAt: input.effectiveAt.toISOString(),
    reason,
    ...posting,
    moneyTransfer: "NOT_PERFORMED" as const,
  }
}
