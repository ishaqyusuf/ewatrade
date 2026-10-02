import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { purchaseRecognitionText } from "./purchase-recognition-rules"
import { loadPurchaseRecognition } from "./purchase-recognition-source"

export async function getFinancePurchaseRecognition(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; recognitionId: string },
) {
  purchaseRecognitionText(input.bookId, "book identity", 128)
  purchaseRecognitionText(input.recognitionId, "purchase identity", 128)
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const document = await loadPurchaseRecognition(tx, input)
      return {
        id: document.id,
        bookId: document.bookId,
        supplierId: document.supplierId,
        storeId: document.storeId,
        agreedAt: document.agreedAt,
        description: document.costBill.description,
        amountMinor: document.costBill.totalMinor.toString(),
        invoiceBillId:
          document.events.find((event) => event.originalStage === "INVOICE")
            ?.invoiceBillId ?? null,
        corrected: document.events.some((event) => event.reversalOfId !== null),
        lines: document.lines
          .sort((a, b) => a.costBillLine.position - b.costBillLine.position)
          .map((line) => {
            const receipt = document.costBill.lines.find(
              (cost) => cost.id === line.costBillLineId,
            )?.purchaseReceipt
            const valuation = receipt?.valuationEvent
            return {
              id: line.id,
              position: line.costBillLine.position,
              description: line.costBillLine.description,
              amountMinor: line.costBillLine.amountMinor.toString(),
              balanceSourceId: line.balanceSourceId,
              enteredInventoryUnitId: line.enteredInventoryUnitId,
              configurationVersionId: line.configurationVersionId,
              enteredQuantity: line.enteredQuantity.toFixed(),
              categories: line.categories,
              receiptId: receipt?.id ?? null,
              receipt: receipt
                ? {
                    id: receipt.id,
                    stockOperationId: receipt.stockOperationId,
                    stockMovementId: receipt.stockMovementId,
                    valuation: valuation
                      ? {
                          id: valuation.id,
                          sourceCostMinor:
                            valuation.sourceCostMinor?.toString() ?? null,
                          canonicalEffect: valuation.canonicalEffect.toFixed(),
                          effectiveAt: valuation.effectiveAt,
                          status:
                            valuation.valueAfterMinor === null
                              ? "UNKNOWN"
                              : "KNOWN",
                        }
                      : null,
                  }
                : null,
            }
          }),
        events: document.events.map((event) => ({
          id: event.id,
          stage: event.stage,
          effectiveAt: event.effectiveAt,
          reference: event.reference,
          actorUserId: event.actorUserId,
          journalEntryId: event.journalEntryId,
          sequence: event.journalEntry.sequence.toString(),
          debitAccountId: event.debitAccountId,
          creditAccountId: event.creditAccountId,
          invoiceBillId: event.invoiceBillId,
          reversalOfId: event.reversalOfId,
          reason: event.reason,
          reversalId: event.reversal?.id ?? null,
        })),
        limits: {
          receiptCorrection: "SUPPLIER_RETURN_SOURCE_REQUIRED",
          matching: "EXACT_WHOLE_DOCUMENT",
        },
      }
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
