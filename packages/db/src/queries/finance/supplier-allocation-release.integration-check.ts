import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  getFinanceSupplierAllocationReleaseReview,
  releaseFinanceSupplierAllocationInTransaction,
  type ReleaseFinanceSupplierAllocationInput,
} from "./purchase-settlements"

/** Exact caller-owned QA allocation. The command, journal and replay all roll back. */
export async function verifySupplierAllocationReleaseRollback(
  db: PrismaClient,
  input: ReleaseFinanceSupplierAllocationInput,
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
  const original = await db.financeSupplierAllocation.findFirstOrThrow({
    where: { id: input.allocationId, bookId: input.bookId },
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
    payments: await db.financeBillPayment.count({
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
    valuations: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    bill: await db.financeBill.findFirstOrThrow({
      where: { id: original.billId, bookId: input.bookId },
      select: { paidMinor: true },
    }),
    book: await db.financeBook.findFirstOrThrow({
      where: { id: input.bookId, tenantId: input.tenantId },
      select: { lastSequence: true },
    }),
  })
  const before = await facts()
  const reviewStarted = performance.now()
  const review = await getFinanceSupplierAllocationReleaseReview(db, input)
  const reviewMs = performance.now() - reviewStarted
  const started = performance.now()
  let failure: unknown
  try {
    await db.$transaction(
      async (tx) => {
        const result = await releaseFinanceSupplierAllocationInTransaction(
          tx,
          input,
        )
        const saved =
          await tx.financeSupplierAllocationRelease.findFirstOrThrow({
            where: { id: result.id, bookId: input.bookId },
            include: {
              supplierEntry: {
                include: { journalEntry: { include: { lines: true } } },
              },
            },
          })
        expect(saved).toMatchObject({
          allocationId: original.id,
          supplierId: original.supplierId,
          amountMinor: BigInt(input.amountMinor),
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
          reason: input.reason.trim(),
        })
        expect(saved.supplierEntry).toMatchObject({
          kind: "ALLOCATION_RELEASE",
          side: "CREDIT",
          billId: original.billId,
          paymentId: null,
          moneyAccountId: null,
        })
        expect(saved.supplierEntry.journalEntry).toMatchObject({
          sourceKind: "SUPPLIER_ALLOCATION_RELEASE",
          sourceId: saved.id,
        })
        expect(
          saved.supplierEntry.journalEntry.lines
            .map((l) => ({
              id: l.accountId,
              debit: l.debitMinor.toString(),
              credit: l.creditMinor.toString(),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        ).toEqual(
          [
            {
              id: review.advanceAccountId,
              debit: input.amountMinor,
              credit: "0",
            },
            {
              id: review.payableAccountId,
              debit: "0",
              credit: input.amountMinor,
            },
          ].sort((a, b) => a.id.localeCompare(b.id)),
        )
        const bill = await tx.financeBill.findFirstOrThrow({
          where: { id: original.billId, bookId: input.bookId },
          select: { paidMinor: true },
        })
        expect(bill.paidMinor.toString()).toBe(review.paidAfterMinor)
        expect(
          await releaseFinanceSupplierAllocationInTransaction(tx, input),
        ).toEqual(result)
        throw Error("OWNED_ALLOCATION_RELEASE_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    failure = error
  }
  expect(failure instanceof Error ? failure.message : String(failure)).toBe(
    "OWNED_ALLOCATION_RELEASE_ROLLBACK",
  )
  const commandAndReplayMs = performance.now() - started
  expect(await facts()).toEqual(before)
  return {
    verified: true,
    review,
    reviewMs,
    commandAndReplayMs,
    savedFactsUnchanged: true,
  }
}
