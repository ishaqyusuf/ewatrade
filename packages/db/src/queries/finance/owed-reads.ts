import type { PrismaClient } from "../../../generated/prisma/client"
import { listCustomerLedgerBalances } from "../customer-ledger/totals-projection"
import { type FinanceActor, assertFinanceManager } from "./access"
import { assertFinanceManagerSnapshot } from "./manager-snapshot"
import { getFinanceOwedSummaryProjection } from "./owed-summary-projection"
import { FinanceError } from "./rules"

/**
 * Who owes what, for the Finance overview: what saved customers owe in the
 * book currency and what the business owes its suppliers, with the largest few.
 */
export async function getFinanceOwedSummary(
  db: PrismaClient,
  input: FinanceActor & { bookId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManagerSnapshot(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const projection = await getFinanceOwedSummaryProjection(tx, {
        tenantId: input.tenantId,
        currencyCode: book.currencyCode,
        bookId: book.id,
        snapshot: book.lastSequence,
      })
      return { currencyCode: book.currencyCode, ...projection }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

/** What each listed saved customer owes, or has paid ahead, in the book currency. */
export async function listFinanceCustomerBalances(
  db: PrismaClient,
  input: FinanceActor & { customerIds: string[] },
) {
  if (input.customerIds.length > 50)
    throw new FinanceError("INVALID_JOURNAL", "Too many customers requested.")
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      const balances = await listCustomerLedgerBalances(tx, {
        tenantId: input.tenantId,
        currencyCode: tenant.currencyCode,
        customerIds: input.customerIds,
      })
      return {
        currencyCode: tenant.currencyCode,
        items: [...balances].map(([customerId, balance]) => ({
          customerId,
          owedMinor: balance.outstandingDebtMinor,
          paidAheadMinor: balance.availableCreditMinor,
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
