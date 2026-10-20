import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"

const MAX_SEQUENCE = BigInt("9223372036854775807")

function sequenceValue(value: string | undefined) {
  if (value === undefined) return undefined
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,18})$/.test(value) ||
    BigInt(value) > MAX_SEQUENCE
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Invalid supplier statement sequence.",
    )
  }
  return BigInt(value)
}

function assertSupplierId(id: string) {
  if (typeof id !== "string" || !id.trim() || id.length > 128) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid supplier identifier.")
  }
}

function assertId(value: string, message: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new FinanceError("INVALID_JOURNAL", message)
  }
}

function assertLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a valid supplier page size.",
    )
  }
}

export type FinanceSupplierListInput = FinanceActor & {
  bookId: string
  query?: string
  cursor?: string
  limit?: number
}

export async function listFinanceSuppliers(
  db: PrismaClient,
  input: FinanceSupplierListInput,
) {
  const limit = input.limit ?? 30
  assertId(input.bookId, "Invalid financial book identifier.")
  const query = typeof input.query === "string" ? input.query.trim() : undefined
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.query !== undefined &&
      (typeof input.query !== "string" || input.query.length > 160)) ||
    (input.cursor !== undefined &&
      (typeof input.cursor !== "string" ||
        !input.cursor.trim() ||
        input.cursor.length > 128))
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid supplier list filters.")
  }
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")

      const where: Prisma.FinanceSupplierAccountWhereInput = {
        bookId: book.id,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      }
      const cursor = input.cursor
        ? await tx.financeSupplierAccount.findFirst({
            where: { AND: [where, { id: input.cursor }] },
            select: { id: true, code: true },
          })
        : null
      if (input.cursor && !cursor) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Supplier cursor is outside this list.",
        )
      }
      const rows = await tx.financeSupplierAccount.findMany({
        where: cursor
          ? {
              AND: [
                where,
                {
                  OR: [
                    { code: { gt: cursor.code } },
                    { code: cursor.code, id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : where,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        take: limit + 1,
        select: { id: true, bookId: true, code: true, name: true },
      })
      const page = rows.slice(0, limit)
      return {
        data: page,
        nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

export type FinanceSupplierStatementInput = FinanceActor & {
  bookId: string
  supplierId: string
  snapshotSequence?: string
  cursor?: string
  limit?: number
}

export async function getFinanceSupplierStatement(
  db: PrismaClient,
  input: FinanceSupplierStatementInput,
) {
  const limit = input.limit ?? 30
  const requestedSnapshot = sequenceValue(input.snapshotSequence)
  const cursorSequence = sequenceValue(input.cursor)
  assertId(input.bookId, "Invalid financial book identifier.")
  assertSupplierId(input.supplierId)
  assertLimit(limit)
  if (cursorSequence !== undefined && requestedSnapshot === undefined) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Keep the statement snapshot when loading another page.",
    )
  }

  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, currencyCode: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const supplier = await tx.financeSupplierAccount.findFirst({
        where: { id: input.supplierId, bookId: book.id },
        select: { id: true, bookId: true, code: true, name: true },
      })
      if (!supplier) {
        throw new FinanceError("NOT_FOUND", "Supplier not found in this book.")
      }
      const snapshot = requestedSnapshot ?? book.lastSequence
      if (snapshot > book.lastSequence) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The statement snapshot is in the future.",
        )
      }

      const scopedEntries: Prisma.FinanceSupplierEntryWhereInput = {
        bookId: book.id,
        supplierId: supplier.id,
        journalEntry: { sequence: { lte: snapshot } },
      }
      const cursor =
        cursorSequence === undefined
          ? null
          : await tx.financeSupplierEntry.findFirst({
              where: {
                AND: [
                  scopedEntries,
                  { journalEntry: { sequence: cursorSequence } },
                ],
              },
              select: { id: true },
            })
      if (cursorSequence !== undefined && !cursor) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The cursor is outside this supplier statement.",
        )
      }

      const controlAccounts = await tx.financeAccount.findMany({
        where: {
          bookId: book.id,
          purpose: { in: ["PAYABLE", "SUPPLIER_ADVANCE"] },
        },
        select: { id: true, purpose: true },
      })
      const payableAccountIds = controlAccounts
        .filter((account) => account.purpose === "PAYABLE")
        .map((account) => account.id)
      const advanceAccountIds = controlAccounts
        .filter((account) => account.purpose === "SUPPLIER_ADVANCE")
        .map((account) => account.id)
      const sumControl = (accountIds: string[]) =>
        accountIds.length
          ? tx.financeJournalLine.aggregate({
              where: {
                bookId: book.id,
                accountId: { in: accountIds },
                entry: {
                  sequence: { lte: snapshot },
                  supplierEntries: { some: scopedEntries },
                },
              },
              _sum: { debitMinor: true, creditMinor: true },
            })
          : Promise.resolve({ _sum: { debitMinor: null, creditMinor: null } })
      const [payable, advance, rows] = await Promise.all([
        sumControl(payableAccountIds),
        sumControl(advanceAccountIds),
        tx.financeSupplierEntry.findMany({
          where: {
            AND: [
              scopedEntries,
              ...(cursorSequence === undefined
                ? []
                : [{ journalEntry: { sequence: { lt: cursorSequence } } }]),
            ],
          },
          orderBy: { journalEntry: { sequence: "desc" } },
          take: limit + 1,
          select: {
            id: true,
            kind: true,
            side: true,
            amountMinor: true,
            description: true,
            effectiveAt: true,
            recordedAt: true,
            actorUserId: true,
            journalEntryId: true,
            moneyAccountId: true,
            reversalOfId: true,
            journalEntry: { select: { sequence: true } },
            reversals: {
              where: { journalEntry: { sequence: { lte: snapshot } } },
              take: 1,
              select: {
                id: true,
                description: true,
                effectiveAt: true,
                journalEntry: { select: { sequence: true } },
              },
            },
          },
        }),
      ])
      const page = rows.slice(0, limit)
      const payableMinor =
        (payable._sum.creditMinor ?? BigInt(0)) -
        (payable._sum.debitMinor ?? BigInt(0))
      const advanceMinor =
        (advance._sum.debitMinor ?? BigInt(0)) -
        (advance._sum.creditMinor ?? BigInt(0))
      return {
        supplier,
        currencyCode: book.currencyCode,
        snapshotSequence: snapshot.toString(),
        payableMinor: payableMinor.toString(),
        advanceMinor: advanceMinor.toString(),
        data: page.map((entry) => {
          const reversal = entry.reversals[0]
          return {
            id: entry.id,
            kind: entry.kind,
            side: entry.side,
            amountMinor: entry.amountMinor.toString(),
            description: entry.description,
            effectiveAt: entry.effectiveAt,
            recordedAt: entry.recordedAt,
            actorUserId: entry.actorUserId,
            journalEntryId: entry.journalEntryId,
            sequence: entry.journalEntry.sequence.toString(),
            moneyAccountId: entry.moneyAccountId,
            reversalOfId: entry.reversalOfId,
            reversal: reversal
              ? {
                  id: reversal.id,
                  sequence: reversal.journalEntry.sequence.toString(),
                  effectiveAt: reversal.effectiveAt,
                  description: reversal.description,
                }
              : null,
          }
        }),
        nextCursor:
          rows.length > limit
            ? (page.at(-1)?.journalEntry.sequence.toString() ?? null)
            : null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
