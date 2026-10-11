import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "../finance/access"
import {
  FinanceError,
  financeAmount,
  assertFinancePostingDate,
} from "../finance/rules"
import { getCustomerLedgerTotalsInTransaction } from "./balances"
import { reviewCustomerReceiptAccounts } from "./receipt-account-review"
import type { RecordCustomerLedgerReceiptInput } from "./receipts"

/** Preview new money received; never allocates debt, settles an order or calls a provider. */
export async function getCustomerLedgerReceiptReview(
  tx: Prisma.TransactionClient,
  input: Omit<
    RecordCustomerLedgerReceiptInput,
    "clientCommandId" | "expectedRevision"
  >,
) {
  await assertFinanceManager(tx, input)
  const amount = financeAmount(input.amountMinor)
  if (
    !["CASH", "BANK_TRANSFER", "CARD", "POS", "OTHER"].includes(input.method) ||
    !input.description.trim() ||
    input.description.length > 400 ||
    (input.reference?.length ?? 0) > 160
  )
    throw new FinanceError("INVALID_JOURNAL", "Choose valid receipt details.")
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  const account = await tx.customerLedgerAccount.findFirst({
    where: { id: input.accountId, tenantId: input.tenantId },
    include: { customer: { select: { name: true } } },
  })
  if (!book || !account)
    throw new FinanceError(
      "NOT_FOUND",
      "Financial Book or customer account not found in this business.",
    )
  if (book.currencyCode !== account.currencyCode)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Receipt currency must match the customer account and financial book.",
    )
  const now = new Date()
  assertFinancePostingDate({
    effectiveAt: now,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now,
  })
  const { money } = await reviewCustomerReceiptAccounts(tx, input, book)
  const totals = await getCustomerLedgerTotalsInTransaction(
    tx,
    account.id,
    account.lastSequence,
  )
  return {
    bookId: book.id,
    accountId: account.id,
    customerId: account.customerId,
    customerName: account.customer.name,
    currencyCode: book.currencyCode,
    accountRevision: account.revision.toString(),
    moneyAccountId: money.id,
    moneyAccountName: money.name,
    method: input.method,
    amountMinor: amount.toString(),
    availableBeforeMinor: totals.availableCreditMinor,
    availableAfterMinor: (
      BigInt(totals.availableCreditMinor) + amount
    ).toString(),
    outstandingDebtMinor: totals.outstandingDebtMinor,
    timestampPolicy: "SERVER_NOW" as const,
    effect: "RECORD_MONEY_ALREADY_RECEIVED" as const,
    allocation: "NOT_PERFORMED" as const,
    orderPayment: "NOT_RECORDED" as const,
  }
}
