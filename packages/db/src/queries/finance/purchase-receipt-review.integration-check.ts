import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { getFinancePurchaseReceiptReview } from "./purchase-receipt-review"
import {
  recognizeFinancePurchaseInTransaction,
  recognizeReviewedFinancePurchaseReceiptInTransaction,
  purchaseReceiptReviewDigest,
} from "./purchase-recognition"

/** Caller supplies a guarded owned QA agreement; every attempted receipt write rolls back. */
export async function verifyPurchaseReceiptReview(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    recognitionId: string
    effectiveAt: Date
    reference: string
    clientCommandId: string
  },
  mode: "canonical" | "reviewed" = "canonical",
) {
  const facts = async () => ({
    events: await db.financePurchaseRecognitionEvent.count({
      where: { bookId: input.bookId },
    }),
    journals: await db.financeJournalEntry.count({
      where: { bookId: input.bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({
      where: { bookId: input.bookId },
    }),
  })
  const before = await facts()
  const start = performance.now()
  const review = await db.$transaction(
    (tx) => getFinancePurchaseReceiptReview(tx, { ...input, stage: "RECEIPT" }),
    { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
  )
  const reviewMs = performance.now() - start
  expect(await facts()).toEqual(before)
  expect(review.stockEffect).toBe("RECEIPT")
  expect(review.payableIncreaseMinor).toBe("0")
  expect(review.moneyTransfer).toBe("NOT_PERFORMED")
  expect(review.goods.length).toBe(review.receipts.length)
  for (const line of review.goods) {
    const confirmation = review.receipts.find((r) => r.lineId === line.lineId)
    if (!confirmation) throw Error("Review omitted an original receipt line")
    expect(line.stock.revision).toBe(confirmation.expectedBalanceRevision)
    expect(line.valuation.sourceCostMinor).toBe(line.amountMinor)
  }
  if (mode === "reviewed") {
    await expect(
      db.$transaction(
        (tx) =>
          recognizeReviewedFinancePurchaseReceiptInTransaction(tx, {
            ...input,
            expectedReviewDigest: "0".repeat(64),
          }),
        { maxWait: 10000, timeout: 30000 },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(await facts()).toEqual(before)
  }
  const commandStart = performance.now()
  let verified = false
  try {
    await db.$transaction(
      async (tx) => {
        if (mode === "reviewed") {
          await recognizeReviewedFinancePurchaseReceiptInTransaction(tx, {
            ...input,
            expectedReviewDigest: purchaseReceiptReviewDigest(review),
          })
        } else {
          await recognizeFinancePurchaseInTransaction(tx, {
            ...input,
            stage: "RECEIPT",
            receipts: review.receipts,
          })
        }
        const events = await tx.financeInventoryValuationEvent.findMany({
          where: {
            bookId: input.bookId,
            balanceSourceId: { in: review.goods.map((g) => g.balanceSourceId) },
            effectiveAt: input.effectiveAt,
            kind: "PURCHASE_RECEIPT",
          },
        })
        expect(events.length).toBe(review.goods.length)
        for (const goods of review.goods) {
          const event = events.find(
            (e) => e.balanceSourceId === goods.balanceSourceId,
          )
          if (!event)
            throw Error(
              "Receipt produced no valuation for the original balance source",
            )
          expect(event.quantityBefore.toFixed()).toBe(
            goods.valuation.quantityBefore,
          )
          expect(event.canonicalEffect.toFixed()).toBe(
            goods.valuation.canonicalEffect,
          )
          expect(event.quantityAfter.toFixed()).toBe(
            goods.valuation.quantityAfter,
          )
          expect(event.sourceCostMinor?.toString() ?? null).toBe(
            goods.valuation.sourceCostMinor,
          )
          expect(event.valueBeforeMinor?.toString() ?? null).toBe(
            goods.valuation.valueBeforeMinor,
          )
          expect(event.valueDeltaMinor?.toString() ?? null).toBe(
            goods.valuation.valueDeltaMinor,
          )
          expect(event.valueAfterMinor?.toString() ?? null).toBe(
            goods.valuation.valueAfterMinor,
          )
          expect(event.unknownReason).toBe(goods.valuation.unknownReason)
          expect(event.sequence.toString()).toBe(goods.valuation.nextSequence)
        }
        verified = true
        throw Error("RECEIPT_REVIEW_ROLLBACK")
      },
      { maxWait: 10000, timeout: 30000 },
    )
  } catch (error) {
    if (
      !(
        verified &&
        error instanceof Error &&
        error.message === "RECEIPT_REVIEW_ROLLBACK"
      )
    )
      throw error
  }
  const commandMs = performance.now() - commandStart
  expect(await facts()).toEqual(before)
  return {
    mode,
    review,
    reviewMs,
    commandMs,
    before,
    rollbackVerified: verified,
  }
}
