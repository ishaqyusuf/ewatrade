import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

export async function getFinanceAccountBalances(
  db: PrismaClient,
  input: FinanceActor & { bookId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const [accounts, totals] = await Promise.all([
        tx.financeAccount.findMany({
          where: { bookId: book.id },
          orderBy: { code: "asc" },
        }),
        tx.financeJournalLine.groupBy({
          by: ["accountId"],
          where: {
            bookId: book.id,
            entry: { sequence: { lte: book.lastSequence } },
          },
          _sum: { debitMinor: true, creditMinor: true },
        }),
      ])
      const byAccount = new Map(totals.map((row) => [row.accountId, row._sum]))
      return {
        snapshotSequence: book.lastSequence.toString(),
        currencyCode: book.currencyCode,
        startsAt: book.startsAt,
        accounts: accounts.map((account) => {
          const totals = byAccount.get(account.id)
          const debitMinor = totals?.debitMinor ?? BigInt(0)
          const creditMinor = totals?.creditMinor ?? BigInt(0)
          const debitNormal =
            account.kind === "ASSET" || account.kind === "EXPENSE"
          return {
            ...account,
            debitMinor: debitMinor.toString(),
            creditMinor: creditMinor.toString(),
            balanceMinor: (debitNormal
              ? debitMinor - creditMinor
              : creditMinor - debitMinor
            ).toString(),
          }
        }),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export async function listFinanceJournal(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    cursor?: string
    snapshotSequence?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 30
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    [input.cursor, input.snapshotSequence].some(
      (value) =>
        value !== undefined &&
        (!/^\d{1,19}$/.test(value) ||
          BigInt(value) > BigInt("9223372036854775807")),
    )
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid journal page.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const snapshot =
        input.snapshotSequence === undefined
          ? book.lastSequence
          : BigInt(input.snapshotSequence)
      if (snapshot > book.lastSequence)
        throw new FinanceError("INVALID_JOURNAL", "Invalid snapshot.")
      const entries = await tx.financeJournalEntry.findMany({
        where: {
          bookId: book.id,
          sequence: {
            lte: snapshot,
            ...(input.cursor ? { lt: BigInt(input.cursor) } : {}),
          },
        },
        orderBy: { sequence: "desc" },
        take: limit + 1,
        include: {
          reversal: { select: { id: true, effectiveAt: true, sequence: true } },
          lines: {
            include: { account: { select: { name: true, code: true } } },
            orderBy: { id: "asc" },
          },
        },
      })
      const page = entries.slice(0, limit)
      return {
        snapshotSequence: snapshot.toString(),
        nextCursor:
          entries.length > limit
            ? (page.at(-1)?.sequence.toString() ?? null)
            : null,
        items: page.map((entry) => ({
          ...entry,
          reversal:
            entry.reversal && entry.reversal.sequence <= snapshot
              ? {
                  id: entry.reversal.id,
                  effectiveAt: entry.reversal.effectiveAt,
                }
              : null,
          sequence: entry.sequence.toString(),
          lines: entry.lines.map((line) => ({
            ...line,
            debitMinor: line.debitMinor.toString(),
            creditMinor: line.creditMinor.toString(),
          })),
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export async function getFinanceCommandStatus(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; clientCommandId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const command = await tx.financeCommand.findFirst({
        where: {
          bookId: input.bookId,
          clientCommandId: input.clientCommandId,
          book: { tenantId: input.tenantId },
        },
        select: { result: true, createdAt: true },
      })
      return command
        ? { status: "COMMITTED" as const, ...command }
        : { status: "NOT_FOUND" as const }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
