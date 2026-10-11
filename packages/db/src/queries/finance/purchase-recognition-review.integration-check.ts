import { expect } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { getFinancePurchaseRecognition } from "./purchase-recognition-reads"
import { getFinancePurchaseRecognitionReview } from "./purchase-recognition-review"
import { recognizeFinancePurchase, recognizeFinancePurchaseInTransaction } from "./purchase-recognition"

/** Reuses the canonical suite's run-owned goods, Book and verified cleanup. */
export async function verifyPurchaseRecognitionReview(
  db: PrismaClient,
  context: FinanceActor & { bookId: string },
  document: Awaited<ReturnType<typeof getFinancePurchaseRecognition>>,
) {
  const limits = { maxWait: 10_000, timeout: 30_000 }
  const invoice = { ...context, recognitionId: document.id, stage: "INVOICE" as const,
    effectiveAt: new Date("2026-09-02T12:00:00.123Z"), reference: "QA invoice source", invoiceAmountMinor: "1100", clientCommandId: `review-invoice-${document.id}` }
  const before = await db.financeJournalEntry.count({ where: { bookId: context.bookId } })
  console.info("Recognition review acceptance: invoice preview and rollback")
  const review = await db.$transaction(tx => getFinancePurchaseRecognitionReview(tx, invoice), limits)
  expect(review).toMatchObject({ recognitionId: document.id, totalMinor: "1100", payableIncreaseMinor: "1100", invoiceBillWillBeCreated: true, debit: { code: "1340", willCreate: true }, credit: { code: "2000", willCreate: false }, stockEffect: "NONE", moneyTransfer: "NOT_PERFORMED" })
  expect(review.goods.map(line => line.amountMinor)).toEqual(["1000", "100"])
  expect(await db.financeAccount.count({ where: { bookId: context.bookId, code: "1340" } })).toBe(0)
  await expect(db.$transaction(async tx => {
    await recognizeFinancePurchaseInTransaction(tx, invoice)
    throw Error("Injected recognition completion failure")
  }, limits)).rejects.toThrow("Injected recognition completion failure")
  expect(await db.financePurchaseRecognitionEvent.count({ where: { bookId: context.bookId } })).toBe(0)
  expect(await db.financeBill.count({ where: { bookId: context.bookId, kind: "PURCHASE" } })).toBe(0)
  expect(await db.financeJournalEntry.count({ where: { bookId: context.bookId } })).toBe(before)
  expect(await db.financeAccount.count({ where: { bookId: context.bookId, code: "1340" } })).toBe(0)
  await expect(db.$transaction(tx => getFinancePurchaseRecognitionReview(tx, { ...invoice, invoiceAmountMinor: "1000" }), limits)).rejects.toMatchObject({ code: "CONFLICT" })
  console.info("Recognition review acceptance: invoice execution and replay")
  const savedInvoice = await recognizeFinancePurchase(db, invoice)
  expect(await recognizeFinancePurchase(db, invoice)).toEqual(savedInvoice)
  await expect(db.$transaction(tx => getFinancePurchaseRecognitionReview(tx, invoice), limits)).rejects.toMatchObject({ code: "CONFLICT" })
  const ownership = { ...context, recognitionId: document.id, stage: "OWNERSHIP" as const,
    effectiveAt: new Date("2026-09-03T12:00:00.123Z"), reference: "QA title transfer source", clientCommandId: `review-ownership-${document.id}` }
  console.info("Recognition review acceptance: ownership after invoice")
  expect(await db.$transaction(tx => getFinancePurchaseRecognitionReview(tx, ownership), limits)).toMatchObject({
    stage: "OWNERSHIP", payableIncreaseMinor: "0", invoiceBillWillBeCreated: false,
    debit: { code: "1310", willCreate: true }, credit: { code: "1340", willCreate: false },
    priorEvents: [{ eventId: savedInvoice.id, stage: "INVOICE" }], stockEffect: "NONE",
  })
  const savedOwnership = await recognizeFinancePurchase(db, ownership)
  expect(await recognizeFinancePurchase(db, ownership)).toEqual(savedOwnership)
  const record = await getFinancePurchaseRecognition(db, { ...context, recognitionId: document.id })
  expect(record.events.map(event => ({ stage: event.stage, date: event.effectiveAt.toISOString(), reference: event.reference }))).toEqual([
    { stage: "INVOICE", date: invoice.effectiveAt.toISOString(), reference: invoice.reference },
    { stage: "OWNERSHIP", date: ownership.effectiveAt.toISOString(), reference: ownership.reference },
  ])
  expect(record.lines.every(line => line.receiptId === null)).toBe(true)
  const where = { bookId: context.bookId }
  expect(await db.financeBill.count({ where: { ...where, kind: "PURCHASE" } })).toBe(1)
  expect(await db.financeSupplierEntry.findMany({ where, select: { kind: true, side: true, amountMinor: true } })).toEqual([{ kind: "PURCHASE_BILL", side: "CREDIT", amountMinor: 1100n }])
  expect(await db.financePurchaseReceiptLine.count({ where })).toBe(0)
  expect(await db.stockOperation.count({ where: { tenantId: context.tenantId } })).toBe(0)
  expect(await db.financeJournalEntry.count({ where })).toBe(before + 2)
  const journals = await db.financeJournalEntry.findMany({ where: { ...where, sourceKind: { in: ["PURCHASE_BILL", "PURCHASE_OWNERSHIP_RECOGNITION"] } }, include: { lines: { include: { account: true } } }, orderBy: { sequence: "asc" } })
  expect(journals).toHaveLength(2)
  expect(journals.map(j => j.lines.map(line => ({ code: line.account.code, debit: line.debitMinor.toString(), credit: line.creditMinor.toString() })).sort((a,b) => a.code.localeCompare(b.code)))).toEqual([
    [{ code: "1340", debit: "1100", credit: "0" }, { code: "2000", debit: "0", credit: "1100" }],
    [{ code: "1310", debit: "1100", credit: "0" }, { code: "1340", debit: "0", credit: "1100" }],
  ])
  console.info("Recognition review acceptance: two exact balanced journals, one payable and no stock")
}
