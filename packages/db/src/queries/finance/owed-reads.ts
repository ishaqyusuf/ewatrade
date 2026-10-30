import type { PrismaClient } from "../../../generated/prisma/client"
import { listCustomerLedgerBalances } from "../customer-ledger/totals-projection"
import { type FinanceActor, assertFinanceManager } from "./access"
import { getFinanceManagerBookSnapshot } from "./manager-snapshot"
import { getFinanceOwedSummaryProjection } from "./owed-summary-projection"
import {
  type FinanceReadBookScope,
  financeReadBookIdentity,
} from "./read-book-scope"
import { FinanceError } from "./rules"

/**
 * Who owes what, for the Finance overview: what saved customers owe in the
 * book currency and what the business owes its suppliers, with the largest few.
 */
export async function getFinanceOwedSummary(
  db: PrismaClient,
  input: FinanceActor & FinanceReadBookScope,
) {
  return db.$transaction(
    async (tx) => {
      const book = await getFinanceManagerBookSnapshot(tx, input)
      const projection = await getFinanceOwedSummaryProjection(tx, {
        tenantId: input.tenantId,
        currencyCode: book.currencyCode,
        bookId: book.id,
        snapshot: book.lastSequence,
      })
      return {
        ...financeReadBookIdentity(input, book.id),
        currencyCode: book.currencyCode,
        ...projection,
      }
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
