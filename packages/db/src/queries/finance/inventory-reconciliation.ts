import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

/** Owned goods not yet received; they sit in the ledger but in no stock pool. */
const IN_TRANSIT_CODE = "1310"

/**
 * Today's stock pool values against the posted Inventory balance, read at one
 * snapshot. A difference is expected while some stock changes value without a
 * journal (for example internal use or ordinary adjustments) or has unknown
 * cost; this read shows it instead of certifying the books.
 */
export async function getFinanceInventoryReconciliationInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
    select: { id: true, currencyCode: true, lastSequence: true },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, purpose: "INVENTORY" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  })
  const [sums, known, unknown, uncoveredStockCount] = await Promise.all([
    accounts.length
      ? tx.financeJournalLine.groupBy({
          by: ["accountId"],
          where: {
            bookId: book.id,
            accountId: { in: accounts.map((account) => account.id) },
          },
          _sum: { debitMinor: true, creditMinor: true },
        })
      : [],
    tx.financeInventoryPool.aggregate({
      where: { bookId: book.id, valueMinor: { not: null } },
      _sum: { valueMinor: true },
      _count: { _all: true },
    }),
    tx.financeInventoryPool.groupBy({
      by: ["unknownReason"],
      where: { bookId: book.id, valueMinor: null },
      _count: { _all: true },
    }),
    // Stock on hand in this Book's currency that has never been valued.
    tx.stockBalanceSource.count({
      where: {
        tenantId: input.tenantId,
        onHandQuantity: { gt: 0 },
        store: { currencyCode: book.currencyCode },
        financeInventoryPools: { none: { bookId: book.id } },
      },
    }),
  ])
  const balances = new Map(
    sums.map((row) => [
      row.accountId,
      (row._sum.debitMinor ?? BigInt(0)) - (row._sum.creditMinor ?? BigInt(0)),
    ]),
  )
  const ledger = accounts.map((account) => ({
    ...account,
    balanceMinor: balances.get(account.id) ?? BigInt(0),
    inTransit: account.code === IN_TRANSIT_CODE,
  }))
  const onHandMinor = ledger
    .filter((account) => !account.inTransit)
    .reduce((sum, account) => sum + account.balanceMinor, BigInt(0))
  const inTransitMinor = ledger
    .filter((account) => account.inTransit)
    .reduce((sum, account) => sum + account.balanceMinor, BigInt(0))
  const knownValueMinor = known._sum.valueMinor ?? BigInt(0)
  const unknownByReason = Object.fromEntries(
    unknown.map((row) => [row.unknownReason ?? "UNSPECIFIED", row._count._all]),
  ) as Partial<Record<FinanceInventoryUnknownReason | "UNSPECIFIED", number>>
  const unknownCount = unknown.reduce((sum, row) => sum + row._count._all, 0)
  const differenceMinor = onHandMinor - knownValueMinor
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    snapshotSequence: book.lastSequence.toString(),
    ledger: {
      onHandMinor: onHandMinor.toString(),
      inTransitMinor: inTransitMinor.toString(),
      accounts: ledger.map((account) => ({
        ...account,
        balanceMinor: account.balanceMinor.toString(),
      })),
    },
    pools: {
      knownCount: known._count._all,
      knownValueMinor: knownValueMinor.toString(),
      unknownCount,
      unknownByReason,
    },
    uncoveredStockCount,
    differenceMinor: differenceMinor.toString(),
    status:
      differenceMinor === BigInt(0) &&
      unknownCount === 0 &&
      uncoveredStockCount === 0
        ? ("MATCHED" as const)
        : ("REVIEW_REQUIRED" as const),
  }
}

export function getFinanceInventoryReconciliation(
  db: PrismaClient,
  input: FinanceActor & { bookId: string },
) {
  return db.$transaction(
    (tx) => getFinanceInventoryReconciliationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
