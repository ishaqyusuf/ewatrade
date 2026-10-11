import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import {
  getPurchaseRecognitionReceiptDate,
  getPurchaseRecognitionReceiptDates,
} from "./purchase-recognition-receipt-source"
import { FinanceError, financeAmount } from "./rules"
import { addQuantities, normalizeQuantity } from "./valuation-math"

import { calculatePurchaseReceiptValuation } from "./valuation-receipt-impact"

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
    include: receiptInclude,
  })
  if (!receipt) {
    throw new FinanceError(
      "NOT_FOUND",
      "Purchase receipt not found in this book.",
    )
  }
  const { billLine, stockMovement: movement } = receipt
  const { bill } = billLine
  const recognitionReceipt = bill.kind === "PURCHASE_ACCRUAL"
  const effectiveAt = recognitionReceipt
    ? await getPurchaseRecognitionReceiptDate(tx, {
        ...input,
        costBillId: bill.id,
        costBillLineId: billLine.id,
        stockMovementId: movement.id,
      })
    : bill.incurredAt
  return recordLoadedReceiptValuation(tx, input, receipt, effectiveAt)
}

const receiptInclude = {
  billLine: { include: { bill: true, account: true } },
  stockMovement: { include: { balanceSource: true, operation: true } },
  valuationEvent: true,
} satisfies Prisma.FinancePurchaseReceiptLineInclude

type Receipt = Prisma.FinancePurchaseReceiptLineGetPayload<{
  include: typeof receiptInclude
}>
type ValuationInput = {
  tenantId: string
  bookId: string
  receiptId: string
  actorUserId: string
  expectedStockRevision: number
}

/** Batch recognition adapter; the caller holds the same Book and sorted stock locks. */
export async function recordPurchaseReceiptValuationsInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<ValuationInput, "receiptId" | "expectedStockRevision"> & {
    receipts: Array<{ receiptId: string; expectedStockRevision: number }>
  },
) {
  return recordRecognitionReceiptValuations(tx, input, async (receipts) =>
    getPurchaseRecognitionReceiptDates(tx, {
      ...input,
      receipts: receipts.map((r) => ({
        costBillId: r.billLine.bill.id,
        costBillLineId: r.billLine.id,
        stockMovementId: r.stockMovementId,
      })),
    }),
  )
}

/** Repository-internal composition: caller proves fresh dated owner against these actual loaded receipts. */
export async function recordRecognitionReceiptValuations(
  tx: Prisma.TransactionClient,
  input: Omit<ValuationInput, "receiptId" | "expectedStockRevision"> & {
    receipts: Array<{ receiptId: string; expectedStockRevision: number }>
  },
  resolveDates: (receipts: Receipt[]) => Promise<Map<string, Date>>,
) {
  if (
    !input.receipts.length ||
    input.receipts.length > 10 ||
    new Set(input.receipts.map((r) => r.receiptId)).size !==
      input.receipts.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Choose 1–10 distinct purchase receipts.",
    )
  const receipts = await tx.financePurchaseReceiptLine.findMany({
    where: {
      id: { in: input.receipts.map((r) => r.receiptId) },
      tenantId: input.tenantId,
      bookId: input.bookId,
    },
    include: receiptInclude,
    take: 11,
  })
  if (
    receipts.length !== input.receipts.length ||
    new Set(receipts.map((r) => r.stockMovement.balanceSourceId)).size !==
      receipts.length ||
    receipts.some((r) => r.billLine.bill.kind !== "PURCHASE_ACCRUAL")
  )
    throw new FinanceError(
      "CONFLICT",
      "The complete registered purchase receipts are unavailable.",
    )
  const dates = await resolveDates(receipts)
  const events = []
  for (const confirmation of input.receipts) {
    const receipt = receipts.find((r) => r.id === confirmation.receiptId)
    const effectiveAt = receipt && dates.get(receipt.stockMovementId)
    if (!receipt || !effectiveAt)
      throw new FinanceError(
        "CONFLICT",
        "The registered receipt date is unavailable.",
      )
    events.push(
      await recordLoadedReceiptValuation(
        tx,
        { ...input, ...confirmation },
        receipt,
        effectiveAt,
      ),
    )
  }
  return events
}

async function recordLoadedReceiptValuation(
  tx: Prisma.TransactionClient,
  input: ValuationInput,
  receipt: Receipt,
  effectiveAt: Date,
) {
  const { billLine, stockMovement: movement } = receipt
  const { bill, account } = billLine
  const { balanceSource: balance, operation } = movement
  const recognitionReceipt = bill.kind === "PURCHASE_ACCRUAL"
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
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  const {
    valueBeforeMinor,
    valueAfterMinor,
    unknownReason,
    sequence,
    movementCountExact,
  } = calculatePurchaseReceiptValuation({
    quantityBefore: before,
    canonicalEffect: effect,
    quantityAfter: after,
    sourceCostMinor,
    effectiveAt,
    movementCount,
    pool,
  })
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
