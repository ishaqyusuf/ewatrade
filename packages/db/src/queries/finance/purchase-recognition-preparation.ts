import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { RecognizeFinancePurchaseInput } from "./purchase-recognition"
import { purchaseRecognitionPosting, purchaseRecognitionText } from "./purchase-recognition-rules"
import { loadPurchaseRecognition, verifyPurchaseRecognitionEvent } from "./purchase-recognition-source"
import { requirePurchaseDate } from "./purchase-source"
import { FinanceError, assertFinancePostingDate, financeAmount } from "./rules"

export type PurchaseRecognitionInput = Omit<RecognizeFinancePurchaseInput, "clientCommandId">

/** Preserve the original command's payload normalization and stage guards. */
export function normalizePurchaseRecognition(input: PurchaseRecognitionInput) {
  requirePurchaseDate(input.effectiveAt)
  const reference = purchaseRecognitionText(
    input.reference,
    "source reference",
    160,
  )
  const invoiceAmount =
    input.stage === "INVOICE"
      ? financeAmount(input.invoiceAmountMinor ?? "")
      : null
  if (
    !["INVOICE", "OWNERSHIP", "RECEIPT"].includes(input.stage) ||
    (input.stage !== "INVOICE" &&
      (input.dueAt !== undefined || input.invoiceAmountMinor !== undefined)) ||
    (input.stage !== "RECEIPT" && input.receipts !== undefined) ||
    (input.dueAt &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.effectiveAt))
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the purchase fact, due date and receipt details.",
    )
  return { reference, invoiceAmount }
}

/** Source checks shared by advisory reviews and execution under the Book lock. */
export async function resolvePurchaseRecognitionSource(
  tx: Prisma.TransactionClient,
  input: PurchaseRecognitionInput,
  book: FinanceBook,
  invoiceAmount: bigint | null,
) {
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const document = await loadPurchaseRecognition(tx, input)
  if (
    invoiceAmount !== null &&
    invoiceAmount !== document.costBill.totalMinor
  )
    throw new FinanceError(
      "CONFLICT",
      "The invoice must match the immutable agreed goods costs; record cost differences through an explicit adjustment source.",
    )
  if (
    input.effectiveAt < document.agreedAt ||
    document.events.some((event) => event.effectiveAt > input.effectiveAt)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A purchase fact cannot precede its agreement or latest recognition.",
    )
  if (document.events.some((event) => event.reversalOfId))
    throw new FinanceError(
      "CONFLICT",
      "A corrected recognition document cannot accept new purchase facts.",
    )
  for (const event of document.events) {
    await verifyPurchaseRecognitionEvent(tx, document, event)
    if (event.journalEntry.reversal || event.reversal)
      throw new FinanceError(
        "CONFLICT",
        "The purchase source was already corrected.",
      )
  }
  const invoiceEvent = document.events.find(
    (event) => event.stage === "INVOICE",
  )
  if (invoiceEvent?.invoiceBillId) {
    const latest = await tx.financeSupplierEntry.aggregate({
      where: { bookId: book.id, billId: invoiceEvent.invoiceBillId },
      _max: { effectiveAt: true },
    })
    if (
      latest._max.effectiveAt &&
      input.effectiveAt < latest._max.effectiveAt
    )
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A purchase fact cannot precede its latest invoice settlement.",
      )
  }
  const posting = purchaseRecognitionPosting(
    input.stage,
    new Set(document.events.map((event) => event.stage)),
  )
  return { document, posting }
}
