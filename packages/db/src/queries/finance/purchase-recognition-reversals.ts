import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { postFinanceJournalInTransaction } from "./posting"
import {
  assertPurchaseRecognitionReversal,
  purchaseRecognitionText,
} from "./purchase-recognition-rules"
import {
  loadPurchaseRecognition,
  verifyPurchaseRecognitionEvent,
} from "./purchase-recognition-source"
import { purchaseJournalEntryId, requirePurchaseDate } from "./purchase-source"
import { FinanceError, assertFinancePostingDate } from "./rules"

export type ReverseFinancePurchaseRecognitionInput = FinanceActor & {
  bookId: string
  clientCommandId: string
  recognitionId: string
  eventId: string
  effectiveAt: Date
  reason: string
}

export async function reverseFinancePurchaseRecognitionInTransaction(
  tx: Prisma.TransactionClient,
  input: ReverseFinancePurchaseRecognitionInput,
) {
  const reason = purchaseRecognitionText(input.reason, "correction reason", 400)
  requirePurchaseDate(input.effectiveAt)
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  return financeDocumentCommand(
    tx,
    input,
    "REVERSE_PURCHASE_RECOGNITION",
    { ...payload, reason },
    async (book) => {
      assertFinancePostingDate({
        effectiveAt: input.effectiveAt,
        startsAt: book.startsAt,
        closedThrough: book.closedThrough,
        now: new Date(),
      })
      const document = await loadPurchaseRecognition(tx, input)
      const event = document.events.find((row) => row.id === input.eventId)
      if (!event)
        throw new FinanceError(
          "NOT_FOUND",
          "Purchase fact not found in this document.",
        )
      if (event.reversal || event.journalEntry.reversal)
        throw new FinanceError(
          "CONFLICT",
          "This purchase fact is already corrected.",
        )
      const { debit, credit } = await verifyPurchaseRecognitionEvent(
        tx,
        document,
        event,
      )
      assertPurchaseRecognitionReversal(
        event.stage,
        event.journalEntry.sequence,
        document.events
          .filter((row) => row.originalStage && !row.reversal)
          .map((row) => row.journalEntry.sequence),
      )
      if (document.events.some((row) => row.effectiveAt > input.effectiveAt))
        throw new FinanceError(
          "INVALID_JOURNAL",
          "A correction cannot precede the latest purchase fact.",
        )
      if (event.invoiceBill) {
        const latest = await tx.financeSupplierEntry.aggregate({
          where: { bookId: book.id, billId: event.invoiceBill.id },
          _max: { effectiveAt: true },
        })
        if (
          latest._max.effectiveAt &&
          input.effectiveAt < latest._max.effectiveAt
        )
          throw new FinanceError(
            "INVALID_JOURNAL",
            "A correction cannot precede the latest invoice settlement.",
          )
        const [payments, allocations, releases] = await Promise.all([
          tx.financeBillPayment.aggregate({
            where: {
              bookId: book.id,
              billId: event.invoiceBill.id,
              reversedAt: null,
            },
            _sum: { amountMinor: true },
          }),
          tx.financeSupplierAllocation.aggregate({
            where: { bookId: book.id, billId: event.invoiceBill.id },
            _sum: { amountMinor: true },
          }),
          tx.financeSupplierAllocationRelease.aggregate({
            where: {
              bookId: book.id,
              allocation: { billId: event.invoiceBill.id },
            },
            _sum: { amountMinor: true },
          }),
        ])
        if (
          event.invoiceBill.voidedAt ||
          event.invoiceBill.paidMinor !== BigInt(0) ||
          (payments._sum.amountMinor ?? BigInt(0)) !== BigInt(0) ||
          (allocations._sum.amountMinor ?? BigInt(0)) !==
            (releases._sum.amountMinor ?? BigInt(0))
        )
          throw new FinanceError(
            "CONFLICT",
            "Reverse payments and release consumed advances before correcting this invoice.",
          )
      }
      const reversalId = randomUUID()
      const journal = await postFinanceJournalInTransaction(tx, {
        ...input,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "recognition-reversal",
        ),
        sourceKind: "PURCHASE_RECOGNITION_REVERSAL",
        sourceId: reversalId,
        reversalOfId: event.journalEntryId,
        description: reason,
        storeId: document.storeId,
        lines: [
          {
            accountId: credit.id,
            side: "DEBIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
          {
            accountId: debit.id,
            side: "CREDIT",
            amountMinor: document.costBill.totalMinor.toString(),
          },
        ],
      })
      const journalEntryId = purchaseJournalEntryId(journal)
      await tx.financePurchaseRecognitionEvent.create({
        data: {
          id: reversalId,
          bookId: book.id,
          supplierId: document.supplierId,
          recognitionId: document.id,
          stage: event.stage,
          journalEntryId,
          debitAccountId: credit.id,
          creditAccountId: debit.id,
          effectiveAt: input.effectiveAt,
          reference: event.reference,
          actorUserId: input.actorUserId,
          reversalOfId: event.id,
          reason,
        },
      })
      if (event.invoiceBill) {
        const original = event.invoiceBill.supplierEntries[0]
        if (!original)
          throw new FinanceError(
            "CONFLICT",
            "The invoice supplier source is missing.",
          )
        await tx.financeSupplierEntry.create({
          data: {
            bookId: book.id,
            supplierId: document.supplierId,
            kind: "REVERSAL",
            side: "DEBIT",
            amountMinor: document.costBill.totalMinor,
            journalEntryId,
            effectiveAt: input.effectiveAt,
            actorUserId: input.actorUserId,
            description: reason,
            reversalOfId: original.id,
            billId: event.invoiceBill.id,
          },
        })
        await tx.financeBill.update({
          where: { id: event.invoiceBill.id },
          data: {
            voidedAt: new Date(),
            voidEffectiveAt: input.effectiveAt,
            voidedById: input.actorUserId,
            voidReason: reason,
          },
        })
      }
      return { id: reversalId }
    },
  )
}

export async function reverseFinancePurchaseRecognition(
  db: PrismaClient,
  input: ReverseFinancePurchaseRecognitionInput,
) {
  return db.$transaction(
    (tx) => reverseFinancePurchaseRecognitionInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}
