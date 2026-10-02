import type { FinanceCommand, Prisma } from "../../../generated/prisma/client"
import { purchaseRecognitionCategories } from "./purchase-recognition-receipt-source"
import { purchaseRecognitionPosting } from "./purchase-recognition-rules"
import {
  type PurchaseRecognitionDocument,
  assertLoadedPurchaseRecognitionCosts,
  purchaseRecognitionInclude,
  verifyLoadedPurchaseRecognitionEvent,
} from "./purchase-recognition-source"
import type { ReviewedPurchaseRecognitionFacts } from "./reviewed-cost-recognition-facts"
import { FinanceError } from "./rules"

function conflict(): never {
  throw new FinanceError(
    "CONFLICT",
    "Original purchase recognition source is incomplete or corrected.",
  )
}
function resultId(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return typeof value.id === "string" ? value.id : null
}

/** Complete bounded originals under the held Book; no per-document repository reads. */
export async function loadReviewedCostPurchaseRecognitions(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    currencyCode: string
    costBillIds: string[]
  },
) {
  const ids = new Set(input.costBillIds)
  if (
    ids.size !== input.costBillIds.length ||
    ids.size > 4096 ||
    input.costBillIds.some((id) => !id.trim())
  )
    conflict()
  if (!ids.size) return new Map<string, PurchaseRecognitionDocument>()
  const documents = await tx.financePurchaseRecognition.findMany({
    where: {
      costBillId: { in: input.costBillIds },
      bookId: input.bookId,
      tenantId: input.tenantId,
    },
    include: purchaseRecognitionInclude,
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    documents.length !== ids.size ||
    new Set(documents.map((row) => row.costBillId)).size !== ids.size ||
    documents.some((row) => !ids.has(row.costBillId)) ||
    documents.reduce((sum, row) => sum + row.lines.length, 0) > 32768
  )
    conflict()
  const accounts = await tx.financeAccount.findMany({
    where: {
      bookId: input.bookId,
      code: { in: ["1300", "1310", "1340", "2000", "2050"] },
    },
    take: 6,
  })
  const controls = new Map(accounts.map((row) => [row.code, row]))
  const inventory = controls.get("1300")
  if (
    !inventory ||
    inventory.kind !== "ASSET" ||
    inventory.purpose !== "INVENTORY" ||
    inventory.archivedAt
  )
    conflict()
  const storeIds = [...new Set(documents.map((row) => row.storeId))]
  const stores = await tx.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, tenantId: true, currencyCode: true },
    take: storeIds.length + 1,
  })
  const byStore = new Map(stores.map((row) => [row.id, row]))
  for (const document of documents) {
    assertLoadedPurchaseRecognitionCosts(document, input, inventory.id)
    const store = byStore.get(document.storeId)
    if (
      !store ||
      store.tenantId !== input.tenantId ||
      store.currencyCode !== input.currencyCode ||
      document.events.length < 1 ||
      document.events.length > 3
    )
      conflict()
    for (const event of document.events) {
      if (event.reversal || event.journalEntry.reversal || event.reversalOfId)
        conflict()
      const posting = purchaseRecognitionPosting(
        event.stage,
        new Set(
          document.events
            .filter(
              (row) =>
                row.originalStage &&
                row.journalEntry.sequence < event.journalEntry.sequence,
            )
            .map((row) => row.stage),
        ),
      )
      const debit = controls.get(posting.debit)
      const credit = controls.get(posting.credit)
      if (!debit || !credit) conflict()
      verifyLoadedPurchaseRecognitionEvent(document, event, debit, credit)
    }
    if (!document.events.some((event) => event.originalStage === "RECEIPT"))
      conflict()
  }
  return new Map(documents.map((row) => [row.costBillId, row]))
}

export function reviewedCostPurchaseRecognitionFacts(
  document: PurchaseRecognitionDocument,
  registration: FinanceCommand,
  movementGoods: ReviewedPurchaseRecognitionFacts["movementGoods"],
): ReviewedPurchaseRecognitionFacts {
  return {
    id: document.id,
    tenantId: document.tenantId,
    bookId: document.bookId,
    supplierId: document.supplierId,
    storeId: document.storeId,
    costBillId: document.costBillId,
    agreedAt: document.agreedAt,
    actorUserId: document.actorUserId,
    registrationCommand: {
      ...registration,
      resultId: resultId(registration.result),
    },
    goods: document.lines.map((line) => ({
      id: line.id,
      tenantId: line.tenantId,
      bookId: line.bookId,
      recognitionId: line.recognitionId,
      costBillId: line.costBillId,
      costBillLineId: line.costBillLineId,
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      configurationVersionId: line.configurationVersionId,
      description: line.costBillLine.description,
      enteredQuantity: line.enteredQuantity.toFixed(),
      categories: purchaseRecognitionCategories(line.categories),
    })),
    stages: document.events.map((event) => ({
      id: event.id,
      bookId: event.bookId,
      supplierId: event.supplierId,
      recognitionId: event.recognitionId,
      stage: event.stage,
      originalStage: event.originalStage,
      journalEntryId: event.journalEntryId,
      debitAccountId: event.debitAccountId,
      creditAccountId: event.creditAccountId,
      effectiveAt: event.effectiveAt,
      actorUserId: event.actorUserId,
      reference: event.reference,
      reversalOfId: event.reversalOfId,
      reason: event.reason,
      sequence: event.journalEntry.sequence,
      reversed: event.reversal !== null || event.journalEntry.reversal !== null,
    })),
    movementGoods,
  }
}
