import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { financeDocumentCommand } from "./commands"
import { FinanceError } from "./rules"

export function cashCountAmount(value: string) {
  if (
    !/^(0|[1-9]\d{0,18})$/.test(value) ||
    BigInt(value) > BigInt("9223372036854775807")
  ) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Enter a non-negative cash count in whole minor units.",
    )
  }
  return BigInt(value)
}

export type FinanceCashCountInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  accountId: string
  asOf: Date
  observedBalanceMinor: string
  reference: string
}

export async function recordFinanceCashCountInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceCashCountInput,
) {
  const observedBalanceMinor = cashCountAmount(input.observedBalanceMinor)
  const reference = input.reference.trim()
  if (
    !reference ||
    reference.length > 200 ||
    !Number.isFinite(input.asOf.getTime())
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A valid count date and reference are required.",
    )
  }
  return financeDocumentCommand(
    tx,
    input,
    "CASH_COUNT",
    {
      accountId: input.accountId,
      asOf: input.asOf,
      observedBalanceMinor,
      reference,
    },
    async (book) => {
      if (input.asOf < book.startsAt || input.asOf > new Date()) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The count date must be between the bookkeeping start and now.",
        )
      }
      const account = await tx.financeAccount.findFirst({
        where: {
          id: input.accountId,
          bookId: book.id,
          purpose: "CASH",
          archivedAt: null,
        },
        select: { id: true },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Choose an active cash account in this book.",
        )
      const totals = await tx.financeJournalLine.aggregate({
        where: {
          bookId: book.id,
          accountId: account.id,
          entry: {
            sequence: { lte: book.lastSequence },
            effectiveAt: { lte: input.asOf },
          },
        },
        _sum: { debitMinor: true, creditMinor: true },
      })
      const expectedBalanceMinor =
        (totals._sum.debitMinor ?? BigInt(0)) -
        (totals._sum.creditMinor ?? BigInt(0))
      if (
        expectedBalanceMinor > BigInt("9223372036854775807") ||
        expectedBalanceMinor < BigInt("-9223372036854775808")
      ) {
        throw new FinanceError(
          "INVALID_AMOUNT",
          "The recorded balance exceeds the cash-count storage limit.",
        )
      }
      const count = await tx.financeReconciliation.create({
        data: {
          bookId: book.id,
          accountId: account.id,
          asOf: input.asOf,
          snapshotSequence: book.lastSequence,
          expectedBalanceMinor,
          observedBalanceMinor,
          reference,
          actorUserId: input.actorUserId,
        },
        select: { id: true },
      })
      return count
    },
  )
}

export async function recordFinanceCashCount(
  db: PrismaClient,
  input: FinanceCashCountInput,
) {
  return db.$transaction(
    (tx) => recordFinanceCashCountInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getFinanceCashCount(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; countId: string },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const count = await tx.financeReconciliation.findFirst({
        where: {
          id: input.countId,
          bookId: input.bookId,
          book: { tenantId: input.tenantId },
          account: { purpose: "CASH" },
        },
        include: {
          account: { select: { name: true } },
          book: { select: { currencyCode: true, lastSequence: true } },
        },
      })
      if (!count)
        throw new FinanceError(
          "NOT_FOUND",
          "Cash count not found in this business.",
        )
      const adjustment = await tx.financeJournalEntry.findUnique({
        where: {
          bookId_sourceKind_sourceId: {
            bookId: count.bookId,
            sourceKind: "CASH_COUNT_ADJUSTMENT",
            sourceId: count.id,
          },
        },
        select: {
          id: true,
          description: true,
          recordedAt: true,
          reversal: { select: { id: true, recordedAt: true } },
        },
      })
      const excludedEntryIds = adjustment
        ? [
            adjustment.id,
            ...(adjustment.reversal ? [adjustment.reversal.id] : []),
          ]
        : []
      const changed = await tx.financeJournalLine.findFirst({
        where: {
          bookId: count.bookId,
          accountId: count.accountId,
          entry: {
            effectiveAt: { lte: count.asOf },
            sequence: { gt: count.snapshotSequence },
            ...(excludedEntryIds.length > 0
              ? { id: { notIn: excludedEntryIds } }
              : {}),
          },
        },
        select: { id: true },
      })
      return {
        id: count.id,
        adjustment,
        currentSnapshotSequence: count.book.lastSequence.toString(),
        accountId: count.accountId,
        accountName: count.account.name,
        asOf: count.asOf,
        recordedAt: count.createdAt,
        actorUserId: count.actorUserId,
        reference: count.reference,
        currencyCode: count.book.currencyCode,
        snapshotSequence: count.snapshotSequence.toString(),
        expectedBalanceMinor: count.expectedBalanceMinor.toString(),
        observedBalanceMinor: count.observedBalanceMinor.toString(),
        differenceMinor: (
          count.observedBalanceMinor - count.expectedBalanceMinor
        ).toString(),
        reviewRequired: Boolean(changed),
        status: changed
          ? ("REVIEW_REQUIRED" as const)
          : adjustment?.reversal
            ? ("ADJUSTMENT_REVERSED" as const)
            : adjustment
              ? ("ADJUSTED" as const)
              : count.expectedBalanceMinor === count.observedBalanceMinor
                ? ("MATCHED" as const)
                : ("DIFFERENCE" as const),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export async function listFinanceCashCounts(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    accountId?: string
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 30
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid cash-count page size.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const where: Prisma.FinanceReconciliationWhereInput = {
        bookId: book.id,
        accountId: input.accountId,
        account: { purpose: "CASH" },
      }
      const cursor = input.cursor
        ? await tx.financeReconciliation.findFirst({
            where: { ...where, id: input.cursor },
            select: { id: true, asOf: true },
          })
        : null
      if (input.cursor && !cursor)
        throw new FinanceError(
          "CONFLICT",
          "Refresh cash-count history to continue.",
        )
      const rows = await tx.financeReconciliation.findMany({
        where: cursor
          ? {
              AND: [
                where,
                {
                  OR: [
                    { asOf: { lt: cursor.asOf } },
                    { asOf: cursor.asOf, id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : where,
        orderBy: [{ asOf: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { account: { select: { name: true } } },
      })
      const page = rows.slice(0, limit)
      return {
        currencyCode: book.currencyCode,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
        items: page.map((count) => ({
          id: count.id,
          accountId: count.accountId,
          accountName: count.account.name,
          asOf: count.asOf,
          recordedAt: count.createdAt,
          reference: count.reference,
          actorUserId: count.actorUserId,
          snapshotSequence: count.snapshotSequence.toString(),
          expectedBalanceMinor: count.expectedBalanceMinor.toString(),
          observedBalanceMinor: count.observedBalanceMinor.toString(),
          differenceAtCountMinor: (
            count.observedBalanceMinor - count.expectedBalanceMinor
          ).toString(),
        })),
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
