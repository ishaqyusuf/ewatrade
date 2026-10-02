import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"
import {
  MAX_SUPPLIER_AGING_SOURCES,
  calculateSupplierPayableAging,
  supplierAgingDate,
  supplierAgingSequence,
} from "./supplier-aging-rules"

export type FinanceSupplierPayableAgingInput = FinanceActor & {
  bookId: string
  supplierId: string
  asOfDate: string
  snapshotSequence?: string
  cursor?: {
    sequence: string
    bookId: string
    supplierId: string
    asOfDate: string
    snapshotSequence: string
  }
  limit?: number
}

function identifier(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new FinanceError("INVALID_JOURNAL", "Invalid payable aging scope.")
  }
}

export async function getFinanceSupplierPayableAging(
  db: PrismaClient,
  input: FinanceSupplierPayableAgingInput,
) {
  identifier(input.bookId)
  identifier(input.supplierId)
  const { endsBefore } = supplierAgingDate(input.asOfDate)
  const requestedSnapshot = supplierAgingSequence(input.snapshotSequence)
  if (
    input.cursor !== undefined &&
    (input.cursor === null ||
      typeof input.cursor !== "object" ||
      input.cursor.bookId !== input.bookId ||
      input.cursor.supplierId !== input.supplierId ||
      input.cursor.asOfDate !== input.asOfDate ||
      input.cursor.snapshotSequence !== input.snapshotSequence ||
      input.cursor.sequence === undefined)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Keep the original aging scope, as-of date and snapshot when paging.",
    )
  }
  const cursor = supplierAgingSequence(input.cursor?.sequence)
  const limit = input.limit ?? 30
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (cursor !== undefined && requestedSnapshot === undefined)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Keep the aging snapshot and a valid page size.",
    )
  }
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: {
          id: true,
          currencyCode: true,
          startsAt: true,
          lastSequence: true,
        },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      if (book.currencyCode !== tenant.currencyCode) {
        throw new FinanceError(
          "CONFLICT",
          "The financial book currency no longer matches the business currency.",
        )
      }
      const supplier = await tx.financeSupplierAccount.findFirst({
        where: { id: input.supplierId, bookId: book.id },
        select: { id: true, bookId: true, code: true, name: true },
      })
      if (!supplier)
        throw new FinanceError("NOT_FOUND", "Supplier not found in this book.")
      const snapshot = requestedSnapshot ?? book.lastSequence
      if (snapshot > book.lastSequence || endsBefore <= book.startsAt) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "Choose an existing snapshot and an as-of date within this book.",
        )
      }
      const journalScope = {
        sequence: { lte: snapshot },
        effectiveAt: { lt: endsBefore },
      }
      const sourceScope: Prisma.FinanceSupplierEntryWhereInput = {
        bookId: book.id,
        supplierId: supplier.id,
        journalEntry: journalScope,
      }
      const sources = await tx.financeSupplierEntry.findMany({
        where: sourceScope,
        orderBy: { journalEntry: { sequence: "asc" } },
        take: MAX_SUPPLIER_AGING_SOURCES + 1,
        select: {
          id: true,
          bookId: true,
          supplierId: true,
          kind: true,
          side: true,
          amountMinor: true,
          effectiveAt: true,
          actorUserId: true,
          description: true,
          billId: true,
          paymentId: true,
          moneyAccountId: true,
          reversalOfId: true,
          bill: {
            select: {
              id: true,
              bookId: true,
              supplierId: true,
              kind: true,
              totalMinor: true,
              incurredAt: true,
              dueAt: true,
              storeId: true,
              actorUserId: true,
              description: true,
              reference: true,
            },
          },
          payment: {
            select: {
              id: true,
              bookId: true,
              billId: true,
              accountId: true,
              amountMinor: true,
              effectiveAt: true,
              actorUserId: true,
            },
          },
          settledAllocation: {
            select: {
              id: true,
              bookId: true,
              supplierId: true,
              billId: true,
              advanceEntryId: true,
              amountMinor: true,
              effectiveAt: true,
              actorUserId: true,
            },
          },
          releasedAllocation: {
            select: {
              id: true,
              bookId: true,
              supplierId: true,
              amountMinor: true,
              effectiveAt: true,
              actorUserId: true,
              allocation: {
                select: { id: true, billId: true, supplierEntryId: true },
              },
            },
          },
          journalEntry: {
            select: {
              id: true,
              bookId: true,
              sequence: true,
              sourceKind: true,
              sourceId: true,
              effectiveAt: true,
              actorUserId: true,
              storeId: true,
              reversalOfId: true,
              lines: {
                take: 101,
                select: {
                  bookId: true,
                  accountId: true,
                  debitMinor: true,
                  creditMinor: true,
                  account: {
                    select: { bookId: true, purpose: true, kind: true },
                  },
                },
              },
            },
          },
        },
      })
      if (sources.length > MAX_SUPPLIER_AGING_SOURCES) {
        throw new FinanceError(
          "CONFLICT",
          `Payable aging exceeds the ${MAX_SUPPLIER_AGING_SOURCES}-source limit; a staged report is required.`,
        )
      }
      // Whole-supplier scope retains unassigned opening liabilities and all Stores.
      const storeIds = [
        ...new Set(
          sources.flatMap((source) =>
            source.journalEntry.storeId ? [source.journalEntry.storeId] : [],
          ),
        ),
      ]
      if (storeIds.length) {
        const stores = await tx.store.findMany({
          where: {
            id: { in: storeIds },
            tenantId: input.tenantId,
            currencyCode: book.currencyCode,
          },
          select: { id: true },
        })
        if (stores.length !== storeIds.length) {
          throw new FinanceError(
            "CONFLICT",
            "A supplier source Store no longer matches the business and book currency.",
          )
        }
      }
      const sumControl = (purpose: "PAYABLE" | "SUPPLIER_ADVANCE") =>
        tx.financeJournalLine.aggregate({
          where: {
            bookId: book.id,
            account: { bookId: book.id, purpose },
            entry: { ...journalScope, supplierEntries: { some: sourceScope } },
          },
          _sum: { debitMinor: true, creditMinor: true },
        })
      const [payable, advance] = await Promise.all([
        sumControl("PAYABLE"),
        sumControl("SUPPLIER_ADVANCE"),
      ])
      const result = calculateSupplierPayableAging({
        bookId: book.id,
        supplierId: supplier.id,
        bookStartsAt: book.startsAt,
        snapshotSequence: snapshot,
        asOfDate: input.asOfDate,
        sources,
        payableControlMinor:
          (payable._sum.creditMinor ?? BigInt(0)) -
          (payable._sum.debitMinor ?? BigInt(0)),
        advanceControlMinor:
          (advance._sum.debitMinor ?? BigInt(0)) -
          (advance._sum.creditMinor ?? BigInt(0)),
      })
      if (
        cursor !== undefined &&
        !result.data.some((source) => BigInt(source.sequence) === cursor)
      ) {
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The cursor is outside this payable aging snapshot.",
        )
      }
      const remaining = result.data.filter(
        (source) => cursor === undefined || BigInt(source.sequence) > cursor,
      )
      const data = remaining.slice(0, limit)
      const last = data.at(-1)
      return {
        supplier,
        currencyCode: book.currencyCode,
        asOfDate: input.asOfDate,
        snapshotSequence: snapshot.toString(),
        dateBasis: "UTC" as const,
        controlScope: "SUPPLIER_ALL_STORES" as const,
        payableMinor: result.payableMinor,
        advanceMinor: result.advanceMinor,
        buckets: result.buckets,
        sourceLimit: MAX_SUPPLIER_AGING_SOURCES,
        sourcesRead: sources.length,
        outstandingSourceCount: result.data.length,
        data,
        nextCursor:
          remaining.length > limit && last
            ? {
                sequence: last.sequence,
                bookId: book.id,
                supplierId: supplier.id,
                asOfDate: input.asOfDate,
                snapshotSequence: snapshot.toString(),
              }
            : null,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
