import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { readCommercialOrderEarnedCompletion } from "../commercial-order-completion"
import type { FinanceActor } from "./access"
import { financePostingCommandId } from "./commands"
import type { FinancePostingInput } from "./posting"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { FinanceError, financeAmount } from "./rules"

const ZERO = BigInt(0)

/**
 * Resolve COGS only from immutable, registered PRODUCT_FULFILLMENT issue costs.
 * The caller owns the Commerce/Book/Order locks and has already posted EARNED
 * in this transaction. Unknown issue costs intentionally keep coverage open.
 */
export async function resolveCommerceInventoryCostPosting(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; orderId: string },
): Promise<{ book: FinanceBook; input: FinancePostingInput } | null> {
  return resolveCommerceInventoryCostSource(tx, source)
}

/** Original source replay under a held read context; never posts or recosts stock. */
export async function resolveHistoricalCommerceInventoryCostPosting(
  tx: Prisma.TransactionClient,
  source: FinanceActor & { bookId: string; orderId: string },
  context: ReviewedCostBookContext,
) {
  const held = context.read(tx, source)
  return resolveCommerceInventoryCostSource(tx, source, held.id)
}

async function resolveCommerceInventoryCostSource(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; orderId: string },
  historicalBookId?: string,
): Promise<{ book: FinanceBook; input: FinancePostingInput } | null> {
  const order = await tx.commercialOrder.findFirst({
    where: { id: source.orderId, tenantId: source.tenantId },
    include: { store: { select: { currencyCode: true, tenantId: true } } },
  })
  if (!order) return null

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
    (historicalBookId !== undefined && book.id !== historicalBookId) ||
    book.tenantId !== source.tenantId ||
    book.currencyCode !== order.currencyCode ||
    order.store.tenantId !== source.tenantId ||
    order.store.currencyCode !== order.currencyCode
  ) {
    throw new FinanceError(
      "CONFLICT",
      "The Order, Store and financial Book ownership or currency do not agree.",
    )
  }

  if (
    order.status !== "COMPLETED" ||
    !order.completedAt ||
    !(await readCommercialOrderEarnedCompletion(tx, {
      orderId: order.id,
      storeId: order.storeId,
      tenantId: source.tenantId,
    }))
  )
    return null

  const netRevenue = order.totalMinor - order.taxMinor
  if (order.taxMinor < 0 || order.taxMinor > order.totalMinor)
    throw new FinanceError("CONFLICT", "The Order tax amount is inconsistent.")
  if (netRevenue > 0) {
    const earned = await tx.financeJournalEntry.findUnique({
      where: {
        bookId_sourceKind_sourceId: {
          bookId: book.id,
          sourceKind: "COMMERCIAL_ORDER_EARNED",
          sourceId: order.id,
        },
      },
      select: { id: true },
    })
    if (!earned)
      throw new FinanceError(
        "CONFLICT",
        "The Order's earned revenue must be posted before its inventory cost.",
      )
  }

  const lines = await tx.commercialOrderLine.findMany({
    where: { orderId: order.id },
    orderBy: { id: "asc" },
    include: {
      snapshot: {
        select: {
          balanceSourceId: true,
          configurationVersionId: true,
          inventoryUnitId: true,
          unitFactor: true,
          stockBehavior: true,
        },
      },
      productFulfillments: {
        orderBy: { id: "asc" },
        include: {
          reservation: {
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              offeringId: true,
              commercialOrderLineId: true,
              balanceSourceId: true,
              configurationVersionId: true,
              enteredInventoryUnitId: true,
              enteredQuantity: true,
              unitFactorSnapshot: true,
              canonicalQuantity: true,
              status: true,
            },
          },
          stockOperation: {
            include: {
              movements: { include: { balanceSource: true } },
            },
          },
        },
      },
    },
  })

  let totalQuantity = "0"
  let costTotal = ZERO
  const fulfillmentIds = new Set<string>()
  const reservationIds = new Set<string>()
  const movementIds = new Set<string>()
  for (const line of lines) {
    if (line.kind !== "PRODUCT_UNIT") continue
    if (!line.snapshot?.balanceSourceId) return null
    let fulfilledQuantity = "0"
    for (const fulfillment of line.productFulfillments) {
      if (
        fulfillmentIds.has(fulfillment.id) ||
        reservationIds.has(fulfillment.reservationId)
      )
        throw new FinanceError(
          "CONFLICT",
          "A Product issue is linked more than once.",
        )
      fulfillmentIds.add(fulfillment.id)
      reservationIds.add(fulfillment.reservationId)
      const reservation = fulfillment.reservation
      const operation = fulfillment.stockOperation
      const movement = operation.movements.find(
        (candidate) =>
          candidate.balanceSourceId === reservation.balanceSourceId,
      )
      if (
        reservation.commercialOrderLineId !== line.id ||
        reservation.tenantId !== source.tenantId ||
        reservation.storeId !== order.storeId ||
        reservation.balanceSourceId !== line.snapshot.balanceSourceId ||
        reservation.configurationVersionId !==
          line.snapshot.configurationVersionId ||
        reservation.enteredInventoryUnitId !== line.snapshot.inventoryUnitId ||
        reservation.status !== "COMMITTED" ||
        operation.id !== fulfillment.stockOperationId ||
        operation.tenantId !== source.tenantId ||
        operation.storeId !== order.storeId ||
        operation.type !== "SALE_FULFILLMENT" ||
        operation.source !== "commercial_order" ||
        !movement ||
        operation.movements.length !== 1 ||
        movementIds.has(movement.id) ||
        movement.reversalOfMovementId !== null ||
        movement.balanceSource.tenantId !== source.tenantId ||
        movement.balanceSource.storeId !== order.storeId ||
        movement.configurationVersionId !==
          line.snapshot.configurationVersionId ||
        movement.enteredInventoryUnitId !== line.snapshot.inventoryUnitId
      )
        throw new FinanceError(
          "CONFLICT",
          "Product fulfillment stock linkage is inconsistent.",
        )
      movementIds.add(movement.id)

      const issueQuantity = parseExactDecimal(fulfillment.quantity.toString(), {
        allowZero: false,
        maxScale: 6,
      })
      const depletion = parseExactDecimal(
        movement.signedCanonicalEffect.toFixed(),
        { allowNegative: true, allowZero: false, maxScale: 18 },
      )
      const factor = parseExactDecimal(movement.unitFactorSnapshot.toFixed(), {
        allowZero: false,
        maxScale: 12,
      })
      const packaged = movement.balanceSource.kind === "PACKAGED_STOCK"
      const snapshotFactor = line.snapshot.unitFactor
        ? parseExactDecimal(line.snapshot.unitFactor.toFixed(), {
            allowZero: false,
            maxScale: 12,
          })
        : null
      const reservationFactor = parseExactDecimal(
        reservation.unitFactorSnapshot.toFixed(),
        { allowZero: false, maxScale: 12 },
      )
      const expectedCanonicalQuantity = multiplyExactDecimals(
        issueQuantity,
        factor,
        18,
      )
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
      if (
        compareExactDecimals(depletion, "0") >= 0 ||
        (packaged && line.snapshot.stockBehavior !== "PACKAGED_STOCK") ||
        (!packaged && line.snapshot.stockBehavior === "PACKAGED_STOCK") ||
        !snapshotFactor ||
        compareExactDecimals(factor, snapshotFactor) !== 0 ||
        compareExactDecimals(factor, reservationFactor) !== 0 ||
        compareExactDecimals(
          parseExactDecimal(reservation.enteredQuantity.toString(), {
            allowZero: false,
            maxScale: 6,
          }),
          issueQuantity,
        ) !== 0 ||
        compareExactDecimals(
          parseExactDecimal(movement.enteredQuantity.toString(), {
            allowZero: false,
            maxScale: 6,
          }),
          issueQuantity,
        ) !== 0 ||
        compareExactDecimals(
          parseExactDecimal(reservation.canonicalQuantity.toString(), {
            allowZero: false,
            maxScale: 18,
          }),
          parseExactDecimal(expectedCanonicalQuantity, {
            allowZero: false,
            maxScale: 18,
          }),
        ) !== 0 ||
        compareExactDecimals(
          parseExactDecimal(depletion.slice(1), { maxScale: 18 }),
          expectedCanonicalQuantity,
        ) !== 0 ||
        compareExactDecimals(
          addExactDecimals(
            movement.previousOnHandQuantity.toFixed(),
            packaged
              ? subtractExactDecimals("0", issueQuantity)
              : movement.signedCanonicalEffect.toFixed(),
          ),
          movement.resultingOnHandQuantity.toFixed(),
        ) !== 0 ||
        !Number.isFinite(operation.effectiveAt.getTime()) ||
        operation.effectiveAt > order.completedAt
      )
        throw new FinanceError(
          "CONFLICT",
          "Product fulfillment quantity does not match its stock issue.",
        )

      const event = await tx.financeInventoryValuationEvent.findUnique({
        where: { stockMovementId: movement.id },
        include: { pool: true },
      })
      if (!event) return null
      if (
        event.tenantId !== source.tenantId ||
        event.bookId !== book.id ||
        event.balanceSourceId !== reservation.balanceSourceId ||
        event.pool.tenantId !== source.tenantId ||
        event.pool.bookId !== book.id ||
        event.pool.balanceSourceId !== reservation.balanceSourceId ||
        event.stockOperationId !== operation.id ||
        event.stockMovementId !== movement.id ||
        event.kind !== "ISSUE" ||
        event.sourceKind !== "PRODUCT_FULFILLMENT" ||
        event.sourceId !== fulfillment.id ||
        event.canonicalEffect.toFixed() !==
          movement.signedCanonicalEffect.toFixed() ||
        event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
        event.actorUserId !== operation.actorUserId ||
        compareExactDecimals(event.quantityBefore.toFixed(), quantityBefore) !==
          0 ||
        compareExactDecimals(event.quantityAfter.toFixed(), quantityAfter) !== 0
      )
        throw new FinanceError(
          "CONFLICT",
          "Product issue valuation linkage is inconsistent.",
        )
      if (
        event.sourceCostMinor === null ||
        event.valueDeltaMinor === null ||
        event.valueBeforeMinor === null ||
        event.valueAfterMinor === null ||
        event.unknownReason !== null
      ) {
        if (
          event.sourceCostMinor !== null ||
          event.valueDeltaMinor !== null ||
          event.valueBeforeMinor !== null ||
          event.valueAfterMinor !== null ||
          event.unknownReason === null
        )
          throw new FinanceError(
            "CONFLICT",
            "Product issue unknown cost is inconsistent.",
          )
        return null
      }
      if (
        event.sourceCostMinor < ZERO ||
        event.valueBeforeMinor < ZERO ||
        event.valueAfterMinor < ZERO ||
        event.valueDeltaMinor !== -event.sourceCostMinor ||
        event.valueBeforeMinor + event.valueDeltaMinor !== event.valueAfterMinor
      )
        throw new FinanceError(
          "CONFLICT",
          "Product issue valuation does not conserve carrying value.",
        )
      if (event.sourceCostMinor > BigInt("9223372036854775807"))
        throw new FinanceError(
          "CONFLICT",
          "Product issue cost exceeds database limits.",
        )
      costTotal += event.sourceCostMinor
      if (costTotal > BigInt("9223372036854775807"))
        throw new FinanceError(
          "INVALID_AMOUNT",
          "Order cost exceeds the database limit.",
        )
      fulfilledQuantity = addExactDecimals(fulfilledQuantity, issueQuantity)
    }
    if (
      compareExactDecimals(
        fulfilledQuantity,
        parseExactDecimal(line.quantity.toString(), {
          allowZero: false,
          maxScale: 6,
        }),
      ) !== 0
    )
      return null
    totalQuantity = addExactDecimals(totalQuantity, fulfilledQuantity)
  }

  // Completion evidence includes every original sold obligation (including
  // Services); the cost adapter itself only values Product obligations.
  if (compareExactDecimals(totalQuantity, "0") === 0 || costTotal === ZERO)
    return null

  const accounts = await tx.financeAccount.findMany({
    where: {
      bookId: book.id,
      ...(historicalBookId === undefined ? { archivedAt: null } : {}),
      code: { in: ["5000", "1300"] },
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
        `Required inventory cost account ${code} is unavailable.`,
      )
    return matches[0].id
  }
  const amountMinor = costTotal.toString()
  financeAmount(amountMinor)
  const input: FinancePostingInput = {
    tenantId: source.tenantId,
    actorUserId: order.createdByUserId,
    bookId: book.id,
    clientCommandId: financePostingCommandId(
      `commerce:COMMERCIAL_ORDER_COGS:${order.id}`,
      "posting",
    ),
    sourceKind: "COMMERCIAL_ORDER_COGS",
    sourceId: order.id,
    effectiveAt: order.completedAt,
    storeId: order.storeId,
    description: `Cost of goods sold: ${order.orderNumber}`,
    lines: [
      {
        accountId: account("5000", "EXPENSE", "COST_OF_SALES"),
        side: "DEBIT",
        amountMinor,
      },
      {
        accountId: account("1300", "ASSET", "INVENTORY"),
        side: "CREDIT",
        amountMinor,
      },
    ],
  }
  return { book, input }
}
