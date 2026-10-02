import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

export type FinanceAccountActivityInput = FinanceActor & {
  bookId: string
  accountId: string
  from: Date
  through: Date
  snapshotSequence?: string
  cursor?: string
  limit?: number
}

function sequenceValue(value: string | undefined) {
  if (value === undefined) return undefined
  if (
    !/^(0|[1-9]\d{0,18})$/.test(value) ||
    BigInt(value) > BigInt("9223372036854775807")
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid statement sequence.")
  }
  return BigInt(value)
}

async function listAccountLedger(
  db: PrismaClient,
  input: FinanceAccountActivityInput,
  moneyOnly: boolean,
) {
  const limit = input.limit ?? 30
  const requestedSnapshot = sequenceValue(input.snapshotSequence)
  const cursorSequence = sequenceValue(input.cursor)
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.through.getTime()) ||
    input.through < input.from ||
    (cursorSequence !== undefined && requestedSnapshot === undefined)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a valid statement range and retain the snapshot when loading more.",
    )
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const account = await tx.financeAccount.findFirst({
        where: {
          bookId: book.id,
          id: input.accountId,
          ...(moneyOnly
            ? {
                kind: "ASSET" as const,
                purpose: {
                  in: ["CASH", "BANK", "CLEARING"] as (
                    | "CASH"
                    | "BANK"
                    | "CLEARING"
                  )[],
                },
              }
            : {}),
        },
        select: { id: true, name: true, purpose: true, kind: true },
      })
      if (!account)
        throw new FinanceError("NOT_FOUND", "Account not found in this book.")
      const snapshot = requestedSnapshot ?? book.lastSequence
      if (snapshot > book.lastSequence || input.from < book.startsAt) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The statement must use an existing snapshot and start on or after bookkeeping began.",
        )
      }
      const period: Prisma.FinanceJournalEntryWhereInput = {
        bookId: book.id,
        sequence: { lte: snapshot },
        effectiveAt: { gte: input.from, lte: input.through },
        lines: { some: { accountId: account.id } },
      }
      const cursor =
        cursorSequence === undefined
          ? null
          : await tx.financeJournalEntry.findFirst({
              where: { AND: [period, { sequence: cursorSequence }] },
              select: { effectiveAt: true, sequence: true },
            })
      if (cursorSequence !== undefined && !cursor)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The cursor is outside this account statement.",
        )
      const amounts = (entry: Prisma.FinanceJournalEntryWhereInput) =>
        tx.financeJournalLine.aggregate({
          where: { bookId: book.id, accountId: account.id, entry },
          _sum: { debitMinor: true, creditMinor: true },
        })
      const [opening, movement, previous, rows] = await Promise.all([
        amounts({
          sequence: { lte: snapshot },
          effectiveAt: { lt: input.from },
        }),
        amounts(period),
        cursor
          ? amounts({
              AND: [
                period,
                {
                  OR: [
                    { effectiveAt: { lt: cursor.effectiveAt } },
                    {
                      effectiveAt: cursor.effectiveAt,
                      sequence: { lte: cursor.sequence },
                    },
                  ],
                },
              ],
            })
          : null,
        tx.financeJournalEntry.findMany({
          where: cursor
            ? {
                AND: [
                  period,
                  {
                    OR: [
                      { effectiveAt: { gt: cursor.effectiveAt } },
                      {
                        effectiveAt: cursor.effectiveAt,
                        sequence: { gt: cursor.sequence },
                      },
                    ],
                  },
                ],
              }
            : period,
          orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }],
          take: limit + 1,
          include: {
            lines: {
              where: { accountId: account.id },
              select: { debitMinor: true, creditMinor: true },
            },
            reversal: { select: { id: true, sequence: true } },
          },
        }),
      ])
      const normalSign =
        account.kind === "ASSET" || account.kind === "EXPENSE"
          ? BigInt(1)
          : BigInt(-1)
      const openingBalance =
        (opening._sum.debitMinor ?? BigInt(0)) -
        (opening._sum.creditMinor ?? BigInt(0))
      const debit = movement._sum.debitMinor ?? BigInt(0)
      const credit = movement._sum.creditMinor ?? BigInt(0)
      const pageOpeningBalance =
        openingBalance +
        (previous?._sum.debitMinor ?? BigInt(0)) -
        (previous?._sum.creditMinor ?? BigInt(0))
      let running = pageOpeningBalance
      const page = rows.slice(0, limit)
      return {
        account,
        balanceConvention: "ACCOUNT_NORMAL_SIDE" as const,
        normalSide:
          normalSign === BigInt(1) ? ("DEBIT" as const) : ("CREDIT" as const),
        currencyCode: book.currencyCode,
        bookkeepingStartsAt: book.startsAt,
        coverage: "POSTED_FINANCE_ENTRIES" as const,
        from: input.from,
        through: input.through,
        snapshotSequence: snapshot.toString(),
        openingBalanceMinor: (openingBalance * normalSign).toString(),
        debitMinor: debit.toString(),
        creditMinor: credit.toString(),
        closingBalanceMinor: (
          (openingBalance + debit - credit) *
          normalSign
        ).toString(),
        pageOpeningBalanceMinor: (pageOpeningBalance * normalSign).toString(),
        nextCursor:
          rows.length > limit
            ? (page.at(-1)?.sequence.toString() ?? null)
            : null,
        items: page.map((entry) => {
          const debitMinor = entry.lines.reduce(
            (sum, line) => sum + line.debitMinor,
            BigInt(0),
          )
          const creditMinor = entry.lines.reduce(
            (sum, line) => sum + line.creditMinor,
            BigInt(0),
          )
          running += debitMinor - creditMinor
          return {
            id: entry.id,
            sequence: entry.sequence.toString(),
            description: entry.description,
            effectiveAt: entry.effectiveAt,
            recordedAt: entry.recordedAt,
            actorUserId: entry.actorUserId,
            storeId: entry.storeId,
            sourceKind: entry.sourceKind,
            sourceId: entry.sourceId,
            reversalOfId: entry.reversalOfId,
            reversedById:
              entry.reversal && entry.reversal.sequence <= snapshot
                ? entry.reversal.id
                : null,
            debitMinor: debitMinor.toString(),
            creditMinor: creditMinor.toString(),
            balanceMinor: (running * normalSign).toString(),
          }
        }),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export function listFinanceAccountActivity(
  db: PrismaClient,
  input: FinanceAccountActivityInput,
) {
  return listAccountLedger(db, input, true)
}
export function listFinanceAccountLedger(
  db: PrismaClient,
  input: FinanceAccountActivityInput,
) {
  return listAccountLedger(db, input, false)
}
