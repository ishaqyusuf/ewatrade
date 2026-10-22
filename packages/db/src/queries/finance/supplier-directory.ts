import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { FinanceError } from "./rules"
import { supplierAgingSourceSelect } from "./supplier-aging"
import {
  MAX_SUPPLIER_AGING_SOURCES,
  calculateSupplierPayableAging,
  supplierAgingDate,
} from "./supplier-aging-rules"
import { listFinanceSupplierBalances } from "./supplier-reads"

export type SupplierDirectoryFilter = "owe" | "overdue" | "ahead" | "paid"
export type SupplierDirectorySort = "owed" | "name"

type Due = { nextDueAt: Date | null; overdue: boolean }

/**
 * Supplier list for the dashboard: identity, You owe and Paid ahead (same rule
 * as the statement), and when the next unpaid amount is due, computed with the
 * payable aging calculator as of today (UTC). Filters and sorts the whole
 * book's suppliers in memory, then pages with an offset cursor.
 */
export async function listFinanceSupplierDirectory(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    query?: string
    filter?: SupplierDirectoryFilter
    sort?: SupplierDirectorySort
    cursor?: string
    limit?: number
  },
) {
  const limit = input.limit ?? 30
  const query = input.query?.trim() || undefined
  const offset = input.cursor ? Number(input.cursor) : 0
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (query?.length ?? 0) > 160 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    throw new FinanceError("INVALID_JOURNAL", "Invalid Supplier list.")
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findFirst({
        where: { id: input.bookId, tenantId: input.tenantId },
        select: { id: true, startsAt: true, lastSequence: true },
      })
      if (!book)
        throw new FinanceError("NOT_FOUND", "Financial book not found.")
      const suppliers = await tx.financeSupplierAccount.findMany({
        where: {
          bookId: book.id,
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: "insensitive" } },
                  { name: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, bookId: true, code: true, name: true },
      })
      const ids = suppliers.map((supplier) => supplier.id)
      const balances = await listFinanceSupplierBalances(tx, {
        bookId: book.id,
        snapshot: book.lastSequence,
        supplierIds: ids,
      })
      const owing = ids.filter(
        (id) => BigInt(balances.get(id)?.payableMinor ?? "0") > 0n,
      )
      const due = await supplierDueDates(tx, {
        bookId: book.id,
        bookStartsAt: book.startsAt,
        snapshot: book.lastSequence,
        supplierIds: owing,
      })
      const rows = suppliers
        .map((supplier) => ({
          ...supplier,
          owedMinor: balances.get(supplier.id)?.payableMinor ?? "0",
          paidAheadMinor: balances.get(supplier.id)?.advanceMinor ?? "0",
          nextDueAt: due.get(supplier.id)?.nextDueAt ?? null,
          overdue: due.get(supplier.id)?.overdue ?? false,
        }))
        .filter((row) => {
          const owed = BigInt(row.owedMinor)
          const ahead = BigInt(row.paidAheadMinor)
          if (input.filter === "owe") return owed > 0n
          if (input.filter === "overdue") return row.overdue
          if (input.filter === "ahead") return ahead > 0n
          if (input.filter === "paid") return owed === 0n && ahead === 0n
          return true
        })
        .sort((a, b) => {
          if ((input.sort ?? "owed") === "owed") {
            const diff = BigInt(b.owedMinor) - BigInt(a.owedMinor)
            if (diff !== 0n) return diff > 0n ? 1 : -1
          }
          return (
            a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
            a.id.localeCompare(b.id)
          )
        })
      const page = rows.slice(offset, offset + limit)
      return {
        count: rows.length,
        owedMinor: rows
          .reduce((total, row) => total + BigInt(row.owedMinor), 0n)
          .toString(),
        nextCursor:
          offset + limit < rows.length ? String(offset + limit) : null,
        items: page,
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}

/** Next due date and overdue flag per owing supplier, from payable aging as of today. */
async function supplierDueDates(
  tx: Prisma.TransactionClient,
  input: {
    bookId: string
    bookStartsAt: Date
    snapshot: bigint
    supplierIds: string[]
  },
) {
  const result = new Map<string, Due>()
  if (!input.supplierIds.length) return result
  const asOfDate = new Date().toISOString().slice(0, 10)
  const { endsBefore } = supplierAgingDate(asOfDate)
  const journalScope = {
    sequence: { lte: input.snapshot },
    effectiveAt: { lt: endsBefore },
  }
  const [sources, controls] = await Promise.all([
    tx.financeSupplierEntry.findMany({
      where: {
        bookId: input.bookId,
        supplierId: { in: input.supplierIds },
        journalEntry: journalScope,
      },
      orderBy: { journalEntry: { sequence: "asc" } },
      take: MAX_SUPPLIER_AGING_SOURCES * 5 + 1,
      select: supplierAgingSourceSelect,
    }),
    listFinanceSupplierBalances(tx, {
      bookId: input.bookId,
      snapshot: input.snapshot,
      supplierIds: input.supplierIds,
      endsBefore,
    }),
  ])
  const bySupplier = new Map<string, typeof sources>()
  for (const source of sources)
    bySupplier.set(source.supplierId, [
      ...(bySupplier.get(source.supplierId) ?? []),
      source,
    ])
  for (const supplierId of input.supplierIds) {
    const supplierSources = bySupplier.get(supplierId) ?? []
    // Too many sources for a list read: leave the date empty rather than guess.
    if (supplierSources.length > MAX_SUPPLIER_AGING_SOURCES) continue
    try {
      const aging = calculateSupplierPayableAging({
        bookId: input.bookId,
        supplierId,
        bookStartsAt: input.bookStartsAt,
        snapshotSequence: input.snapshot,
        asOfDate,
        sources: supplierSources,
        payableControlMinor: BigInt(
          controls.get(supplierId)?.payableMinor ?? "0",
        ),
        advanceControlMinor: BigInt(
          controls.get(supplierId)?.advanceMinor ?? "0",
        ),
      })
      const dated = aging.data
        .filter(
          (source) => source.dueAt && BigInt(source.outstandingMinor) > 0n,
        )
        .map((source) => new Date(source.dueAt as Date))
        .sort((a, b) => a.getTime() - b.getTime())
      const nextDueAt = dated[0] ?? null
      result.set(supplierId, {
        nextDueAt,
        overdue: Boolean(
          nextDueAt && nextDueAt.toISOString().slice(0, 10) < asOfDate,
        ),
      })
    } catch (error) {
      // A supplier whose sources don't reconcile shows no date; its statement explains.
      if (!(error instanceof FinanceError)) throw error
    }
  }
  return result
}
