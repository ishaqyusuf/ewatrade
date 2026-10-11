import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import type { Prisma } from "../../../generated/prisma/client"
import {
  loadPurchaseRecognition,
  verifyPurchaseRecognitionEvent,
  type PurchaseRecognitionDocument,
} from "./purchase-recognition-source"
import { FinanceError } from "./rules"

export function purchaseRecognitionCategories(
  value: Prisma.JsonValue,
): StockCategorySelector[] {
  if (!Array.isArray(value))
    throw new FinanceError(
      "CONFLICT",
      "The original receipt categories have changed.",
    )
  const selectors: StockCategorySelector[] = value.map((row) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      if (
        typeof row.categoryNameId === "number" &&
        Object.keys(row).length === 1
      )
        return { categoryNameId: row.categoryNameId }
      if (typeof row.name === "string" && Object.keys(row).length === 1)
        return { name: row.name }
    }
    throw new FinanceError(
      "CONFLICT",
      "The original receipt categories have changed.",
    )
  })
  try {
    return normalizeStockCategorySelectors(selectors)
  } catch {
    throw new FinanceError(
      "CONFLICT",
      "The original receipt categories have changed.",
    )
  }
}

/** A later physical receipt owns its date and actor; the agreement owns cost. */
export async function getPurchaseRecognitionReceiptDate(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    costBillId: string
    costBillLineId: string
    stockMovementId: string
    actorUserId: string
  },
) {
  const owner = await tx.financePurchaseRecognition.findUnique({
    where: { costBillId: input.costBillId },
    select: { id: true },
  })
  if (!owner)
    throw new FinanceError(
      "CONFLICT",
      "The accrued receipt has no purchase recognition owner.",
    )
  const document = await loadPurchaseRecognition(tx, {
    ...input,
    recognitionId: owner.id,
  })
  const event = document.events.find((row) => row.originalStage === "RECEIPT")
  const line = document.lines.find(
    (row) => row.costBillLineId === input.costBillLineId,
  )
  const movement = await tx.stockMovement.findUnique({
    where: { id: input.stockMovementId },
    include: { operation: true },
  })
  const datedEvent = assertReceiptMovement(
    document,
    event,
    line,
    movement,
    input.actorUserId,
  )

  await verifyPurchaseRecognitionEvent(tx, document, datedEvent)
  return datedEvent.effectiveAt
}

type ReceiptMovement = Prisma.StockMovementGetPayload<{
  include: { operation: true }
}>
function assertReceiptMovement(
  document: PurchaseRecognitionDocument,
  event: PurchaseRecognitionDocument["events"][number] | undefined,
  line: PurchaseRecognitionDocument["lines"][number] | undefined,
  movement: ReceiptMovement | null | undefined,
  actorUserId: string,
) {
  if (
    !event ||
    event.reversal ||
    event.journalEntry.reversal ||
    event.actorUserId !== actorUserId ||
    !line ||
    !movement ||
    movement.balanceSourceId !== line.balanceSourceId ||
    movement.enteredInventoryUnitId !== line.enteredInventoryUnitId ||
    movement.configurationVersionId !== line.configurationVersionId ||
    movement.enteredQuantity.toFixed() !== line.enteredQuantity.toFixed() ||
    movement.operation.effectiveAt.getTime() !== event.effectiveAt.getTime() ||
    movement.operation.actorUserId !== event.actorUserId ||
    movement.operation.tenantId !== document.tenantId ||
    movement.operation.storeId !== document.storeId
  )
    throw new FinanceError(
      "CONFLICT",
      "The receipt does not match its original recognition goods and dated owner.",
    )
  return event
}

/** Private batch source proof. Read the complete owner once, never accept a supplied graph. */
export async function getPurchaseRecognitionReceiptDates(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    actorUserId: string
    receipts: Array<{
      costBillId: string
      costBillLineId: string
      stockMovementId: string
    }>
  },
) {
  if (
    !input.receipts.length ||
    input.receipts.length > 10 ||
    new Set(input.receipts.map((r) => r.stockMovementId)).size !==
      input.receipts.length ||
    new Set(input.receipts.map((r) => r.costBillLineId)).size !==
      input.receipts.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Choose 1–10 distinct original receipt lines.",
    )
  const costBillIds = [...new Set(input.receipts.map((r) => r.costBillId))]
  const owners = await tx.financePurchaseRecognition.findMany({
    where: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      costBillId: { in: costBillIds },
    },
    select: { id: true, costBillId: true },
    take: 11,
  })
  if (owners.length !== costBillIds.length)
    throw new FinanceError(
      "CONFLICT",
      "The accrued receipts have no exact purchase recognition owners.",
    )
  const movements = await tx.stockMovement.findMany({
    where: { id: { in: input.receipts.map((r) => r.stockMovementId) } },
    include: { operation: true },
    take: 11,
  })
  if (movements.length !== input.receipts.length)
    throw new FinanceError(
      "CONFLICT",
      "The original receipt movements are unavailable.",
    )
  const dates = new Map<string, Date>()
  for (const owner of owners) {
    const document = await loadPurchaseRecognition(tx, {
      ...input,
      recognitionId: owner.id,
    })
    if (document.costBillId !== owner.costBillId)
      throw new FinanceError("CONFLICT", "The accrued receipt owner changed.")
    const event = document.events.find((row) => row.originalStage === "RECEIPT")
    for (const receipt of input.receipts.filter(
      (r) => r.costBillId === owner.costBillId,
    )) {
      const datedEvent = assertReceiptMovement(
        document,
        event,
        document.lines.find(
          (row) => row.costBillLineId === receipt.costBillLineId,
        ),
        movements.find((row) => row.id === receipt.stockMovementId),
        input.actorUserId,
      )
      dates.set(receipt.stockMovementId, datedEvent.effectiveAt)
    }
    // Same exact immutable journal/control check, once for this complete owner.
    if (!event)
      throw new FinanceError(
        "CONFLICT",
        "The original receipt fact is unavailable.",
      )
    await verifyPurchaseRecognitionEvent(tx, document, event)
  }
  return dates
}
