import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { getPurchaseRecognitionReceiptDate } from "./purchase-recognition-receipt-source"
import { FinanceError, financeAmount } from "./rules"
import { addQuantities, normalizeQuantity } from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")

/** Internal purchase adapter. Its caller holds the Book and stock locks. */
export async function recordPurchaseReceiptValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    bookId: string
    receiptId: string
    actorUserId: string
    expectedStockRevision: number
  },
) {
  const receipt = await tx.financePurchaseReceiptLine.findFirst({
    where: {
      id: input.receiptId,
      tenantId: input.tenantId,
      bookId: input.bookId,
    },
    include: {
      billLine: { include: { bill: true, account: true } },
      stockMovement: { include: { balanceSource: true, operation: true } },
      valuationEvent: true,
    },
  })
  if (!receipt) {
    throw new FinanceError(
      "NOT_FOUND",
      "Purchase receipt not found in this book.",
    )
  }
  const { billLine, stockMovement: movement } = receipt
  const { bill, account } = billLine
  const { balanceSource: balance, operation } = movement
  const recognitionReceipt = bill.kind === "PURCHASE_ACCRUAL"
  const effectiveAt = recognitionReceipt
    ? await getPurchaseRecognitionReceiptDate(tx, {
        ...input,
        costBillId: bill.id,
        costBillLineId: billLine.id,
        stockMovementId: movement.id,
      })
    : bill.incurredAt
  if (
    (bill.kind !== "PURCHASE" && !recognitionReceipt) ||
    bill.voidedAt ||
    !bill.supplierId ||
    (!recognitionReceipt && bill.actorUserId !== input.actorUserId) ||
    operation.actorUserId !== input.actorUserId ||
    operation.tenantId !== input.tenantId ||
    balance.tenantId !== input.tenantId ||
    operation.type !== "RECEIPT" ||
    operation.source !== "finance_purchase" ||
    operation.id !== receipt.stockOperationId ||
    operation.storeId !== bill.storeId ||
    balance.storeId !== bill.storeId ||
    operation.effectiveAt.getTime() !== effectiveAt.getTime() ||
    account.kind !== "ASSET" ||
    account.purpose !== "INVENTORY" ||
    account.code !== "1300"
  ) {
    throw new FinanceError("CONFLICT", "Purchase valuation provenance changed.")
  }
  const sourceCostMinor = financeAmount(billLine.amountMinor.toString())
  // Prisma Decimal.toString can use scientific notation; toFixed keeps exact
  // decimal text for the bounded quantity parser.
  const canonicalQuantity = (quantity: Prisma.Decimal) =>
    normalizeQuantity(
      balance.kind === "PACKAGED_STOCK"
        ? multiplyExactDecimals(
            quantity.toFixed(),
            movement.unitFactorSnapshot.toFixed(),
            18,
          )
        : quantity.toFixed(),
    )
  const effect = normalizeQuantity(movement.signedCanonicalEffect.toFixed())
  const before = canonicalQuantity(movement.previousOnHandQuantity)
  const after = canonicalQuantity(movement.resultingOnHandQuantity)
  if (effect === "0" || addQuantities(before, effect) !== after) {
    throw new FinanceError(
      "CONFLICT",
      "Purchase receipt quantity is inconsistent.",
    )
  }
  const previous = receipt.valuationEvent
  if (previous) {
    if (
      previous.kind !== "PURCHASE_RECEIPT" ||
      previous.sourceKind !== "PURCHASE_RECEIPT" ||
      previous.sourceId !== receipt.id ||
      previous.sourceCostMinor !== sourceCostMinor ||
      previous.actorUserId !== input.actorUserId ||
      previous.effectiveAt.getTime() !== effectiveAt.getTime() ||
      previous.canonicalEffect.toFixed() !==
        movement.signedCanonicalEffect.toFixed()
    ) {
      throw new FinanceError(
        "CONFLICT",
        "Purchase valuation source already differs.",
      )
    }
    return previous
  }
  if (
    !Number.isInteger(input.expectedStockRevision) ||
    input.expectedStockRevision < 1 ||
    balance.revision !== input.expectedStockRevision ||
    canonicalQuantity(balance.onHandQuantity) !== after
  ) {
    throw new FinanceError(
      "CONFLICT",
      "Purchase valuation requires its current receipt.",
    )
  }
  // The Finance Book lock serializes pool creation and updates. Movement count
  // detects uncosted writes even when they net to zero; reservations alone do
  // not invalidate carrying value merely because they change the stock revision.
  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: input.bookId,
        balanceSourceId: balance.id,
      },
    },
  })
  if (pool && effectiveAt < pool.latestEffectiveAt) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A costed receipt cannot precede its latest valuation event.",
    )
  }
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    throw new FinanceError(
      "CONFLICT",
      "Inventory movement history cannot be counted.",
    )
  }
  const movementCountExact = BigInt(movementCount)
  let valueBeforeMinor: bigint | null = null
  let unknownReason: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (before === "0" && movementCountExact === BigInt(1)) {
      valueBeforeMinor = BigInt(0)
    } else {
      unknownReason =
        before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
    }
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCountExact
  ) {
    unknownReason = "UNCAPTURED_MOVEMENTS"
  } else if (pool.valueMinor === null) {
    unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    if (pool.valueMinor < BigInt(0) || pool.unknownReason !== null) {
      throw new FinanceError(
        "CONFLICT",
        "The inventory valuation pool is inconsistent.",
      )
    }
    valueBeforeMinor = pool.valueMinor
  }
  const valueAfterMinor =
    valueBeforeMinor === null ? null : valueBeforeMinor + sourceCostMinor
  if (valueAfterMinor !== null && valueAfterMinor > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Inventory carrying value exceeds its limit.",
    )
  }
  const sequence = (pool?.lastSequence ?? BigInt(0)) + BigInt(1)
  if (sequence > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "CONFLICT",
      "Inventory valuation sequence exceeds its limit.",
    )
  }
  const data = {
    quantity: after,
    valueMinor: valueAfterMinor,
    unknownReason,
    lastStockRevision: input.expectedStockRevision,
    lastMovementCount: movementCountExact,
    lastSequence: sequence,
    latestEffectiveAt: effectiveAt,
  }
  const currentPool = pool
    ? await tx.financeInventoryPool.update({ where: { id: pool.id }, data })
    : await tx.financeInventoryPool.create({
        data: {
          ...data,
          tenantId: input.tenantId,
          bookId: input.bookId,
          balanceSourceId: balance.id,
        },
      })
  return tx.financeInventoryValuationEvent.create({
    data: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      poolId: currentPool.id,
      balanceSourceId: balance.id,
      sequence,
      kind: "PURCHASE_RECEIPT",
      sourceKind: "PURCHASE_RECEIPT",
      sourceId: receipt.id,
      stockOperationId: operation.id,
      stockMovementId: movement.id,
      purchaseReceiptId: receipt.id,
      canonicalEffect: effect,
      quantityBefore: before,
      quantityAfter: after,
      valueBeforeMinor,
      valueDeltaMinor: valueBeforeMinor === null ? null : sourceCostMinor,
      valueAfterMinor,
      sourceCostMinor,
      unknownReason,
      effectiveAt,
      actorUserId: input.actorUserId,
    },
  })
}
