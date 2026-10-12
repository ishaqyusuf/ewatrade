import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  getFinancePurchasePaymentReversalReview,
  prepareReviewedFinancePurchasePaymentReversalInTransaction,
  reverseFinancePurchasePaymentInTransaction,
  type ReverseFinancePurchasePaymentInput,
} from "./purchase-settlements"

/** Caller-owned QA payment only. Posting, metadata, bill correction and replay roll back together. */
export async function verifyPurchasePaymentReversalRollback(
  db: PrismaClient,
  input: ReverseFinancePurchasePaymentInput,
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
  const original = await db.financeBillPayment.findFirstOrThrow({
    where: { id: input.paymentId, bookId: input.bookId },
    include: {
      supplierEntry: {
        include: { journalEntry: { include: { lines: true } } },
      },
    },
  })
  if (!original.supplierEntry || original.reversedAt)
    throw Error("Exact unreversed purchase payment required")
  const source = original.supplierEntry
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
    valuations: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    payment: await db.financeBillPayment.findFirstOrThrow({
      where: { id: input.paymentId, bookId: input.bookId },
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
  const reviewStart = performance.now()
  const review = await getFinancePurchasePaymentReversalReview(db, input)
  const reviewMs = performance.now() - reviewStart
  const start = performance.now()
  let failure: unknown
  try {
    await db.$transaction(
      async (tx) => {
        const prepared =
          await prepareReviewedFinancePurchasePaymentReversalInTransaction(
            tx,
            input,
          )
        expect(prepared.review).toEqual(review)
        const result = await prepared.execute(input.clientCommandId)
        expect(await prepared.execute(input.clientCommandId)).toEqual(result)
        expect(() =>
          prepared.execute(input.clientCommandId + "-other"),
        ).toThrow("one command")
        const saved = await tx.financeSupplierEntry.findFirstOrThrow({
          where: { id: result.id, bookId: input.bookId },
          include: { journalEntry: { include: { lines: true } } },
        })
        expect(saved).toMatchObject({
          kind: "REVERSAL",
          side: "CREDIT",
          amountMinor: original.amountMinor,
          supplierId: source.supplierId,
          billId: original.billId,
          moneyAccountId: original.accountId,
          reversalOfId: source.id,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
        })
        expect(saved.journalEntry).toMatchObject({
          sourceKind: "PURCHASE_PAYMENT_REVERSAL",
          sourceId: source.id,
          reversalOfId: source.journalEntryId,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
        })
        const normalize = (lines: typeof source.journalEntry.lines) =>
          lines
            .map((l) => ({
              id: l.accountId,
              debit: l.debitMinor.toString(),
              credit: l.creditMinor.toString(),
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
        expect(normalize(saved.journalEntry.lines)).toEqual(
          normalize(
            source.journalEntry.lines.map((l) => ({
              ...l,
              debitMinor: l.creditMinor,
              creditMinor: l.debitMinor,
            })),
          ),
        )
        const payment = await tx.financeBillPayment.findUniqueOrThrow({
          where: { id: original.id },
        })
        expect(payment).toMatchObject({
          id: original.id,
          amountMinor: original.amountMinor,
          accountId: original.accountId,
          effectiveAt: original.effectiveAt,
          reference: original.reference,
          reversalEffectiveAt: input.effectiveAt,
          reversalReason: input.reason.trim(),
          reversedById: input.actorUserId,
        })
        expect(payment.reversedAt).not.toBeNull()
        expect(
          (
            await tx.financeBill.findUniqueOrThrow({
              where: { id: original.billId },
            })
          ).paidMinor.toString(),
        ).toBe(review.paidAfterMinor)
        expect(
          await reverseFinancePurchasePaymentInTransaction(tx, input),
        ).toEqual(result)
        throw Error("OWNED_PURCHASE_PAYMENT_REVERSAL_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    failure = error
  }
  expect(failure instanceof Error ? failure.message : String(failure)).toBe(
    "OWNED_PURCHASE_PAYMENT_REVERSAL_ROLLBACK",
  )
  const commandAndReplayMs = performance.now() - start
  expect(await facts()).toEqual(before)
  return {
    verified: true,
    review,
    reviewMs,
    commandAndReplayMs,
    savedFactsUnchanged: true,
  }
}
