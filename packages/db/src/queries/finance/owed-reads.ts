import type { PrismaClient } from "../../../generated/prisma/client"
import { listCustomerLedgerBalances } from "../customer-ledger/totals-projection"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"
import { listFinanceSupplierBalances } from "./supplier-reads"

const TOP = 3

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
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const [suppliers, accounts] = await Promise.all([
        tx.financeSupplierAccount.findMany({
          where: { bookId: book.id },
          select: { id: true, name: true },
        }),
        tx.customerLedgerAccount.findMany({
          where: { tenantId: input.tenantId, currencyCode: book.currencyCode },
          select: { customerId: true, customer: { select: { name: true } } },
        }),
      ])
      const [supplierBalances, customerBalances] = await Promise.all([
        listFinanceSupplierBalances(tx, {
          bookId: book.id,
          snapshot: book.lastSequence,
          supplierIds: suppliers.map((supplier) => supplier.id),
        }),
        listCustomerLedgerBalances(tx, {
          tenantId: input.tenantId,
          currencyCode: book.currencyCode,
          customerIds: accounts.map((account) => account.customerId),
        }),
      ])
      const owingSuppliers = suppliers
        .map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          owed: BigInt(supplierBalances.get(supplier.id)?.payableMinor ?? "0"),
        }))
        .filter((supplier) => supplier.owed > 0n)
      const owingCustomers = accounts
        .map((account) => ({
          id: account.customerId,
          name: account.customer.name,
          owed: BigInt(
            customerBalances.get(account.customerId)?.outstandingDebtMinor ??
              "0",
          ),
        }))
        .filter((customer) => customer.owed > 0n)
      const summarise = (
        rows: { id: string; name: string; owed: bigint }[],
      ) => ({
        count: rows.length,
        owedMinor: rows.reduce((total, row) => total + row.owed, 0n).toString(),
        top: [...rows]
          .sort((a, b) => (b.owed > a.owed ? 1 : b.owed < a.owed ? -1 : 0))
          .slice(0, TOP)
          .map((row) => ({
            id: row.id,
            name: row.name,
            owedMinor: row.owed.toString(),
          })),
      })
      return {
        currencyCode: book.currencyCode,
        customers: summarise(owingCustomers),
        suppliers: summarise(owingSuppliers),
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
