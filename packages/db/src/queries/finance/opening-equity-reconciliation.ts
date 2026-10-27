import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

/** Starting-balance sources that post to opening equity, in plain words. */
const OPENING_SOURCES: Record<string, string> = {
  OPENING_BALANCE: "Money account starting balances",
  CUSTOMER_LEDGER_OPENING: "Customer starting debts and credit",
  CUSTOMER_LEDGER_REVERSAL: "Reversed customer starting balances",
  SUPPLIER_OPENING_PAYABLE: "Supplier starting balances you owe",
  SUPPLIER_OPENING_ADVANCE: "Supplier starting prepayments",
  SUPPLIER_ENTRY_REVERSAL: "Reversed supplier starting balances",
}

/** Opening families with no starting-balance source yet; never shown as zero. */
const UNSUPPORTED_FAMILIES = [
  "FIXED_ASSETS",
  "LOANS",
  "TAX",
  "PREPAYMENTS",
  "ACCRUALS",
] as const

/**
 * What makes up opening equity, at one snapshot: each posted starting-balance
 * source, anything else that touched the account, and opening stock that is
 * valued in stock pools but not posted. Unknown-cost opening stock is counted,
 * never valued at zero. Assets, loans, tax, prepayments and accruals have no
 * starting-balance source yet, so this read never certifies a complete opening.
 */
export async function getFinanceOpeningEquityReconciliationInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
    select: {
      id: true,
      currencyCode: true,
      startsAt: true,
      lastSequence: true,
    },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, purpose: "OPENING_EQUITY" },
    select: { id: true },
  })
  const accountIds = accounts.map((account) => account.id)
  const [rows, openingStock, unknownOpeningCount] = await Promise.all([
    accountIds.length
      ? tx.$queryRaw<
          Array<{
            sourceKind: string
            debitMinor: string
            creditMinor: string
            entries: number
          }>
        >(Prisma.sql`
          SELECT e."sourceKind" AS "sourceKind",
                 COALESCE(SUM(l."debitMinor"), 0)::text AS "debitMinor",
                 COALESCE(SUM(l."creditMinor"), 0)::text AS "creditMinor",
                 COUNT(DISTINCT e.id)::int AS entries
            FROM "FinanceJournalLine" l
            JOIN "FinanceJournalEntry" e
              ON e.id = l."entryId" AND e."bookId" = l."bookId"
           WHERE l."bookId" = ${book.id}
             AND l."accountId" IN (${Prisma.join(accountIds)})
             AND e.sequence <= ${book.lastSequence}
           GROUP BY e."sourceKind"
           ORDER BY e."sourceKind"`)
      : [],
    tx.financeInventoryValuationEvent.aggregate({
      where: {
        bookId: book.id,
        kind: "OPENING",
        valueDeltaMinor: { not: null },
      },
      _sum: { valueDeltaMinor: true },
      _count: { _all: true },
    }),
    tx.financeInventoryValuationEvent.count({
      where: {
        bookId: book.id,
        kind: "OPENING",
        valueDeltaMinor: null,
      },
    }),
  ])
  const sources = rows.map((row) => {
    const netMinor = BigInt(row.creditMinor) - BigInt(row.debitMinor)
    return {
      sourceKind: row.sourceKind,
      label: OPENING_SOURCES[row.sourceKind] ?? null,
      expected: row.sourceKind in OPENING_SOURCES,
      debitMinor: row.debitMinor,
      creditMinor: row.creditMinor,
      netMinor: netMinor.toString(),
      entries: row.entries,
    }
  })
  const equityMinor = sources.reduce(
    (sum, row) => sum + BigInt(row.netMinor),
    BigInt(0),
  )
  const unexpected = sources.filter((row) => !row.expected)
  return {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt,
    snapshotSequence: book.lastSequence.toString(),
    openingEquityMinor: equityMinor.toString(),
    sources,
    unexpectedSourceKinds: unexpected.map((row) => row.sourceKind),
    openingStock: {
      knownCount: openingStock._count._all,
      knownValueMinor: (
        openingStock._sum.valueDeltaMinor ?? BigInt(0)
      ).toString(),
      unknownCostCount: unknownOpeningCount,
      /** Opening stock is valued in pools only; no journal moves it to equity. */
      postedToEquity: false as const,
    },
    unsupportedFamilies: [...UNSUPPORTED_FAMILIES],
    status: "REVIEW_REQUIRED" as const,
  }
}

export function getFinanceOpeningEquityReconciliation(
  db: PrismaClient,
  input: FinanceActor & { bookId: string },
) {
  return db.$transaction(
    (tx) => getFinanceOpeningEquityReconciliationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
