import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  getFinanceSupplierEntryReversalReview,
  prepareReviewedFinanceSupplierEntryReversalInTransaction,
  reverseFinanceSupplierEntryInTransaction,
  type FinanceSupplierEntryReversalInput,
} from "./supplier-writes"
/** Exact caller-owned classified QA source; original entry, opposite journal and recovery all roll back. */
export async function verifySupplierEntryReversalRollback(
  db: PrismaClient,
  input: FinanceSupplierEntryReversalInput,
) {
  await db.tenant.findFirstOrThrow({
    where: { id: input.tenantId, dataClassification: "QA" },
  })
  await db.membership.findFirstOrThrow({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      role: { in: ["OWNER", "ADMIN"] },
      status: "ACTIVE",
    },
  })
  await db.financeBook.findFirstOrThrow({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  const original = await db.financeSupplierEntry.findFirstOrThrow({
    where: {
      id: input.entryId,
      bookId: input.bookId,
      kind: { in: ["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"] },
      reversalOfId: null,
    },
    include: { journalEntry: { include: { lines: true } } },
  })
  const facts = async () => ({
    commands: await db.financeCommand.count({
      where: { bookId: input.bookId },
    }),
    journals: await db.financeJournalEntry.count({
      where: { bookId: input.bookId },
    }),
    entries: await db.financeSupplierEntry.count({
      where: { bookId: input.bookId },
    }),
    allocations: await db.financeSupplierAllocation.count({
      where: { bookId: input.bookId },
    }),
    releases: await db.financeSupplierAllocationRelease.count({
      where: { bookId: input.bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({
      where: { bookId: input.bookId },
    }),
    valuation: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    original: await db.financeSupplierEntry.findUniqueOrThrow({
      where: { id: input.entryId },
      include: { reversals: { select: { id: true } } },
    }),
    bills: await db.financeBill.findMany({
      where: { bookId: input.bookId },
      select: {
        id: true,
        totalMinor: true,
        paidMinor: true,
        voidedAt: true,
        voidEffectiveAt: true,
        voidReason: true,
      },
      orderBy: { id: "asc" },
    }),
    sequence: (
      await db.financeBook.findUniqueOrThrow({
        where: { id: input.bookId },
        select: { lastSequence: true },
      })
    ).lastSequence.toString(),
    stock: (
      await db.stockBalanceSource.findMany({
        where: { tenantId: input.tenantId },
        select: {
          id: true,
          revision: true,
          onHandQuantity: true,
          reservedQuantity: true,
        },
        orderBy: { id: "asc" },
      })
    ).map((s) => ({
      ...s,
      onHandQuantity: s.onHandQuantity.toFixed(),
      reservedQuantity: s.reservedQuantity.toFixed(),
    })),
  })
  const before = await facts(),
    started = performance.now(),
    review = await getFinanceSupplierEntryReversalReview(db, input),
    reviewMs = performance.now() - started
  let failure: unknown
  const commandStarted = performance.now()
  try {
    await db.$transaction(
      async (tx) => {
        const p =
          await prepareReviewedFinanceSupplierEntryReversalInTransaction(
            tx,
            input,
          )
        expect(p.review).toEqual(review)
        const result = await p.execute(input.clientCommandId)
        expect(await p.execute(input.clientCommandId)).toEqual(result)
        expect(() => p.execute(input.clientCommandId + "-other")).toThrow(
          "one command",
        )
        const saved = await tx.financeSupplierEntry.findUniqueOrThrow({
          where: { id: result.id },
          include: {
            journalEntry: { include: { lines: true } },
            reversalOf: true,
          },
        })
        expect(saved).toMatchObject({
          bookId: input.bookId,
          supplierId: original.supplierId,
          kind: "REVERSAL",
          side: original.side === "DEBIT" ? "CREDIT" : "DEBIT",
          amountMinor: original.amountMinor,
          moneyAccountId: original.moneyAccountId,
          reversalOfId: original.id,
          actorUserId: input.actorUserId,
          effectiveAt: input.effectiveAt,
          description: `Reversal: ${input.reason.trim()}`,
        })
        expect(saved.reversalOf).toEqual(
          original.reversalOfId === null
            ? (({ journalEntry, ...entry }) => entry)(original)
            : null,
        )
        expect(saved.journalEntry).toMatchObject({
          sourceKind: "SUPPLIER_ENTRY_REVERSAL",
          sourceId: original.id,
          reversalOfId: original.journalEntryId,
          actorUserId: input.actorUserId,
          effectiveAt: input.effectiveAt,
          description: `Reversal: ${input.reason.trim()}`,
        })
        const normalize = (lines: typeof original.journalEntry.lines) =>
          lines
            .map((l) => ({
              id: l.accountId,
              debit: l.debitMinor.toString(),
              credit: l.creditMinor.toString(),
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
        expect(normalize(saved.journalEntry.lines)).toEqual(
          normalize(
            original.journalEntry.lines.map((l) => ({
              ...l,
              debitMinor: l.creditMinor,
              creditMinor: l.debitMinor,
            })),
          ),
        )
        expect(
          await reverseFinanceSupplierEntryInTransaction(tx, input),
        ).toEqual(result)
        throw Error("OWNED_SUPPLIER_ENTRY_REVERSAL_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    failure = error
  }
  expect(failure instanceof Error ? failure.message : String(failure)).toBe(
    "OWNED_SUPPLIER_ENTRY_REVERSAL_ROLLBACK",
  )
  const commandAndReplayMs = performance.now() - commandStarted
  expect(await facts()).toEqual(before)
  return {
    verified: true,
    review,
    reviewMs,
    commandAndReplayMs,
    savedFactsUnchanged: true,
  }
}
