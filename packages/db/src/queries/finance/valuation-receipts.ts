import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { randomUUID } from "node:crypto"
import {
  Prisma,
  type FinanceInventoryPool,
} from "../../../generated/prisma/client"
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

/** Registered receipts retain their separate verified recognition-date owner. */
export async function recordRecognitionReceiptValuations(
  tx: Prisma.TransactionClient,
  input: Omit<ValuationInput, "receiptId" | "expectedStockRevision"> & {
    receipts: Array<{ receiptId: string; expectedStockRevision: number }>
  },
  resolveDates: (receipts: Receipt[]) => Promise<Map<string, Date>>,
) {
  return recordPurchaseReceiptValuationBatch(
    tx,
    input,
    "PURCHASE_ACCRUAL",
    resolveDates,
  )
}
/** Direct purchase date comes only from the actual owning bill loaded in this transaction. */
export async function recordDirectPurchaseReceiptValuationsInTransaction(
  tx: Prisma.TransactionClient,
  input: Omit<ValuationInput, "receiptId" | "expectedStockRevision"> & {
    billId: string
    receipts: Array<{ receiptId: string; expectedStockRevision: number }>
  },
) {
  return recordPurchaseReceiptValuationBatch(
    tx,
    input,
    "PURCHASE",
    async (receipts) => {
      if (
        receipts.some(
          (r) =>
            r.billLine.bill.id !== input.billId ||
            r.billLine.bill.bookId !== input.bookId ||
            r.billLine.bookId !== input.bookId ||
            r.billLine.account.bookId !== input.bookId,
        )
      )
        throw new FinanceError(
          "CONFLICT",
          "The original direct purchase receipt owner changed.",
        )
      return new Map(
        receipts.map((r) => [
          r.stockMovementId,
          new Date(r.billLine.bill.incurredAt),
        ]),
      )
    },
  )
}

/** Repository-internal composition: caller proves fresh dated owner against these actual loaded receipts. */
async function recordPurchaseReceiptValuationBatch(
  tx: Prisma.TransactionClient,
  input: Omit<ValuationInput, "receiptId" | "expectedStockRevision"> & {
    receipts: Array<{ receiptId: string; expectedStockRevision: number }>
  },
  expectedKind: "PURCHASE" | "PURCHASE_ACCRUAL",
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
    receipts.some((r) => r.billLine.bill.kind !== expectedKind)
  )
    throw new FinanceError(
      "CONFLICT",
      "The complete original purchase receipts are unavailable.",
    )
  const dates = await resolveDates(receipts)
  const sources = input.receipts.map((confirmation) => {
    const receipt = receipts.find((r) => r.id === confirmation.receiptId)
    const effectiveAt = receipt && dates.get(receipt.stockMovementId)
    if (!receipt || !effectiveAt)
      throw new FinanceError(
        "CONFLICT",
        "The original receipt date is unavailable.",
      )
    return {
      ...prepareLoadedReceiptValuation(
        { ...input, ...confirmation },
        receipt,
        effectiveAt,
      ),
      confirmation,
      receipt,
      effectiveAt,
    }
  })
  const fresh = sources.filter((source) => !source.previous)
  if (!fresh.length) return sources.map((source) => source.previous!)
  const balanceIds = fresh.map((source) => source.balance.id)
  const pools = await tx.financeInventoryPool.findMany({
    where: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      balanceSourceId: { in: balanceIds },
    },
  })
  const counts = await tx.stockMovement.groupBy({
    by: ["balanceSourceId"],
    where: { balanceSourceId: { in: balanceIds } },
    _count: { _all: true },
  })
  const plans = fresh.map((source) => {
    const pool =
      pools.find((pool) => pool.balanceSourceId === source.balance.id) ?? null
    const impact = calculatePurchaseReceiptValuation({
      quantityBefore: source.before,
      canonicalEffect: source.effect,
      quantityAfter: source.after,
      sourceCostMinor: source.sourceCostMinor,
      effectiveAt: source.effectiveAt,
      movementCount:
        counts.find((count) => count.balanceSourceId === source.balance.id)
          ?._count._all ?? 0,
      pool,
    })
    const poolId = pool?.id ?? randomUUID()
    const data = {
      quantity: impact.quantityAfter,
      valueMinor: impact.valueAfterMinor,
      unknownReason: impact.unknownReason,
      lastStockRevision: source.confirmation.expectedStockRevision,
      lastMovementCount: impact.movementCountExact,
      lastSequence: impact.sequence,
      latestEffectiveAt: source.effectiveAt,
    }
    const event = {
      id: randomUUID(),
      tenantId: input.tenantId,
      bookId: input.bookId,
      poolId,
      balanceSourceId: source.balance.id,
      sequence: impact.sequence,
      kind: "PURCHASE_RECEIPT" as const,
      sourceKind: "PURCHASE_RECEIPT",
      sourceId: source.receipt.id,
      stockOperationId: source.operation.id,
      stockMovementId: source.movement.id,
      purchaseReceiptId: source.receipt.id,
      canonicalEffect: impact.canonicalEffect,
      quantityBefore: impact.quantityBefore,
      quantityAfter: impact.quantityAfter,
      valueBeforeMinor: impact.valueBeforeMinor,
      valueDeltaMinor: impact.valueDeltaMinor,
      valueAfterMinor: impact.valueAfterMinor,
      sourceCostMinor: impact.sourceCostMinor,
      unknownReason: impact.unknownReason,
      effectiveAt: source.effectiveAt,
      actorUserId: input.actorUserId,
    }
    return { source, pool, poolId, data, event }
  })
  const existing = plans.filter(
    (plan): plan is typeof plan & { pool: FinanceInventoryPool } =>
      plan.pool !== null,
  )
  if (existing.length) {
    const updated = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "FinanceInventoryPool" p SET quantity = v.quantity::numeric, "valueMinor" = v.value,
        "unknownReason" = v.unknown::"FinanceInventoryUnknownReason", "lastStockRevision" = v.revision,
        "lastMovementCount" = v.movements, "lastSequence" = v.sequence, "latestEffectiveAt" = v.date, "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(
        existing.map(
          ({
            pool,
            data,
          }) => Prisma.sql`(${pool.id}, ${data.quantity}, ${data.valueMinor}::bigint,
        ${data.unknownReason}::text, ${data.lastStockRevision}::integer, ${data.lastMovementCount}::bigint, ${data.lastSequence}::bigint,
        ${data.latestEffectiveAt}::timestamp, ${pool.quantity.toFixed()}, ${pool.valueMinor}::bigint, ${pool.unknownReason}::text,
        ${pool.lastStockRevision}::integer, ${pool.lastMovementCount}::bigint, ${pool.lastSequence}::bigint, ${pool.latestEffectiveAt}::timestamp)`,
        ),
      )})
        AS v(id, quantity, value, unknown, revision, movements, sequence, date, old_quantity, old_value, old_unknown, old_revision, old_movements, old_sequence, old_date)
      WHERE p.id = v.id AND p."tenantId" = ${input.tenantId} AND p."bookId" = ${input.bookId}
        AND p.quantity = v.old_quantity::numeric AND p."valueMinor" IS NOT DISTINCT FROM v.old_value
        AND p."unknownReason"::text IS NOT DISTINCT FROM v.old_unknown AND p."lastStockRevision" = v.old_revision
        AND p."lastMovementCount" = v.old_movements AND p."lastSequence" = v.old_sequence AND p."latestEffectiveAt" = v.old_date
      RETURNING p.id
    `)
    if (
      updated.length !== existing.length ||
      new Set(updated.map((row) => row.id)).size !== existing.length ||
      updated.some((row) => !existing.some((plan) => plan.pool.id === row.id))
    )
      throw new FinanceError(
        "CONFLICT",
        "Purchase valuation pool changed while posting.",
      )
  }
  const opening = plans.filter((plan) => !plan.pool)
  if (opening.length)
    await tx.financeInventoryPool.createMany({
      data: opening.map((plan) => ({
        ...plan.data,
        id: plan.poolId,
        tenantId: input.tenantId,
        bookId: input.bookId,
        balanceSourceId: plan.source.balance.id,
      })),
    })
  await tx.financeInventoryValuationEvent.createMany({
    data: plans.map((plan) => plan.event),
  })
  const saved = await tx.financeInventoryValuationEvent.findMany({
    where: {
      tenantId: input.tenantId,
      bookId: input.bookId,
      id: { in: plans.map((plan) => plan.event.id) },
    },
    include: { pool: true },
  })
  if (saved.length !== plans.length)
    throw new FinanceError(
      "CONFLICT",
      "The complete purchase valuations are unavailable.",
    )
  const events = new Map<string, Omit<(typeof saved)[number], "pool">>()
  for (const plan of plans) {
    const actual = saved.find((event) => event.id === plan.event.id)
    if (
      !actual ||
      actual.poolId !== plan.poolId ||
      actual.balanceSourceId !== plan.source.balance.id ||
      actual.stockMovementId !== plan.source.movement.id ||
      actual.stockOperationId !== plan.source.operation.id ||
      actual.purchaseReceiptId !== plan.source.receipt.id ||
      actual.sourceId !== plan.source.receipt.id ||
      actual.kind !== "PURCHASE_RECEIPT" ||
      actual.sourceKind !== "PURCHASE_RECEIPT" ||
      actual.actorUserId !== input.actorUserId ||
      actual.sequence !== plan.event.sequence ||
      actual.sourceCostMinor !== plan.event.sourceCostMinor ||
      actual.effectiveAt.getTime() !== plan.source.effectiveAt.getTime() ||
      actual.canonicalEffect.toFixed() !== plan.event.canonicalEffect ||
      actual.quantityBefore.toFixed() !== plan.event.quantityBefore ||
      actual.quantityAfter.toFixed() !== plan.event.quantityAfter ||
      actual.valueBeforeMinor !== plan.event.valueBeforeMinor ||
      actual.valueDeltaMinor !== plan.event.valueDeltaMinor ||
      actual.valueAfterMinor !== plan.event.valueAfterMinor ||
      actual.unknownReason !== plan.event.unknownReason ||
      actual.pool.quantity.toFixed() !== plan.data.quantity ||
      actual.pool.valueMinor !== plan.data.valueMinor ||
      actual.pool.unknownReason !== plan.data.unknownReason ||
      actual.pool.lastStockRevision !== plan.data.lastStockRevision ||
      actual.pool.lastMovementCount !== plan.data.lastMovementCount ||
      actual.pool.lastSequence !== plan.data.lastSequence ||
      actual.pool.latestEffectiveAt.getTime() !==
        plan.source.effectiveAt.getTime()
    )
      throw new FinanceError(
        "CONFLICT",
        "The saved purchase valuation changed.",
      )
    const { pool: _pool, ...event } = actual
    events.set(plan.source.receipt.id, event)
  }
  return sources.map(
    (source) => source.previous ?? events.get(source.receipt.id)!,
  )
}

async function recordLoadedReceiptValuation(
  tx: Prisma.TransactionClient,
  input: ValuationInput,
  receipt: Receipt,
  effectiveAt: Date,
) {
  const {
    previous,
    sourceCostMinor,
    before,
    effect,
    after,
    balance,
    operation,
    movement,
  } = prepareLoadedReceiptValuation(input, receipt, effectiveAt)
  if (previous) return previous
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

function prepareLoadedReceiptValuation(
  input: ValuationInput,
  receipt: Receipt,
  effectiveAt: Date,
) {
  const { billLine, stockMovement: movement } = receipt
  const { bill, account } = billLine
  const { balanceSource: balance, operation } = movement
  const recognitionReceipt = bill.kind === "PURCHASE_ACCRUAL"
  if (
    receipt.tenantId !== input.tenantId ||
    receipt.bookId !== input.bookId ||
    movement.id !== receipt.stockMovementId ||
    balance.id !== movement.balanceSourceId ||
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
  }
  if (
    !previous &&
    (!Number.isInteger(input.expectedStockRevision) ||
      input.expectedStockRevision < 1 ||
      balance.revision !== input.expectedStockRevision ||
      canonicalQuantity(balance.onHandQuantity) !== after)
  ) {
    throw new FinanceError(
      "CONFLICT",
      "Purchase valuation requires its current receipt.",
    )
  }
  return {
    previous,
    sourceCostMinor,
    before,
    effect,
    after,
    balance,
    operation,
    movement,
  }
}
