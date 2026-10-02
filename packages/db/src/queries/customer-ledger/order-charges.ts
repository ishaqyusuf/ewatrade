import type {
  CustomerLedgerAccount,
  CustomerLedgerEntry,
  FinanceBook,
  Prisma,
} from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"

/** The caller already holds book and customer locks. */
export async function lockPostedCustomerOrderCharge(
  tx: Prisma.TransactionClient,
  input: {
    book: FinanceBook
    account: CustomerLedgerAccount
    charge: CustomerLedgerEntry
  },
) {
  const { book, account, charge } = input
  if (
    charge.kind !== "ORDER_CHARGE" ||
    charge.side !== "DEBIT" ||
    charge.accountId !== account.id ||
    charge.tenantId !== book.tenantId ||
    charge.sourceKind !== "COMMERCIAL_ORDER_BILLED" ||
    !charge.orderId ||
    charge.sourceId !== charge.orderId
  )
    throw new FinanceError("CONFLICT", "Choose a posted customer Order charge.")
  await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE id = ${charge.orderId} AND "tenantId" = ${book.tenantId} FOR UPDATE`
  const order = await tx.commercialOrder.findFirst({
    where: { id: charge.orderId, tenantId: book.tenantId },
  })
  const billing = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: "COMMERCIAL_ORDER_BILLED",
        sourceId: charge.orderId,
      },
    },
  })
  if (
    !order ||
    !billing ||
    order.customerId !== account.customerId ||
    order.currencyCode !== account.currencyCode ||
    account.currencyCode !== book.currencyCode ||
    charge.amountMinor !== BigInt(order.totalMinor)
  )
    throw new FinanceError(
      "CONFLICT",
      "The customer charge must reconcile to its Order and financial billing source.",
    )
  return order
}
