import type { Prisma } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError, assertFinancePostingDate } from "../finance/rules"
import { type HeldCreditRefundSourceInput, reviewHeldCreditRefundSource } from "./refund-source-review"

/** Read-only preview of money already returned by the merchant; no provider payout. */
export async function getCustomerLedgerCreditRefundReview(
  tx: Prisma.TransactionClient,
  input: FinanceActor & HeldCreditRefundSourceInput & { bookId: string; accountId: string },
) {
  await assertFinanceManager(tx, input)
  if (!["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"].includes(input.method) || !Number.isFinite(input.effectiveAt.getTime()))
    throw new FinanceError("INVALID_JOURNAL", "Choose a valid refund method and date.")
  const book = await tx.financeBook.findFirst({ where: { id: input.bookId, tenantId: input.tenantId } })
  const account = await tx.customerLedgerAccount.findFirst({ where: { id: input.accountId, tenantId: input.tenantId }, include: { customer: { select: { name: true } } } })
  if (!book || !account) throw new FinanceError("NOT_FOUND", "Financial Book or customer account not found in this business.")
  if (book.currencyCode !== account.currencyCode)
    throw new FinanceError("INVALID_JOURNAL", "Customer account and book currency must match.")
  assertFinancePostingDate({ effectiveAt: input.effectiveAt, startsAt: book.startsAt, closedThrough: book.closedThrough, now: new Date() })
  const source = await reviewHeldCreditRefundSource(tx, input, book, account)
  return {
    bookId: book.id, accountId: account.id, customerId: account.customerId, customerName: account.customer.name,
    currencyCode: book.currencyCode, accountRevision: account.revision.toString(),
    creditEntryId: source.credit.id, creditKind: source.credit.kind,
    amountMinor: source.amount.toString(), availableBeforeMinor: source.availableBefore.toString(),
    availableAfterMinor: source.availableAfter.toString(),
    moneyAccountId: source.money.id, moneyAccountName: source.money.name,
    method: input.method, effectiveAt: input.effectiveAt.toISOString(),
    effect: "RECORD_MONEY_ALREADY_RETURNED" as const,
    providerRefund: "NOT_REQUESTED" as const,
    orderCancellation: "NOT_PERFORMED" as const,
  }
}
