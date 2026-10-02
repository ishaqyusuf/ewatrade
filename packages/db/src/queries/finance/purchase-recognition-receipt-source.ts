import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import type { Prisma } from "../../../generated/prisma/client"
import {
  loadPurchaseRecognition,
  verifyPurchaseRecognitionEvent,
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
  if (
    !event ||
    event.reversal ||
    event.journalEntry.reversal ||
    event.actorUserId !== input.actorUserId ||
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
  await verifyPurchaseRecognitionEvent(tx, document, event)
  return event.effectiveAt
}
