import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  type ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"
import {
  type ReviewedReturnAllocation,
  type ReviewedReturnHeader,
  type ReviewedReturnIssue,
  assertReviewedCostOrderLockScope,
  auditReviewedCostReturnBudgets,
} from "./reviewed-cost-return-rules"
import { FinanceError, financePayloadHash } from "./rules"
import { normalizeQuantity } from "./valuation-math"

const storeSelect = { id: true, tenantId: true, currencyCode: true } as const
const operationInclude = {
  store: { select: storeSelect },
  movements: {
    take: 2,
    include: {
      balanceSource: { include: { store: { select: storeSelect } } },
      valuationEvent: true,
    },
  },
  _count: { select: { movements: true } },
} satisfies Prisma.StockOperationInclude
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function canonical(quantity: Prisma.Decimal, factor: Prisma.Decimal) {
  return normalizeQuantity(
    multiplyExactDecimals(quantity.toFixed(), factor.toFixed(), 18),
  )
}

/**
 * Private source snapshot. Acquire Book -> sorted owning Orders before the one
 * complete sorted stock lock set. Never filter out nonphysical or legacy returns.
 * Global physical history, monetary evidence and posted journals remain separate.
 */
export async function readReviewedCostReturnsInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    bookId: string
    orderLineIds: string[]
    expectedOrderIds?: string[]
  },
  context?: ReviewedCostBookContext,
) {
  const ids = [...input.orderLineIds].sort()
  if (
    ids.length > 128 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !id.trim() || id.length > 256)
  )
    conflict("Return proof requires at most 128 unique owning Order Lines.")
  const book = await readReviewedCostBook(tx, input, context)
  const roots = await tx.commercialOrderLine.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      orderId: true,
      order: { select: { tenantId: true, currencyCode: true } },
    },
    take: 129,
  })
  if (
    roots.length !== ids.length ||
    roots.some(
      (line) =>
        line.order.tenantId !== input.tenantId ||
        line.order.currencyCode !== book.currencyCode,
    )
  )
    conflict("Return proof Order Lines differ from this Tenant/currency Book.")
  const orderIds = [...new Set(roots.map((line) => line.orderId))].sort()
  assertReviewedCostOrderLockScope(orderIds, input.expectedOrderIds)
  if (orderIds.length) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "CommercialOrder" WHERE id IN (${Prisma.join(orderIds)})
      AND "tenantId" = ${input.tenantId} ORDER BY id FOR SHARE
    `
    if (locked.length !== orderIds.length)
      conflict("Owning Order scope changed before return proof.")
  }
  const lines = await tx.commercialOrderLine.findMany({
    where: { id: { in: ids } },
    include: {
      snapshot: true,
      order: { include: { store: { select: storeSelect } } },
      _count: { select: { productFulfillments: true, productReturns: true } },
    },
    orderBy: { id: "asc" },
    take: 129,
  })
  if (
    lines.length !== ids.length ||
    lines.reduce(
      (n, line) =>
        n + line._count.productFulfillments + line._count.productReturns,
      0,
    ) > 4096
  )
    conflict(
      "Complete original fulfillments/returns exceed the bounded source scope.",
    )
  const fulfillments = await tx.productFulfillment.findMany({
    where: { orderLineId: { in: ids } },
    include: {
      reservation: true,
      stockOperation: { include: operationInclude },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const returns = await tx.productReturn.findMany({
    where: { orderLineId: { in: ids } },
    include: { stockOperation: { include: operationInclude } },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    fulfillments.length !==
      lines.reduce((n, line) => n + line._count.productFulfillments, 0) ||
    returns.length !==
      lines.reduce((n, line) => n + line._count.productReturns, 0)
  )
    conflict("Original fulfillment/return counts changed in the held scope.")
  const headers = await tx.financeProductReturnCost.findMany({
    where: {
      OR: [
        { orderLineId: { in: ids } },
        { productReturnId: { in: returns.map((row) => row.id) } },
      ],
    },
    include: { valuationEvent: true },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const allocations = await tx.financeProductReturnCostAllocation.findMany({
    where: {
      OR: [
        { orderLineId: { in: ids } },
        { returnCostId: { in: headers.map((row) => row.id) } },
        { fulfillmentId: { in: fulfillments.map((row) => row.id) } },
      ],
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    fulfillments.length + returns.length + allocations.length > 4096 ||
    headers.length !== returns.length
  )
    conflict(
      "Complete original return provenance is missing or exceeds scope; legacy evidence is required.",
    )
  const issues: ReviewedReturnIssue[] = []
  const returned: ReviewedReturnHeader[] = []
  const normalizedAllocations: ReviewedReturnAllocation[] = allocations.map(
    (row) => ({
      id: row.id,
      tenantId: row.tenantId,
      bookId: row.bookId,
      orderLineId: row.orderLineId,
      returnCostId: row.returnCostId,
      fulfillmentId: row.fulfillmentId,
      originalIssueId: row.originalIssueId,
      canonicalQuantity: row.canonicalQuantity.toFixed(),
      remainingQuantityBefore: row.remainingQuantityBefore.toFixed(),
      remainingQuantityAfter: row.remainingQuantityAfter.toFixed(),
      sourceCostMinor: row.sourceCostMinor,
      remainingCostBeforeMinor: row.remainingCostBeforeMinor,
      remainingCostAfterMinor: row.remainingCostAfterMinor,
      unknownReason: row.unknownReason,
    }),
  )
  const orderLineSet = new Set(ids)
  if (
    [...headers, ...allocations].some(
      (row) =>
        !orderLineSet.has(row.orderLineId) ||
        row.tenantId !== input.tenantId ||
        row.bookId !== book.id,
    )
  )
    conflict(
      "Linked return provenance crosses its owning Tenant, Book or Order Line.",
    )
  const budgets = lines.map((line) => {
    const snapshot = line.snapshot
    const order = line.order
    if (
      line.kind !== "PRODUCT_UNIT" ||
      !snapshot ||
      snapshot.orderLineId !== line.id ||
      snapshot.offeringId !== line.offeringId ||
      snapshot.offeringKind !== line.kind ||
      snapshot.currencyCode !== book.currencyCode ||
      !snapshot.balanceSourceId ||
      !snapshot.inventoryUnitId ||
      !snapshot.configurationVersionId ||
      !snapshot.unitFactor ||
      !["CANONICAL_SHARED", "ALTERNATE_TRANSACTION", "PACKAGED_STOCK"].includes(
        snapshot.stockBehavior ?? "",
      ) ||
      normalizeQuantity(snapshot.unitFactor.toFixed()) === "0" ||
      normalizeQuantity(snapshot.quantity.toFixed()) !==
        normalizeQuantity(line.quantity.toFixed()) ||
      order.tenantId !== input.tenantId ||
      order.currencyCode !== book.currencyCode ||
      order.storeId !== order.store.id ||
      order.store.tenantId !== input.tenantId ||
      order.store.currencyCode !== book.currencyCode
    )
      conflict(
        "Return proof has inconsistent original sold-unit or Order ownership.",
      )
    const factor = snapshot.unitFactor
    for (const fulfillment of fulfillments.filter(
      (row) => row.orderLineId === line.id,
    )) {
      const reservation = fulfillment.reservation
      const operation = fulfillment.stockOperation
      const movement = operation.movements[0]
      const event = movement?.valuationEvent
      const issued = canonical(fulfillment.quantity, factor)
      if (
        operation.id !== fulfillment.stockOperationId ||
        operation.tenantId !== input.tenantId ||
        operation.storeId !== order.storeId ||
        operation.store.tenantId !== input.tenantId ||
        operation.store.currencyCode !== book.currencyCode ||
        operation.type !== "SALE_FULFILLMENT" ||
        operation.source !== "commercial_order" ||
        operation.correctionOfOperationId !== null ||
        operation.linkedOperationId !== null ||
        !Number.isFinite(operation.effectiveAt.getTime()) ||
        operation._count.movements !== 1 ||
        operation.movements.length !== 1 ||
        !movement ||
        reservation.id !== fulfillment.reservationId ||
        reservation.tenantId !== input.tenantId ||
        reservation.storeId !== order.storeId ||
        reservation.commercialOrderLineId !== line.id ||
        reservation.offeringId !== line.offeringId ||
        reservation.status !== "COMMITTED" ||
        reservation.committedOperationId !== operation.id ||
        reservation.balanceSourceId !== snapshot.balanceSourceId ||
        reservation.configurationVersionId !==
          snapshot.configurationVersionId ||
        reservation.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
        reservation.unitFactorSnapshot.toFixed() !== factor.toFixed() ||
        normalizeQuantity(reservation.enteredQuantity.toFixed()) !==
          normalizeQuantity(fulfillment.quantity.toFixed()) ||
        normalizeQuantity(reservation.canonicalQuantity.toFixed()) !== issued ||
        movement.operationId !== operation.id ||
        movement.balanceSourceId !== reservation.balanceSourceId ||
        movement.balanceSource.tenantId !== input.tenantId ||
        movement.balanceSource.storeId !== order.storeId ||
        movement.balanceSource.store.tenantId !== input.tenantId ||
        movement.balanceSource.store.currencyCode !== book.currencyCode ||
        movement.balanceSource.variantId !== snapshot.variantId ||
        (snapshot.stockBehavior === "PACKAGED_STOCK"
          ? movement.balanceSource.kind !== "PACKAGED_STOCK" ||
            movement.balanceSource.inventoryUnitId !== snapshot.inventoryUnitId
          : movement.balanceSource.kind !== "SHARED_POOL") ||
        movement.reversalOfMovementId !== null ||
        movement.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
        movement.configurationVersionId !== snapshot.configurationVersionId ||
        movement.unitFactorSnapshot.toFixed() !== factor.toFixed() ||
        normalizeQuantity(movement.enteredQuantity.toFixed()) !==
          normalizeQuantity(fulfillment.quantity.toFixed()) ||
        movement.signedCanonicalEffect.toFixed() !== `-${issued}` ||
        !event ||
        event.tenantId !== input.tenantId ||
        event.bookId !== book.id ||
        event.kind !== "ISSUE" ||
        event.sourceKind !== "PRODUCT_FULFILLMENT" ||
        event.sourceId !== fulfillment.id ||
        event.stockOperationId !== operation.id ||
        event.stockMovementId !== movement.id ||
        event.balanceSourceId !== movement.balanceSourceId ||
        event.canonicalEffect.toFixed() !== `-${issued}` ||
        event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
        event.actorUserId !== operation.actorUserId
      )
        conflict(
          "Original fulfillment/issue provenance is missing or inconsistent; independent legacy proof is required.",
        )
      issues.push({
        tenantId: event.tenantId,
        bookId: event.bookId,
        orderLineId: line.id,
        fulfillmentId: fulfillment.id,
        originalIssueId: event.id,
        canonicalQuantity: issued,
        sourceCostMinor: event.sourceCostMinor,
        unknownReason: event.unknownReason,
      })
    }
    for (const row of returns.filter(
      (candidate) => candidate.orderLineId === line.id,
    )) {
      const header = headers.find(
        (candidate) => candidate.productReturnId === row.id,
      )
      const operation = row.stockOperation
      const movement = operation?.movements[0]
      const event = header?.valuationEvent
      const amount = canonical(row.quantity, factor)
      if (
        row.tenantId !== input.tenantId ||
        row.storeId !== order.storeId ||
        row.orderId !== order.id ||
        !row.actorUserId.trim() ||
        !/^[a-f0-9]{64}$/.test(row.payloadHash) ||
        !Number.isFinite(row.createdAt.getTime()) ||
        !header ||
        header.orderLineId !== line.id ||
        header.tenantId !== input.tenantId ||
        header.bookId !== book.id ||
        header.canonicalQuantity.toFixed() !== amount
      )
        conflict("Original return/header ownership or quantity differs.")
      if (row.disposition !== "RESTOCK") {
        if (
          row.stockOperationId !== null ||
          row.destinationBalanceSourceId !== null ||
          operation ||
          event
        )
          conflict("Non-restock return cannot own a physical recovery event.")
      } else if (
        !operation ||
        !movement ||
        !event ||
        operation.id !== row.stockOperationId ||
        operation.tenantId !== input.tenantId ||
        operation.storeId !== order.storeId ||
        operation.store.tenantId !== input.tenantId ||
        operation.store.currencyCode !== book.currencyCode ||
        operation.type !== "RETURN" ||
        operation.source !== "commercial_order_return" ||
        operation.actorUserId !== row.actorUserId ||
        operation.correctionOfOperationId !== null ||
        operation.linkedOperationId !== null ||
        operation._count.movements !== 1 ||
        operation.movements.length !== 1 ||
        !Number.isFinite(operation.effectiveAt.getTime()) ||
        movement.operationId !== operation.id ||
        movement.balanceSourceId !== row.destinationBalanceSourceId ||
        movement.balanceSource.tenantId !== input.tenantId ||
        movement.balanceSource.storeId !== order.storeId ||
        movement.balanceSource.store.tenantId !== input.tenantId ||
        movement.balanceSource.store.currencyCode !== book.currencyCode ||
        movement.balanceSource.variantId !== snapshot.variantId ||
        (movement.balanceSourceId !== snapshot.balanceSourceId &&
          (movement.balanceSource.kind !== "PACKAGED_STOCK" ||
            movement.balanceSource.inventoryUnitId !==
              snapshot.inventoryUnitId)) ||
        (snapshot.stockBehavior === "PACKAGED_STOCK") !==
          (movement.balanceSource.kind === "PACKAGED_STOCK") ||
        movement.reversalOfMovementId !== null ||
        movement.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
        movement.configurationVersionId !== snapshot.configurationVersionId ||
        movement.unitFactorSnapshot.toFixed() !== factor.toFixed() ||
        normalizeQuantity(movement.enteredQuantity.toFixed()) !==
          normalizeQuantity(row.quantity.toFixed()) ||
        movement.signedCanonicalEffect.toFixed() !== amount ||
        event.id !== movement.valuationEvent?.id ||
        event.tenantId !== input.tenantId ||
        event.bookId !== book.id ||
        event.kind !== "CUSTOMER_RETURN" ||
        event.sourceKind !== "PRODUCT_RETURN" ||
        event.sourceId !== row.id ||
        event.productReturnCostId !== header.id ||
        event.stockOperationId !== operation.id ||
        event.stockMovementId !== movement.id ||
        event.balanceSourceId !== movement.balanceSourceId ||
        event.canonicalEffect.toFixed() !== amount ||
        event.sourceCostMinor !== header.sourceCostMinor ||
        event.actorUserId !== row.actorUserId ||
        event.effectiveAt.getTime() !== operation.effectiveAt.getTime()
      )
        conflict(
          "Restock return does not match its original recovery movement/event.",
        )
      const returnAt = operation?.effectiveAt ?? row.createdAt
      for (const allocation of allocations.filter(
        (candidate) => candidate.returnCostId === header.id,
      )) {
        const fulfillment = fulfillments.find(
          (candidate) => candidate.id === allocation.fulfillmentId,
        )
        if (
          !fulfillment ||
          fulfillment.orderLineId !== line.id ||
          fulfillment.stockOperation.effectiveAt > returnAt
        )
          conflict(
            "Return allocation predates or differs from its original fulfillment.",
          )
      }
      returned.push({
        id: header.id,
        tenantId: header.tenantId,
        bookId: header.bookId,
        orderLineId: header.orderLineId,
        productReturnId: row.id,
        canonicalQuantity: amount,
        disposition: row.disposition,
        sourceCostMinor: header.sourceCostMinor,
        unknownReason: header.unknownReason,
      })
    }
    return {
      orderLineId: line.id,
      ...auditReviewedCostReturnBudgets({
        tenantId: input.tenantId,
        bookId: book.id,
        orderLineId: line.id,
        orderedCanonicalQuantity: canonical(line.quantity, factor),
        issues: issues.filter((row) => row.orderLineId === line.id),
        returns: returned.filter((row) => row.orderLineId === line.id),
        allocations: normalizedAllocations.filter(
          (row) => row.orderLineId === line.id,
        ),
      }),
    }
  })
  // Decimal instances carry implementation fields; bind normalized facts only.
  const snapshot = {
    tenantId: input.tenantId,
    bookId: book.id,
    currencyCode: book.currencyCode,
    bookSequence: book.lastSequence,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    lines: lines.map((line) => ({
      id: line.id,
      orderId: line.orderId,
      offeringId: line.offeringId,
      quantity: line.quantity.toFixed(),
      snapshotId: line.snapshot?.id,
      inventoryUnitId: line.snapshot?.inventoryUnitId,
      configurationVersionId: line.snapshot?.configurationVersionId,
      variantId: line.snapshot?.variantId,
      balanceSourceId: line.snapshot?.balanceSourceId,
      unitFactor: line.snapshot?.unitFactor?.toFixed(),
      stockBehavior: line.snapshot?.stockBehavior,
      orderStatus: line.order.status,
      orderCompletedAt: line.order.completedAt,
      orderCreatedByUserId: line.order.createdByUserId,
    })),
    fulfillments: fulfillments.map((row) => ({
      id: row.id,
      orderLineId: row.orderLineId,
      reservationId: row.reservationId,
      stockOperationId: row.stockOperationId,
      stockMovementId: row.stockOperation.movements[0]?.id,
      effectiveAt: row.stockOperation.effectiveAt,
      actorUserId: row.stockOperation.actorUserId,
      payloadHash: row.stockOperation.payloadHash,
    })),
    returns: returns.map((row) => ({
      id: row.id,
      orderLineId: row.orderLineId,
      disposition: row.disposition,
      stockOperationId: row.stockOperationId,
      destinationBalanceSourceId: row.destinationBalanceSourceId,
      effectiveAt: row.stockOperation?.effectiveAt ?? row.createdAt,
      actorUserId: row.actorUserId,
      payloadHash: row.payloadHash,
    })),
    budgets,
  }
  return {
    snapshot,
    sourceSnapshotHash: financePayloadHash(snapshot),
    issues,
    returns: returned,
    allocations: normalizedAllocations,
    requiresPhysicalHistoryProof: true as const,
    requiresMonetaryProof: true as const,
    requiresPostedJournalProof: true as const,
  }
}
