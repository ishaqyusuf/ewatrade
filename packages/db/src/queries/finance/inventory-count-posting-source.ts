import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { FinanceBook, Prisma } from "../../../generated/prisma/client"
import { financePostingCommandId } from "./commands"
import type { FinancePostingInput } from "./posting"
import { FinanceError, financeAmount } from "./rules"
import { calculateWeightedAverageIssue } from "./valuation-math"

const ZERO = BigInt(0)
const MAX_DATABASE_MINOR = BigInt("9223372036854775807")

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function canonicalQuantity(
  quantity: string,
  factor: string,
  packaged: boolean,
) {
  return packaged ? multiplyExactDecimals(quantity, factor, 18) : quantity
}

/** Resolve journals only from finalized count movements and saved valuation events. */
export async function resolveInventoryCountPostings(
  tx: Prisma.TransactionClient,
  source: { tenantId: string; stockCountId: string },
): Promise<{ book: FinanceBook; inputs: FinancePostingInput[] } | null> {
  const count = await tx.stockCount.findFirst({
    where: { id: source.stockCountId, tenantId: source.tenantId },
    include: {
      store: { select: { id: true, tenantId: true, currencyCode: true } },
      finalizedOperation: {
        include: {
          store: { select: { id: true, tenantId: true, currencyCode: true } },
          movements: {
            include: {
              balanceSource: { include: { inventoryUnit: true } },
              valuationEvent: { include: { pool: true } },
            },
          },
        },
      },
      lines: {
        include: { balanceSource: { include: { inventoryUnit: true } } },
      },
    },
  })
  if (!count) return null
  if (count.status !== "FINALIZED") return null
  if (!count.finalizedAt || !count.finalizedOperationId)
    conflict(
      "Finalized Stock Count is missing its persisted finalization source.",
    )

  const operation = count.finalizedOperation
  if (
    !operation ||
    operation.id !== count.finalizedOperationId ||
    operation.tenantId !== source.tenantId ||
    operation.storeId !== count.storeId ||
    operation.store.id !== count.storeId ||
    operation.store.tenantId !== source.tenantId ||
    operation.store.currencyCode !== count.store.currencyCode ||
    operation.type !== "COUNT_RECONCILIATION" ||
    operation.source !== "stock_count" ||
    operation.effectiveAt.getTime() !== count.finalizedAt.getTime() ||
    count.store.tenantId !== source.tenantId ||
    count.store.id !== count.storeId ||
    !Number.isFinite(operation.effectiveAt.getTime())
  )
    conflict("Finalized Stock Count provenance is inconsistent.")

  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: source.tenantId,
        currencyCode: count.store.currencyCode,
      },
    },
  })
  if (!book) return null
  if (
    book.tenantId !== source.tenantId ||
    book.currencyCode !== count.store.currencyCode
  )
    conflict("Stock Count Store and financial Book scope disagree.")

  const lineIds = new Set<string>()
  const movementByBalance = new Map<
    string,
    (typeof operation.movements)[number]
  >()
  for (const movement of operation.movements) {
    if (movementByBalance.has(movement.balanceSourceId))
      conflict(
        "A finalized Stock Count has duplicate movements for a Balance Source.",
      )
    movementByBalance.set(movement.balanceSourceId, movement)
  }
  const relevant: Array<{
    movement: (typeof operation.movements)[number]
    amountMinor: bigint
  }> = []
  for (const line of count.lines) {
    if (lineIds.has(line.balanceSourceId))
      conflict("A Stock Count repeats a Balance Source line.")
    lineIds.add(line.balanceSourceId)
    const variance = parseExactDecimal(line.varianceQuantity.toFixed(), {
      allowNegative: true,
      allowZero: true,
      maxScale: 18,
    })
    const expected = parseExactDecimal(line.expectedQuantity.toFixed(), {
      maxScale: 18,
    })
    const observed = parseExactDecimal(line.observedQuantity.toFixed(), {
      maxScale: 18,
    })
    const balance = line.balanceSource
    if (
      balance.id !== line.balanceSourceId ||
      balance.tenantId !== source.tenantId ||
      balance.storeId !== count.storeId ||
      balance.inventoryUnit.configurationVersionId !==
        line.configurationVersionId ||
      balance.inventoryUnitId !== balance.inventoryUnit.id ||
      compareExactDecimals(balance.inventoryUnit.factor.toFixed(), "0") <= 0 ||
      compareExactDecimals(expected, "0") < 0 ||
      compareExactDecimals(observed, "0") < 0 ||
      compareExactDecimals(
        subtractExactDecimals(observed, expected),
        variance,
      ) !== 0
    )
      conflict("Stock Count line quantities are inconsistent.")

    const movement = movementByBalance.get(line.balanceSourceId)
    if (compareExactDecimals(variance, "0") === 0) {
      if (movement)
        conflict("A zero-variance Stock Count line has a stock movement.")
      continue
    }
    if (!movement)
      conflict("A finalized Stock Count line is missing its movement.")
    movementByBalance.delete(line.balanceSourceId)
    const packaged = balance.kind === "PACKAGED_STOCK"
    const factor = parseExactDecimal(balance.inventoryUnit.factor.toFixed(), {
      allowZero: false,
      maxScale: 12,
    })
    const effect = parseExactDecimal(movement.signedCanonicalEffect.toFixed(), {
      allowNegative: true,
      allowZero: false,
      maxScale: 18,
    })
    const expectedEffect = parseExactDecimal(
      canonicalQuantity(variance, factor, packaged),
      { allowNegative: true, allowZero: false, maxScale: 18 },
    )
    const before = canonicalQuantity(expected, factor, packaged)
    const after = canonicalQuantity(observed, factor, packaged)
    const event = movement.valuationEvent
    if (
      movement.operationId !== operation.id ||
      movement.balanceSource.id !== line.balanceSourceId ||
      movement.balanceSource.tenantId !== source.tenantId ||
      movement.balanceSource.storeId !== count.storeId ||
      balance.tenantId !== source.tenantId ||
      balance.storeId !== count.storeId ||
      movement.configurationVersionId !== line.configurationVersionId ||
      movement.configurationVersionId !==
        balance.inventoryUnit.configurationVersionId ||
      movement.enteredInventoryUnitId !== balance.inventoryUnitId ||
      movement.transactionScaleSnapshot !==
        balance.inventoryUnit.transactionScale ||
      movement.reversalOfMovementId !== null ||
      compareExactDecimals(movement.unitFactorSnapshot.toFixed(), factor) !==
        0 ||
      compareExactDecimals(
        movement.enteredQuantity.toFixed(),
        variance.startsWith("-") ? variance.slice(1) : variance,
      ) !== 0 ||
      compareExactDecimals(effect, expectedEffect) !== 0 ||
      compareExactDecimals(
        movement.previousOnHandQuantity.toFixed(),
        expected,
      ) !== 0 ||
      compareExactDecimals(
        movement.resultingOnHandQuantity.toFixed(),
        observed,
      ) !== 0 ||
      compareExactDecimals(
        addExactDecimals(movement.previousOnHandQuantity.toFixed(), variance),
        movement.resultingOnHandQuantity.toFixed(),
      ) !== 0
    )
      conflict("Stock Count movement does not match its finalized line.")
    if (!event)
      conflict("Finalized Stock Count movement is missing its valuation event.")
    if (
      event.tenantId !== source.tenantId ||
      event.bookId !== book.id ||
      event.purchaseReceiptId !== null ||
      event.productReturnCostId !== null ||
      event.balanceSourceId !== balance.id ||
      event.pool.tenantId !== source.tenantId ||
      event.pool.bookId !== book.id ||
      event.pool.balanceSourceId !== balance.id ||
      event.poolId !== event.pool.id ||
      event.sequence <= ZERO ||
      event.sequence > MAX_DATABASE_MINOR ||
      event.stockOperationId !== operation.id ||
      event.stockMovementId !== movement.id ||
      event.kind !== "ADJUSTMENT" ||
      event.sourceKind !== "STOCK_COUNT" ||
      event.sourceId !== count.id ||
      compareExactDecimals(event.canonicalEffect.toFixed(), effect) !== 0 ||
      compareExactDecimals(event.quantityBefore.toFixed(), before) !== 0 ||
      compareExactDecimals(event.quantityAfter.toFixed(), after) !== 0 ||
      event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
      event.actorUserId !== operation.actorUserId
    )
      conflict("Stock Count valuation event provenance is inconsistent.")

    const known =
      event.sourceCostMinor !== null &&
      event.valueBeforeMinor !== null &&
      event.valueDeltaMinor !== null &&
      event.valueAfterMinor !== null &&
      event.unknownReason === null
    const unknown =
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.unknownReason !== null &&
      (event.valueBeforeMinor === null || event.valueBeforeMinor >= ZERO)
    if (!known && !unknown)
      conflict("Stock Count valuation cost state is inconsistent.")
    if (
      unknown &&
      ((event.valueBeforeMinor !== null &&
        (event.valueBeforeMinor < ZERO ||
          event.valueBeforeMinor > MAX_DATABASE_MINOR)) ||
        (compareExactDecimals(effect, "0") < 0 &&
          event.valueBeforeMinor !== null) ||
        (compareExactDecimals(effect, "0") > 0 &&
          event.unknownReason !== "UNCAPTURED_MOVEMENTS"))
    )
      conflict("Stock Count unknown valuation state is inconsistent.")
    if (known) {
      const sourceCostMinor = event.sourceCostMinor
      const valueBeforeMinor = event.valueBeforeMinor
      const delta = event.valueDeltaMinor
      const valueAfterMinor = event.valueAfterMinor
      if (
        sourceCostMinor === null ||
        valueBeforeMinor === null ||
        delta === null ||
        valueAfterMinor === null
      )
        conflict("Stock Count valuation cost state is incomplete.")
      if (
        sourceCostMinor < ZERO ||
        sourceCostMinor > MAX_DATABASE_MINOR ||
        valueBeforeMinor < ZERO ||
        valueBeforeMinor > MAX_DATABASE_MINOR ||
        valueAfterMinor < ZERO ||
        valueAfterMinor > MAX_DATABASE_MINOR ||
        valueBeforeMinor + delta !== valueAfterMinor ||
        (compareExactDecimals(effect, "0") < 0 &&
          (delta > ZERO || -delta !== sourceCostMinor))
      )
        conflict("Stock Count valuation does not conserve carrying value.")
      if (compareExactDecimals(effect, "0") > 0)
        conflict("A physical count gain cannot establish carrying value.")
      let issue: ReturnType<typeof calculateWeightedAverageIssue>
      try {
        issue = calculateWeightedAverageIssue({
          quantityBefore: before,
          valueBeforeMinor,
          quantityIssued: movement.signedCanonicalEffect.toFixed().slice(1),
        })
      } catch {
        conflict("Stock Count weighted carrying value is inconsistent.")
      }
      if (
        sourceCostMinor !== issue.valueIssuedMinor ||
        valueAfterMinor !== issue.valueAfterMinor
      )
        conflict("Stock Count weighted carrying value is inconsistent.")
      if (sourceCostMinor > ZERO)
        relevant.push({ movement, amountMinor: sourceCostMinor })
    }
  }
  if (movementByBalance.size > 0)
    conflict("Finalized Stock Count has a movement without a count line.")

  if (relevant.length === 0) return { book, inputs: [] }
  const accounts = await tx.financeAccount.findMany({
    where: { bookId: book.id, archivedAt: null },
    select: { id: true, code: true, kind: true, purpose: true },
  })
  const account = (code: string, kind: string, purpose: string) => {
    const found = accounts.find(
      (candidate) =>
        candidate.code === code &&
        candidate.kind === kind &&
        candidate.purpose === purpose,
    )
    if (!found)
      throw new FinanceError(
        "NOT_FOUND",
        `Required inventory count account ${code} is unavailable.`,
      )
    return found.id
  }
  const expenseAccountId = account("6000", "EXPENSE", "OPERATING_EXPENSE")
  const inventoryAccountId = account("1300", "ASSET", "INVENTORY")
  const inputs = relevant
    .sort((left, right) => left.movement.id.localeCompare(right.movement.id))
    .map(({ movement, amountMinor }) => {
      const amount = amountMinor.toString()
      financeAmount(amount)
      return {
        tenantId: source.tenantId,
        actorUserId: operation.actorUserId,
        bookId: book.id,
        clientCommandId: financePostingCommandId(
          `inventory-count:INVENTORY_COUNT_SHORTAGE:${movement.id}`,
          "posting",
        ),
        sourceKind: "INVENTORY_COUNT_SHORTAGE",
        sourceId: movement.id,
        effectiveAt: operation.effectiveAt,
        storeId: count.storeId,
        description: `Inventory count shortage: ${count.id}`,
        lines: [
          {
            accountId: expenseAccountId,
            side: "DEBIT" as const,
            amountMinor: amount,
          },
          {
            accountId: inventoryAccountId,
            side: "CREDIT" as const,
            amountMinor: amount,
          },
        ],
      } satisfies FinancePostingInput
    })
  return { book, inputs }
}
