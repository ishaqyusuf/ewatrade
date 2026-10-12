import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import {
  getFinancePurchaseRecognitionReversalReview,
  prepareReviewedFinancePurchaseRecognitionReversalInTransaction,
  reverseFinancePurchaseRecognitionInTransaction,
  type ReverseFinancePurchaseRecognitionInput,
} from "./purchase-recognition-reversals"

/** Exact classified caller-owned QA fact. Correction, invoice void and replay roll back together. */
export async function verifyPurchaseRecognitionReversalRollback(
  db: PrismaClient,
  input: ReverseFinancePurchaseRecognitionInput,
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
  const original = await db.financePurchaseRecognitionEvent.findFirstOrThrow({
    where: {
      id: input.eventId,
      bookId: input.bookId,
      recognitionId: input.recognitionId,
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
    events: await db.financePurchaseRecognitionEvent.count({
      where: { bookId: input.bookId },
    }),
    entries: await db.financeSupplierEntry.count({
      where: { bookId: input.bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({
      where: { bookId: input.bookId },
    }),
    valuation: await db.financeInventoryValuationEvent.count({
      where: { bookId: input.bookId },
    }),
    invoice: original.invoiceBillId
      ? await db.financeBill.findUniqueOrThrow({
          where: { id: original.invoiceBillId },
          select: {
            voidedAt: true,
            voidEffectiveAt: true,
            voidedById: true,
            voidReason: true,
            paidMinor: true,
            totalMinor: true,
          },
        })
      : null,
    sequence: (
      await db.financeBook.findUniqueOrThrow({
        where: { id: input.bookId },
        select: { lastSequence: true },
      })
    ).lastSequence.toString(),
  })
  const before = await facts(),
    reviewStarted = performance.now(),
    review = await getFinancePurchaseRecognitionReversalReview(db, input),
    reviewMs = performance.now() - reviewStarted
  let failure: unknown
  const start = performance.now()
  try {
    await db.$transaction(
      async (tx) => {
        const p =
          await prepareReviewedFinancePurchaseRecognitionReversalInTransaction(
            tx,
            input,
          )
        expect(p.review).toEqual(review)
        const result = await p.execute(input.clientCommandId)
        expect(await p.execute(input.clientCommandId)).toEqual(result)
        expect(() => p.execute(input.clientCommandId + "-other")).toThrow(
          "one command",
        )
        const saved =
          await tx.financePurchaseRecognitionEvent.findUniqueOrThrow({
            where: { id: result.id },
            include: { journalEntry: { include: { lines: true } } },
          })
        expect(saved).toMatchObject({
          bookId: input.bookId,
          recognitionId: input.recognitionId,
          supplierId: original.supplierId,
          stage: original.stage,
          reversalOfId: original.id,
          reason: input.reason.trim(),
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
        })
        expect(saved.journalEntry).toMatchObject({
          sourceKind: "PURCHASE_RECOGNITION_REVERSAL",
          sourceId: saved.id,
          reversalOfId: original.journalEntryId,
          effectiveAt: input.effectiveAt,
          actorUserId: input.actorUserId,
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
        if (original.invoiceBillId) {
          expect(
            await tx.financeBill.findUniqueOrThrow({
              where: { id: original.invoiceBillId },
            }),
          ).toMatchObject({
            paidMinor: 0n,
            totalMinor: BigInt(review.totalMinor),
            voidEffectiveAt: input.effectiveAt,
            voidReason: input.reason.trim(),
            voidedById: input.actorUserId,
          })
          expect(
            (
              await tx.financeBill.findUniqueOrThrow({
                where: { id: original.invoiceBillId },
              })
            ).voidedAt,
          ).not.toBeNull()
          expect(
            await tx.financeSupplierEntry.findFirstOrThrow({
              where: { journalEntryId: saved.journalEntryId },
            }),
          ).toMatchObject({
            kind: "REVERSAL",
            side: "DEBIT",
            billId: original.invoiceBillId,
            amountMinor: BigInt(review.totalMinor),
            actorUserId: input.actorUserId,
          })
        }
        expect(
          await reverseFinancePurchaseRecognitionInTransaction(tx, input),
        ).toEqual(result)
        throw Error("OWNED_PURCHASE_FACT_REVERSAL_ROLLBACK")
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    failure = error
  }
  expect(failure instanceof Error ? failure.message : String(failure)).toBe(
    "OWNED_PURCHASE_FACT_REVERSAL_ROLLBACK",
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
