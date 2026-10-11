import type { Prisma } from "../../../generated/prisma/client"
import { assertFinanceManager } from "./access"
import {
  normalizePurchaseRecognition,
  type PurchaseRecognitionInput,
  resolvePurchaseRecognitionSource,
} from "./purchase-recognition-preparation"
import {
  PURCHASE_RECOGNITION_CONTROLS,
  type PurchaseRecognitionControlCode,
} from "./purchase-recognition-rules"
import { FinanceError } from "./rules"

async function controlReview(
  tx: Prisma.TransactionClient,
  bookId: string,
  code: PurchaseRecognitionControlCode,
) {
  const spec = PURCHASE_RECOGNITION_CONTROLS[code]
  const account = await tx.financeAccount.findUnique({
    where: { bookId_code: { bookId, code } },
  })
  // Only these canonical controls may be created by the recognition command.
  if (!account && !["1300", "2000"].includes(code))
    return { accountId: null, code, accountName: spec.name, willCreate: true }
  if (
    !account ||
    account.bookId !== bookId ||
    account.archivedAt ||
    account.kind !== spec.kind ||
    account.purpose !== spec.purpose
  )
    throw new FinanceError(
      "CONFLICT",
      `Purchase control account ${code} is unavailable or has changed.`,
    )
  return {
    accountId: account.id,
    code,
    accountName: account.name,
    willCreate: false,
  }
}

/** Invoice/ownership advisory review. Physical receipt uses its separate stock/valuation composer. */
export async function getFinancePurchaseRecognitionReview(
  tx: Prisma.TransactionClient,
  input: PurchaseRecognitionInput & { stage: "INVOICE" | "OWNERSHIP" },
) {
  if (!["INVOICE", "OWNERSHIP"].includes(input.stage))
    throw new FinanceError(
      "CONFLICT",
      "Physical receipt requires the reviewed stock and valuation source.",
    )
  return (await purchaseRecognitionReviewSource(tx, input)).review
}

/** Source header only; physical receipt requires the stock/valuation composer. */
export async function purchaseRecognitionReviewSource<
  Stage extends "INVOICE" | "OWNERSHIP" | "RECEIPT",
>(
  tx: Prisma.TransactionClient,
  input: PurchaseRecognitionInput & { stage: Stage },
) {
  await assertFinanceManager(tx, input)
  const { reference, invoiceAmount } = normalizePurchaseRecognition(input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const { document, posting } = await resolvePurchaseRecognitionSource(
    tx,
    input,
    book,
    invoiceAmount,
  )
  const [debit, credit, store] = await Promise.all([
    controlReview(tx, book.id, posting.debit),
    controlReview(tx, book.id, posting.credit),
    tx.store.findFirstOrThrow({
      where: {
        id: document.storeId,
        tenantId: input.tenantId,
        currencyCode: book.currencyCode,
      },
      select: { id: true, name: true },
    }),
  ])
  const review = {
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt.toISOString(),
    closedThrough: book.closedThrough?.toISOString() ?? null,
    recognitionId: document.id,
    supplierId: document.supplierId,
    supplierName: document.costBill.payeeName,
    storeId: store.id,
    storeName: store.name,
    description: document.costBill.description,
    agreedAt: document.agreedAt.toISOString(),
    stage: input.stage,
    effectiveAt: input.effectiveAt.toISOString(),
    reference,
    dueAt: input.dueAt?.toISOString() ?? null,
    totalMinor: document.costBill.totalMinor.toString(),
    payableIncreaseMinor:
      input.stage === "INVOICE" ? document.costBill.totalMinor.toString() : "0",
    invoiceBillWillBeCreated: input.stage === "INVOICE",
    goods: [...document.lines]
      .sort((a, b) => a.costBillLine.position - b.costBillLine.position)
      .map((line) => ({
        lineId: line.id,
        description: line.costBillLine.description,
        amountMinor: line.costBillLine.amountMinor.toString(),
        enteredQuantity: line.enteredQuantity.toFixed(),
        enteredUnitName: line.enteredInventoryUnit.name,
        balanceSourceId: line.balanceSourceId,
        configurationVersionId: line.configurationVersionId,
      })),
    priorEvents: document.events.map((event) => ({
      eventId: event.id,
      stage: event.stage,
      effectiveAt: event.effectiveAt.toISOString(),
      journalEntryId: event.journalEntryId,
      sequence: event.journalEntry.sequence.toString(),
      invoiceBillId: event.invoiceBillId,
      reference: event.reference,
    })),
    debit,
    credit,
    stockEffect: "NONE" as const,
    moneyTransfer: "NOT_PERFORMED" as const,
    matching: "EXACT_WHOLE_DOCUMENT" as const,
  }
  return { review, document }
}
