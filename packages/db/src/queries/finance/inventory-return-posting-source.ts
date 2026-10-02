import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { financePostingCommandId } from "./commands"
import {
  resolveCommerceInventoryCostPosting,
  resolveHistoricalCommerceInventoryCostPosting,
} from "./inventory-cost-posting-source"
import type { FinancePostingInput } from "./posting"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { FinanceError, financeAmount } from "./rules"
import { calculateWeightedAverageIssue } from "./valuation-math"

const ZERO = BigInt(0)

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

/** Resolve a RESTOCK journal solely from the immutable registered return cost. */
export async function resolveCommerceInventoryReturnPosting(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; productReturnId: string },
): Promise<{ book: FinanceBook; input: FinancePostingInput } | null> {
  return resolveCommerceInventoryReturnSource(tx, source)
}

/** Read original return cost with original controls, under the actual held Book. */
export async function resolveHistoricalCommerceInventoryReturnPosting(
  tx: Prisma.TransactionClient,
  source: FinanceActor & { bookId: string; productReturnId: string },
  context: ReviewedCostBookContext,
) {
  context.read(tx, source)
  return resolveCommerceInventoryReturnSource(tx, source, { source, context })
}

async function resolveCommerceInventoryReturnSource(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; productReturnId: string },
  history?: {
    source: FinanceActor & { bookId: string }
    context: ReviewedCostBookContext
  },
): Promise<{ book: FinanceBook; input: FinancePostingInput } | null> {
  const productReturn = await tx.productReturn.findFirst({
    where: { id: source.productReturnId, tenantId: source.tenantId },
    include: {
      order: { include: { store: true } },
      orderLine: { include: { snapshot: true } },
      stockOperation: {
        include: {
          movements: {
            include: { balanceSource: { include: { inventoryUnit: true } } },
          },
        },
      },
      financeCost: {
        include: {
          allocations: {
            include: {
              fulfillment: true,
              originalIssue: { include: { pool: true } },
            },
            orderBy: { id: "asc" },
          },
          valuationEvent: {
            include: {
              pool: true,
              stockMovement: { include: { balanceSource: true } },
            },
          },
        },
      },
    },
  })
  if (!productReturn) return null
  const order = productReturn.order
  if (order.status !== "COMPLETED" || !order.completedAt) return null
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: source.tenantId,
        currencyCode: order.currencyCode,
      },
    },
  })
  if (!book) return null
  if (
    (history !== undefined && book.id !== history.source.bookId) ||
    order.tenantId !== source.tenantId ||
    productReturn.storeId !== order.storeId ||
    order.store.tenantId !== source.tenantId ||
    order.store.currencyCode !== order.currencyCode ||
    book.tenantId !== source.tenantId ||
    book.currencyCode !== order.currencyCode ||
    productReturn.orderLine.orderId !== order.id
  )
    conflict("Product return, Order, Store and financial Book scope disagree.")

  const registered = productReturn.financeCost
  if (productReturn.disposition !== "RESTOCK") {
    if (registered?.valuationEvent)
      conflict("A non-restock Product return has an inventory valuation event.")
    return null
  }
  // Old or explicitly unknown history stays out of Finance coverage.
  if (!registered) return null
  const event = registered.valuationEvent
  const allocations = registered.allocations
  if (!event)
    conflict("Registered Product return cost is missing its valuation event.")
  const unknownCost =
    registered.sourceCostMinor === null || registered.unknownReason !== null
  if (
    unknownCost &&
    (registered.sourceCostMinor !== null || registered.unknownReason === null)
  )
    conflict("Product return unknown cost registration is inconsistent.")
  if (unknownCost) {
    if (
      !registered.unknownReason ||
      allocations.some((allocation) => {
        const known =
          allocation.sourceCostMinor !== null &&
          allocation.remainingCostBeforeMinor !== null &&
          allocation.remainingCostAfterMinor !== null &&
          allocation.unknownReason === null
        const unknown =
          allocation.sourceCostMinor === null &&
          allocation.remainingCostBeforeMinor === null &&
          allocation.remainingCostAfterMinor === null &&
          allocation.unknownReason !== null
        return !known && !unknown
      }) ||
      !(
        event.sourceCostMinor === null &&
        (event.valueBeforeMinor === null || event.valueBeforeMinor >= ZERO) &&
        event.valueDeltaMinor === null &&
        event.valueAfterMinor === null &&
        event.unknownReason !== null
      )
    )
      conflict("Product return unknown cost registration is inconsistent.")
    return null
  }
  if (allocations.length === 0)
    conflict(
      "Known Product return cost is missing its allocation or valuation event.",
    )

  const operation = productReturn.stockOperation
  const movement = operation?.movements.find(
    (candidate) =>
      candidate.balanceSourceId === productReturn.destinationBalanceSourceId,
  )
  if (
    !operation ||
    !movement ||
    operation.id !== productReturn.stockOperationId ||
    operation.tenantId !== source.tenantId ||
    operation.storeId !== order.storeId ||
    operation.type !== "RETURN" ||
    operation.source !== "commercial_order_return" ||
    operation.movements.length !== 1 ||
    movement.reversalOfMovementId !== null ||
    movement.balanceSource.tenantId !== source.tenantId ||
    movement.balanceSource.storeId !== order.storeId ||
    !Number.isFinite(operation.effectiveAt.getTime())
  )
    conflict("Product return stock operation linkage is inconsistent.")
  const returnedQuantity = parseExactDecimal(
    productReturn.quantity.toString(),
    {
      allowZero: false,
      maxScale: 6,
    },
  )
  const effect = parseExactDecimal(movement.signedCanonicalEffect.toFixed(), {
    allowZero: false,
    maxScale: 18,
  })
  const factor = parseExactDecimal(movement.unitFactorSnapshot.toFixed(), {
    allowZero: false,
    maxScale: 12,
  })
  const expectedQuantity = parseExactDecimal(
    multiplyExactDecimals(returnedQuantity, factor, 18),
    { allowZero: false, maxScale: 18 },
  )
  const snapshot = productReturn.orderLine.snapshot
  const packaged = movement.balanceSource.kind === "PACKAGED_STOCK"
  const quantityBefore = packaged
    ? multiplyExactDecimals(
        movement.previousOnHandQuantity.toFixed(),
        factor,
        18,
      )
    : movement.previousOnHandQuantity.toFixed()
  const quantityAfter = packaged
    ? multiplyExactDecimals(
        movement.resultingOnHandQuantity.toFixed(),
        factor,
        18,
      )
    : movement.resultingOnHandQuantity.toFixed()
  const originalBalance =
    productReturn.destinationBalanceSourceId === snapshot?.balanceSourceId
  const compatiblePackagedDestination =
    movement.balanceSource.kind === "PACKAGED_STOCK" &&
    movement.balanceSource.inventoryUnitId === snapshot?.inventoryUnitId
  if (
    compareExactDecimals(effect, "0") <= 0 ||
    compareExactDecimals(effect, expectedQuantity) !== 0 ||
    !snapshot ||
    !snapshot.unitFactor ||
    compareExactDecimals(
      movement.enteredQuantity.toFixed(),
      returnedQuantity,
    ) !== 0 ||
    movement.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
    movement.configurationVersionId !== snapshot.configurationVersionId ||
    movement.balanceSource.variantId !== snapshot.variantId ||
    (!originalBalance && !compatiblePackagedDestination) ||
    (packaged && snapshot.stockBehavior !== "PACKAGED_STOCK") ||
    (!packaged && snapshot.stockBehavior === "PACKAGED_STOCK") ||
    compareExactDecimals(factor, snapshot.unitFactor.toFixed()) !== 0 ||
    (packaged &&
      compareExactDecimals(
        addExactDecimals(
          movement.previousOnHandQuantity.toFixed(),
          movement.enteredQuantity.toFixed(),
        ),
        movement.resultingOnHandQuantity.toFixed(),
      ) !== 0) ||
    (!packaged &&
      compareExactDecimals(
        addExactDecimals(movement.previousOnHandQuantity.toFixed(), effect),
        movement.resultingOnHandQuantity.toFixed(),
      ) !== 0) ||
    movement.balanceSource.inventoryUnit?.configurationVersionId !==
      movement.configurationVersionId
  )
    conflict("Product return quantity does not match its stock movement.")

  if (
    registered.tenantId !== source.tenantId ||
    registered.bookId !== book.id ||
    registered.productReturnId !== productReturn.id ||
    registered.orderLineId !== productReturn.orderLineId ||
    compareExactDecimals(
      registered.canonicalQuantity.toFixed(),
      expectedQuantity,
    ) !== 0 ||
    event.tenantId !== source.tenantId ||
    event.bookId !== book.id ||
    event.balanceSourceId !== movement.balanceSourceId ||
    event.stockOperationId !== operation.id ||
    event.stockMovementId !== movement.id ||
    event.productReturnCostId !== registered.id ||
    event.kind !== "CUSTOMER_RETURN" ||
    event.sourceKind !== "PRODUCT_RETURN" ||
    event.sourceId !== productReturn.id ||
    compareExactDecimals(event.canonicalEffect.toFixed(), effect) !== 0 ||
    compareExactDecimals(event.quantityBefore.toFixed(), quantityBefore) !==
      0 ||
    compareExactDecimals(event.quantityAfter.toFixed(), quantityAfter) !== 0 ||
    event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
    event.actorUserId !== productReturn.actorUserId ||
    operation.actorUserId !== productReturn.actorUserId ||
    event.pool.tenantId !== source.tenantId ||
    event.pool.bookId !== book.id ||
    event.pool.balanceSourceId !== productReturn.destinationBalanceSourceId ||
    event.stockMovement.id !== movement.id
  )
    conflict("Product return valuation provenance is inconsistent.")

  let allocatedQuantity = "0"
  let allocatedCost = ZERO
  for (const allocation of allocations) {
    const quantity = parseExactDecimal(allocation.canonicalQuantity.toFixed(), {
      allowZero: false,
      maxScale: 18,
    })
    const beforeQuantity = parseExactDecimal(
      allocation.remainingQuantityBefore.toFixed(),
      {
        maxScale: 18,
      },
    )
    const afterQuantity = parseExactDecimal(
      allocation.remainingQuantityAfter.toFixed(),
      {
        maxScale: 18,
      },
    )
    const issue = allocation.originalIssue
    if (
      allocation.tenantId !== source.tenantId ||
      allocation.bookId !== book.id ||
      allocation.orderLineId !== productReturn.orderLineId ||
      allocation.returnCostId !== registered.id ||
      allocation.fulfillment.orderLineId !== productReturn.orderLineId ||
      allocation.fulfillment.id !== allocation.fulfillmentId ||
      !issue ||
      issue.id !== allocation.originalIssueId ||
      issue.tenantId !== source.tenantId ||
      issue.bookId !== book.id ||
      issue.kind !== "ISSUE" ||
      issue.sourceKind !== "PRODUCT_FULFILLMENT" ||
      issue.sourceId !== allocation.fulfillmentId ||
      allocation.fulfillment.stockOperationId !== issue.stockOperationId ||
      operation.effectiveAt < issue.effectiveAt ||
      issue.sourceCostMinor === null ||
      issue.unknownReason !== null ||
      issue.pool.tenantId !== source.tenantId ||
      issue.pool.bookId !== book.id ||
      issue.pool.balanceSourceId !== issue.balanceSourceId ||
      allocation.unknownReason !== null ||
      allocation.sourceCostMinor === null ||
      allocation.remainingCostBeforeMinor === null ||
      allocation.remainingCostAfterMinor === null ||
      compareExactDecimals(
        subtractExactDecimals(beforeQuantity, quantity),
        afterQuantity,
      ) !== 0 ||
      compareExactDecimals(quantity, beforeQuantity) > 0 ||
      allocation.remainingCostBeforeMinor - allocation.sourceCostMinor !==
        allocation.remainingCostAfterMinor ||
      allocation.sourceCostMinor < ZERO ||
      allocation.remainingCostAfterMinor < ZERO ||
      allocation.remainingCostBeforeMinor > issue.sourceCostMinor ||
      allocation.sourceCostMinor > issue.sourceCostMinor
    )
      conflict("Product return original-issue allocation is inconsistent.")
    const originalEffect = issue.canonicalEffect.toFixed()
    if (
      !originalEffect.startsWith("-") ||
      compareExactDecimals(beforeQuantity, originalEffect.slice(1)) > 0
    )
      conflict("Product return allocation exceeds its original issue quantity.")
    const expected = calculateWeightedAverageIssue({
      quantityBefore: beforeQuantity,
      quantityIssued: quantity,
      valueBeforeMinor: allocation.remainingCostBeforeMinor,
    })
    if (expected.valueIssuedMinor !== allocation.sourceCostMinor)
      conflict(
        "Product return allocation differs from original residual costing.",
      )
    allocatedQuantity = addExactDecimals(allocatedQuantity, quantity)
    allocatedCost += allocation.sourceCostMinor
  }
  const knownPoolValue =
    event.valueBeforeMinor !== null &&
    event.valueDeltaMinor !== null &&
    event.valueAfterMinor !== null &&
    event.unknownReason === null
  const unknownPoolValue =
    event.valueBeforeMinor === null &&
    event.valueDeltaMinor === null &&
    event.valueAfterMinor === null &&
    event.unknownReason !== null
  if (
    compareExactDecimals(allocatedQuantity, expectedQuantity) !== 0 ||
    allocatedCost !== registered.sourceCostMinor ||
    event.sourceCostMinor !== registered.sourceCostMinor ||
    (!knownPoolValue && !unknownPoolValue) ||
    (knownPoolValue &&
      (event.valueDeltaMinor !== registered.sourceCostMinor ||
        event.valueBeforeMinor === null ||
        event.valueAfterMinor === null ||
        event.valueDeltaMinor === null ||
        event.valueBeforeMinor < ZERO ||
        event.valueAfterMinor < ZERO ||
        event.valueBeforeMinor + event.valueDeltaMinor !==
          event.valueAfterMinor))
  )
    conflict("Product return valuation does not conserve its registered cost.")

  // Re-derive gross COGS from the complete original issue ledger, then require
  // its immutable journal before permitting any returned-cost recognition.
  const grossEntry = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: "COMMERCIAL_ORDER_COGS",
        sourceId: order.id,
      },
    },
    include: { lines: { include: { account: true } } },
  })
  if (!grossEntry) return null
  const gross = history
    ? await resolveHistoricalCommerceInventoryCostPosting(
        tx,
        { ...history.source, orderId: order.id },
        history.context,
      )
    : await resolveCommerceInventoryCostPosting(tx, {
        tenantId: source.tenantId,
        orderId: order.id,
      })
  if (!gross) return null
  const grossAmount = BigInt(gross.input.lines[0]?.amountMinor ?? "0")
  if (
    grossEntry.reversalOfId !== null ||
    grossEntry.storeId !== order.storeId ||
    grossEntry.actorUserId !== order.createdByUserId ||
    grossEntry.effectiveAt.getTime() !== order.completedAt.getTime() ||
    grossEntry.lines.length !== 2 ||
    grossEntry.lines.filter(
      (line) =>
        line.account.code === "5000" &&
        line.account.kind === "EXPENSE" &&
        line.account.purpose === "COST_OF_SALES" &&
        line.debitMinor === grossAmount &&
        line.creditMinor === ZERO,
    ).length !== 1 ||
    grossEntry.lines.filter(
      (line) =>
        line.account.code === "1300" &&
        line.account.kind === "ASSET" &&
        line.account.purpose === "INVENTORY" &&
        line.creditMinor === grossAmount &&
        line.debitMinor === ZERO,
    ).length !== 1 ||
    grossAmount <= ZERO
  )
    conflict(
      "The original Product Order COGS journal is missing or inconsistent.",
    )
  const grossReversal = await tx.financeJournalEntry.findFirst({
    where: { bookId: book.id, reversalOfId: grossEntry.id },
    select: { id: true },
  })
  if (grossReversal)
    conflict("The original Product Order COGS journal is no longer active.")

  const orderReturns = await tx.productReturn.findMany({
    where: { tenantId: source.tenantId, orderId: order.id },
    select: {
      id: true,
      disposition: true,
      financeCost: { select: { sourceCostMinor: true } },
    },
  })
  const priorEntries = await tx.financeJournalEntry.findMany({
    where: {
      bookId: book.id,
      sourceKind: "PRODUCT_RETURN_COGS",
      sourceId: { in: orderReturns.map((candidate) => candidate.id) },
    },
    include: { lines: { include: { account: true } } },
  })
  let priorReturnCost = ZERO
  for (const entry of priorEntries) {
    const original = orderReturns.find(
      (candidate) => candidate.id === entry.sourceId,
    )
    if (
      !original ||
      original.disposition !== "RESTOCK" ||
      original.financeCost?.sourceCostMinor == null
    )
      conflict("A Product return journal has no matching known RESTOCK source.")
    if (
      entry.storeId !== order.storeId ||
      entry.effectiveAt < grossEntry.effectiveAt ||
      entry.reversalOfId !== null ||
      entry.lines.length !== 2
    )
      conflict("A Product return journal has inconsistent scope or chronology.")
    const debit = entry.lines.find((line) => line.account.code === "1300")
    const credit = entry.lines.find((line) => line.account.code === "5000")
    if (
      !debit ||
      !credit ||
      debit.account.kind !== "ASSET" ||
      debit.account.purpose !== "INVENTORY" ||
      credit.account.kind !== "EXPENSE" ||
      credit.account.purpose !== "COST_OF_SALES" ||
      debit.debitMinor <= ZERO ||
      debit.debitMinor !== credit.creditMinor ||
      debit.debitMinor !== original.financeCost.sourceCostMinor ||
      debit.creditMinor !== ZERO ||
      credit.debitMinor !== ZERO
    )
      conflict(
        "A Product return journal does not match reserved inventory accounts.",
      )
    if (entry.sourceId !== productReturn.id) priorReturnCost += debit.debitMinor
  }
  if (priorReturnCost + registered.sourceCostMinor > grossAmount)
    conflict("Returned Product cost exceeds the original Order COGS.")
  if (registered.sourceCostMinor === ZERO) return null

  const accounts = await tx.financeAccount.findMany({
    where: {
      bookId: book.id,
      ...(history ? {} : { archivedAt: null }),
      code: { in: ["1300", "5000"] },
    },
    select: { id: true, code: true, kind: true, purpose: true },
    take: 3,
  })
  const account = (code: string, kind: string, purpose: string) => {
    const matches = accounts.filter(
      (candidate) =>
        candidate.code === code &&
        candidate.kind === kind &&
        candidate.purpose === purpose,
    )
    if (matches.length !== 1 || !matches[0]?.id.trim())
      throw new FinanceError(
        "NOT_FOUND",
        `Required inventory return account ${code} is unavailable.`,
      )
    return matches[0].id
  }
  const amountMinor = registered.sourceCostMinor.toString()
  financeAmount(amountMinor)
  const input: FinancePostingInput = {
    tenantId: source.tenantId,
    actorUserId: productReturn.actorUserId,
    bookId: book.id,
    clientCommandId: financePostingCommandId(
      `commerce:PRODUCT_RETURN_COGS:${productReturn.id}`,
      "posting",
    ),
    sourceKind: "PRODUCT_RETURN_COGS",
    sourceId: productReturn.id,
    effectiveAt:
      operation.effectiveAt > grossEntry.effectiveAt
        ? operation.effectiveAt
        : grossEntry.effectiveAt,
    storeId: order.storeId,
    description: `Returned inventory cost: ${order.orderNumber}`,
    lines: [
      {
        accountId: account("1300", "ASSET", "INVENTORY"),
        side: "DEBIT",
        amountMinor,
      },
      {
        accountId: account("5000", "EXPENSE", "COST_OF_SALES"),
        side: "CREDIT",
        amountMinor,
      },
    ],
  }
  return { book, input }
}
