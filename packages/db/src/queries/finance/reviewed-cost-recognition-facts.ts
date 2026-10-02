import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import type { ReviewedPurchaseSourceFacts } from "./reviewed-cost-purchase-facts"

/** Retained agreement and original dated stage facts, never an inferred invoice. */
export type ReviewedPurchaseRecognitionFacts = {
  id: string
  tenantId: string
  bookId: string
  supplierId: string
  storeId: string
  costBillId: string
  agreedAt: Date
  actorUserId: string
  registrationCommand: ReviewedPurchaseSourceFacts["command"]
  goods: Array<{
    id: string
    tenantId: string
    bookId: string
    recognitionId: string
    costBillId: string
    costBillLineId: string
    description: string
    balanceSourceId: string
    enteredInventoryUnitId: string
    configurationVersionId: string
    enteredQuantity: string
    categories: Array<{ name: string } | { categoryNameId: number }>
  }>
  stages: Array<{
    id: string
    bookId: string
    supplierId: string
    recognitionId: string
    stage: FinancePurchaseRecognitionStage
    originalStage: FinancePurchaseRecognitionStage | null
    journalEntryId: string
    sequence: bigint
    debitAccountId: string
    creditAccountId: string
    effectiveAt: Date
    actorUserId: string
    reference: string
    reversalOfId: string | null
    reversed: boolean
    reason: string | null
  }>
  movementGoods: {
    enteredInventoryUnitId: string
    configurationVersionId: string
    enteredQuantity: string
  }
}
