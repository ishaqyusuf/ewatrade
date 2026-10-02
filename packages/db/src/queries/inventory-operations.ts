import { createHash } from "node:crypto"

import {
  EXACT_CANONICAL_MAX_SCALE,
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  InventoryUnitStockBehavior,
  StockBalanceKind,
  StockCountStatus,
  StockOperationType,
  UnitConfigurationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { findInventoryOpeningOwnerInTransaction } from "./finance/inventory-opening-owner"
import { postStockCountFinanceJournalsInTransaction } from "./finance/posting"
import { FinanceError } from "./finance/rules"
import { recordStockCountValuationInTransaction } from "./finance/valuation-counts"
import { recordOrdinaryStockValuationInTransaction } from "./finance/valuation-ordinary"
import { recordOrdinaryStockCorrectionValuationInTransaction } from "./finance/valuation-ordinary-corrections"
import { recordPackagedTransformationValuationInTransaction } from "./finance/valuation-transformations"

import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import {
  resolveStockCategories,
  serializeStockCategories,
  stockOperationCategoryGraph,
} from "./inventory-categories"
import {
  lockInventoryFinancialStore,
  lockInventoryFinancialStores,
} from "./inventory-finance-locks"

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function assertSchemaVersion(schemaVersion: number) {
  if (schemaVersion !== 1) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "CLIENT_SCHEMA_UNSUPPORTED: stock commands require schema version 1.",
    )
  }
}

const balanceGraph = {
  inventoryUnit: { include: { configurationVersion: true } },
  product: true,
  store: true,
  variant: true,
} satisfies Prisma.StockBalanceSourceInclude

type BalanceGraph = Prisma.StockBalanceSourceGetPayload<{
  include: typeof balanceGraph
}>

async function loadBalance(
  tx: Prisma.TransactionClient,
  input: { balanceSourceId: string; storeId: string; tenantId: string },
) {
  const balance = await tx.stockBalanceSource.findFirst({
    include: balanceGraph,
    where: {
      id: input.balanceSourceId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!balance) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Balance Source not found for this business and Store.",
    )
  }
  return balance
}

async function loadCompatibleEnteredUnit(
  tx: Prisma.TransactionClient,
  balance: BalanceGraph,
  enteredInventoryUnitId: string,
) {
  const unit = await tx.inventoryUnit.findFirst({
    include: { configurationVersion: true },
    where: {
      configurationVersion: { productId: balance.productId },
      id: enteredInventoryUnitId,
    },
  })
  if (!unit) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Entered Inventory Unit does not belong to this Product.",
    )
  }
  if (
    unit.configurationVersion.status !== UnitConfigurationStatus.CURRENT ||
    unit.configurationVersionId !== balance.inventoryUnit.configurationVersionId
  ) {
    throw new CatalogError(
      "STALE_CONFIGURATION",
      "Entered Inventory Unit and Balance Source must use the Current configuration.",
    )
  }
  if (
    balance.kind === StockBalanceKind.PACKAGED_STOCK &&
    unit.id !== balance.inventoryUnitId
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Packaged Stock must be posted in its own Inventory Unit.",
    )
  }
  if (
    balance.kind === StockBalanceKind.SHARED_POOL &&
    unit.stockBehavior === InventoryUnitStockBehavior.PACKAGED_STOCK
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Packaged Stock cannot be posted into a Shared Stock Pool.",
    )
  }
  return unit
}

function serializeOperation(
  operation: Prisma.StockOperationGetPayload<{
    include: { movements: true; categories: typeof stockOperationCategoryGraph }
  }>,
) {
  return {
    categories: serializeStockCategories(operation.categories),
    clientOperationId: operation.clientOperationId,
    effectiveAt: operation.effectiveAt,
    id: operation.id,
    movements: operation.movements.map((movement) => ({
      balanceSourceId: movement.balanceSourceId,
      configurationVersionId: movement.configurationVersionId,
      enteredInventoryUnitId: movement.enteredInventoryUnitId,
      enteredQuantity: movement.enteredQuantity.toString(),
      id: movement.id,
      previousOnHandQuantity: movement.previousOnHandQuantity.toString(),
      resultingOnHandQuantity: movement.resultingOnHandQuantity.toString(),
      signedCanonicalEffect: movement.signedCanonicalEffect.toString(),
      unitFactorSnapshot: movement.unitFactorSnapshot.toString(),
      unitCostMinorSnapshot: movement.unitCostMinorSnapshot,
      totalCostMinorSnapshot:
        movement.totalCostMinorSnapshot?.toString() ?? null,
      currencyCodeSnapshot: movement.currencyCodeSnapshot,
    })),
    reason: operation.reason,
    source: operation.source,
    storeId: operation.storeId,
    type: operation.type,
  }
}

async function previousOperation(
  tx: Prisma.TransactionClient,
  input: { clientOperationId: string; payloadHash: string; tenantId: string },
) {
  const previous = await tx.stockOperation.findUnique({
    include: { movements: true, categories: stockOperationCategoryGraph },
    where: {
      tenantId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous && previous.payloadHash !== input.payloadHash) {
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "This stock operation identity was already used with different input.",
    )
  }
  return previous
}

export type SingleBalanceInput = {
  categories?: StockCategorySelector[]
  actorUserId: string
  balanceSourceId: string
  clientOperationId: string
  direction: "increase" | "decrease"
  effectiveAt?: Date
  enteredInventoryUnitId: string
  enteredQuantity: string
  expectedBalanceRevision: number
  expectedConfigurationVersionId: string
  linkedOperationId?: string
  reason?: string
  schemaVersion: number
  source: string
  storeId: string
  tenantId: string
  type: "adjustment" | "receipt" | "return"
  unitCostMinor?: number
}

export async function postSingleBalanceStockOperation(
  db: PrismaClient,
  input: SingleBalanceInput,
) {
  const payloadHash = prepareSingleBalanceStockOperation(input)
  return db.$transaction(
    async (tx) => {
      await lockInventoryFinancialStore(tx, input)
      return postSingleBalanceStockOperationInTransactionCore(
        tx,
        input,
        payloadHash,
        true,
      )
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

function prepareSingleBalanceStockOperation(input: SingleBalanceInput) {
  assertSchemaVersion(input.schemaVersion)
  let categories: StockCategorySelector[] | undefined
  try {
    categories =
      input.categories === undefined
        ? undefined
        : normalizeStockCategorySelectors(input.categories)
  } catch (error) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      error instanceof Error ? error.message : "Invalid categories.",
    )
  }
  if (
    (!categories?.length && !input.reason?.trim()) ||
    (input.type === "return" && (!input.reason?.trim() || categories))
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Receive/Adjust require categories or a legacy reason; returns require a reason without categories.",
    )
  }
  return hash(categories === undefined ? input : { ...input, categories })
}

/**
 * Internal domain composition helper. The caller owns authorization and the
 * outer transaction, including acquiring the book lock before the stock lock.
 * This helper grants no public API authority.
 */
export async function postSingleBalanceStockOperationInTransaction(
  tx: Prisma.TransactionClient,
  input: SingleBalanceInput,
) {
  const payloadHash = prepareSingleBalanceStockOperation(input)
  return postSingleBalanceStockOperationInTransactionCore(
    tx,
    input,
    payloadHash,
    false,
  )
}

async function postSingleBalanceStockOperationInTransactionCore(
  tx: Prisma.TransactionClient,
  input: SingleBalanceInput,
  payloadHash: string,
  registerOrdinaryValuation: boolean,
) {
  const previous = await previousOperation(tx, {
    clientOperationId: input.clientOperationId,
    payloadHash,
    tenantId: input.tenantId,
  })
  if (previous) return serializeOperation(previous)

  const categoryLinks = input.categories
    ? await resolveStockCategories(tx, input.tenantId, input.categories)
    : []
  const balance = await loadBalance(tx, input)
  if (balance.revision !== input.expectedBalanceRevision) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The Balance Source changed before this operation.",
    )
  }
  const unit = await loadCompatibleEnteredUnit(
    tx,
    balance,
    input.enteredInventoryUnitId,
  )
  if (unit.configurationVersionId !== input.expectedConfigurationVersionId) {
    throw new CatalogError(
      "STALE_CONFIGURATION",
      "The Product unit configuration changed before this operation.",
    )
  }
  const enteredQuantity = parseExactDecimal(input.enteredQuantity, {
    allowZero: false,
    maxScale: unit.transactionScale,
  })
  const canonicalQuantity = multiplyExactDecimals(
    enteredQuantity,
    unit.factor.toFixed(),
    EXACT_CANONICAL_MAX_SCALE,
  )
  const balanceQuantity =
    balance.kind === StockBalanceKind.SHARED_POOL
      ? canonicalQuantity
      : enteredQuantity
  if (
    input.unitCostMinor !== undefined &&
    (!Number.isSafeInteger(input.unitCostMinor) || input.unitCostMinor < 0)
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Unit cost must be a non-negative minor-unit amount.",
    )
  }
  const totalCostMinor =
    input.unitCostMinor === undefined
      ? undefined
      : multiplyExactDecimals(String(input.unitCostMinor), enteredQuantity)
  const resultingOnHand =
    input.direction === "increase"
      ? addExactDecimals(balance.onHandQuantity.toFixed(), balanceQuantity)
      : subtractExactDecimals(balance.onHandQuantity.toFixed(), balanceQuantity)
  if (
    compareExactDecimals(resultingOnHand, balance.reservedQuantity.toFixed()) <
    0
  ) {
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The operation would reduce on-hand below reserved stock.",
    )
  }

  const update = await tx.stockBalanceSource.updateMany({
    data: { onHandQuantity: resultingOnHand, revision: { increment: 1 } },
    where: { id: balance.id, revision: balance.revision },
  })
  if (update.count !== 1) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "The Balance Source changed while posting this operation.",
    )
  }
  const operation = await tx.stockOperation.create({
    data: {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      effectiveAt: input.effectiveAt ?? new Date(),
      linkedOperationId: input.linkedOperationId,
      payloadHash,
      reason: input.reason?.trim(),
      source: input.source,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type:
        input.type === "receipt"
          ? StockOperationType.RECEIPT
          : input.type === "return"
            ? StockOperationType.RETURN
            : StockOperationType.ADJUSTMENT,
    },
  })
  if (categoryLinks.length)
    await tx.stockOperationCategory.createMany({
      data: categoryLinks.map((link) => ({
        ...link,
        stockOperationId: operation.id,
      })),
    })
  await tx.stockMovement.create({
    data: {
      balanceSourceId: balance.id,
      configurationVersionId: unit.configurationVersionId,
      enteredInventoryUnitId: unit.id,
      enteredQuantity,
      operationId: operation.id,
      previousOnHandQuantity: balance.onHandQuantity,
      resultingOnHandQuantity: resultingOnHand,
      unitCostMinorSnapshot: input.unitCostMinor,
      totalCostMinorSnapshot: totalCostMinor,
      currencyCodeSnapshot:
        input.unitCostMinor === undefined
          ? undefined
          : balance.store.currencyCode,
      signedCanonicalEffect:
        input.direction === "increase"
          ? canonicalQuantity
          : subtractExactDecimals("0", canonicalQuantity),
      transactionScaleSnapshot: unit.transactionScale,
      unitFactorSnapshot: unit.factor,
    },
  })
  const result = await tx.stockOperation.findUniqueOrThrow({
    include: { movements: true, categories: stockOperationCategoryGraph },
    where: { id: operation.id },
  })
  if (registerOrdinaryValuation) {
    await recordOrdinaryStockValuationInTransaction(tx, {
      tenantId: input.tenantId,
      stockOperationId: operation.id,
      expectedStockRevision: input.expectedBalanceRevision + 1,
    })
  }
  return serializeOperation(result)
}

export async function transformPackagedStock(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    expectedConfigurationVersionId: string
    reason: string
    schemaVersion: number
    source: string
    sourceBalanceRevision: number
    sourceBalanceSourceId: string
    sourceQuantity: string
    storeId: string
    targetBalanceRevision: number
    targetBalanceSourceId: string
    targetQuantity: string
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  const payloadHash = hash(input)

  return db.$transaction(
    async (tx) => {
      await lockInventoryFinancialStore(tx, input)
      const previous = await previousOperation(tx, {
        clientOperationId: input.clientOperationId,
        payloadHash,
        tenantId: input.tenantId,
      })
      if (previous) return serializeOperation(previous)

      const balanceIds = [
        input.sourceBalanceSourceId,
        input.targetBalanceSourceId,
      ].sort()
      await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockBalanceSource"
      WHERE "id" IN (${Prisma.join(balanceIds)})
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      ORDER BY "id"
      FOR UPDATE
    `

      const sourceBalance = await loadBalance(tx, {
        balanceSourceId: input.sourceBalanceSourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const targetBalance = await loadBalance(tx, {
        balanceSourceId: input.targetBalanceSourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (
        sourceBalance.id === targetBalance.id ||
        sourceBalance.kind !== StockBalanceKind.PACKAGED_STOCK ||
        targetBalance.kind !== StockBalanceKind.PACKAGED_STOCK ||
        sourceBalance.productId !== targetBalance.productId ||
        sourceBalance.variantId !== targetBalance.variantId
      ) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Transformation endpoints must be different Packaged Stock balances for the same Store, Product, and variant.",
        )
      }
      if (
        sourceBalance.revision !== input.sourceBalanceRevision ||
        targetBalance.revision !== input.targetBalanceRevision
      ) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "A transformation Balance Source changed before confirmation.",
        )
      }
      if (
        sourceBalance.inventoryUnit.configurationVersionId !==
          input.expectedConfigurationVersionId ||
        targetBalance.inventoryUnit.configurationVersionId !==
          input.expectedConfigurationVersionId
      ) {
        throw new CatalogError(
          "STALE_CONFIGURATION",
          "Transformation endpoints must use the expected Current configuration.",
        )
      }

      const sourceQuantity = parseExactDecimal(input.sourceQuantity, {
        allowZero: false,
        maxScale: sourceBalance.inventoryUnit.transactionScale,
      })
      const targetQuantity = parseExactDecimal(input.targetQuantity, {
        allowZero: false,
        maxScale: targetBalance.inventoryUnit.transactionScale,
      })
      const sourceCanonical = multiplyExactDecimals(
        sourceQuantity,
        sourceBalance.inventoryUnit.factor.toString(),
      )
      const targetCanonical = multiplyExactDecimals(
        targetQuantity,
        targetBalance.inventoryUnit.factor.toString(),
      )
      if (compareExactDecimals(sourceCanonical, targetCanonical) !== 0) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Transformation source and target must conserve exact canonical quantity. Record any loss as a separate linked Adjustment.",
        )
      }

      const sourceResult = subtractExactDecimals(
        sourceBalance.onHandQuantity.toString(),
        sourceQuantity,
      )
      if (
        compareExactDecimals(
          sourceResult,
          sourceBalance.reservedQuantity.toString(),
        ) < 0
      ) {
        throw new CatalogError(
          "INSUFFICIENT_STOCK",
          "The source Packaged Stock balance has insufficient available stock.",
        )
      }
      const targetResult = addExactDecimals(
        targetBalance.onHandQuantity.toString(),
        targetQuantity,
      )

      const sourceUpdate = await tx.stockBalanceSource.updateMany({
        data: { onHandQuantity: sourceResult, revision: { increment: 1 } },
        where: { id: sourceBalance.id, revision: sourceBalance.revision },
      })
      const targetUpdate = await tx.stockBalanceSource.updateMany({
        data: { onHandQuantity: targetResult, revision: { increment: 1 } },
        where: { id: targetBalance.id, revision: targetBalance.revision },
      })
      if (sourceUpdate.count !== 1 || targetUpdate.count !== 1) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "A transformation Balance Source changed while posting.",
        )
      }

      const operation = await tx.stockOperation.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          effectiveAt: new Date(),
          payloadHash,
          reason: input.reason.trim(),
          source: input.source,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StockOperationType.TRANSFORMATION,
        },
      })
      await tx.stockMovement.createMany({
        data: [
          {
            balanceSourceId: sourceBalance.id,
            configurationVersionId: input.expectedConfigurationVersionId,
            enteredInventoryUnitId: sourceBalance.inventoryUnitId,
            enteredQuantity: sourceQuantity,
            operationId: operation.id,
            previousOnHandQuantity: sourceBalance.onHandQuantity,
            resultingOnHandQuantity: sourceResult,
            signedCanonicalEffect: subtractExactDecimals("0", sourceCanonical),
            transactionScaleSnapshot:
              sourceBalance.inventoryUnit.transactionScale,
            unitFactorSnapshot: sourceBalance.inventoryUnit.factor,
          },
          {
            balanceSourceId: targetBalance.id,
            configurationVersionId: input.expectedConfigurationVersionId,
            enteredInventoryUnitId: targetBalance.inventoryUnitId,
            enteredQuantity: targetQuantity,
            operationId: operation.id,
            previousOnHandQuantity: targetBalance.onHandQuantity,
            resultingOnHandQuantity: targetResult,
            signedCanonicalEffect: targetCanonical,
            transactionScaleSnapshot:
              targetBalance.inventoryUnit.transactionScale,
            unitFactorSnapshot: targetBalance.inventoryUnit.factor,
          },
        ],
      })
      const result = await tx.stockOperation.findUniqueOrThrow({
        include: { movements: true, categories: stockOperationCategoryGraph },
        where: { id: operation.id },
      })
      await recordPackagedTransformationValuationInTransaction(tx, {
        tenantId: input.tenantId,
        stockOperationId: operation.id,
      })
      return serializeOperation(result)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function createStockCount(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    lines: Array<{
      balanceSourceId: string
      entries: Array<{
        enteredInventoryUnitId: string
        enteredQuantity: string
      }>
      expectedRevision: number
    }>
    reason?: string
    schemaVersion: number
    storeId: string
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  if (input.lines.length === 0) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "A Stock Count requires at least one Balance Source.",
    )
  }
  const payloadHash = hash(input)

  return db.$transaction(async (tx) => {
    const previous = await tx.stockCount.findUnique({
      where: {
        tenantId_clientOperationId: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Stock Count identity was already used with different input.",
        )
      }
      return previous
    }

    const count = await tx.stockCount.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: input.clientOperationId,
        payloadHash,
        reason: input.reason?.trim() || null,
        schemaVersion: input.schemaVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    for (const lineInput of input.lines) {
      if (lineInput.entries.length === 0) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Every counted Balance Source requires at least one observation.",
        )
      }
      const balance = await loadBalance(tx, {
        balanceSourceId: lineInput.balanceSourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (balance.revision !== lineInput.expectedRevision) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "A counted Balance Source changed before the Draft was saved.",
        )
      }

      let observedBalanceQuantity = "0"
      const entries: Array<{
        canonicalQuantity: string
        enteredInventoryUnitId: string
        enteredQuantity: string
        factor: Prisma.Decimal
      }> = []
      for (const entry of lineInput.entries) {
        const unit = await loadCompatibleEnteredUnit(
          tx,
          balance,
          entry.enteredInventoryUnitId,
        )
        const enteredQuantity = parseExactDecimal(entry.enteredQuantity, {
          maxScale: unit.transactionScale,
        })
        const canonicalQuantity = multiplyExactDecimals(
          enteredQuantity,
          unit.factor.toString(),
        )
        observedBalanceQuantity = addExactDecimals(
          observedBalanceQuantity,
          balance.kind === StockBalanceKind.SHARED_POOL
            ? canonicalQuantity
            : enteredQuantity,
        )
        entries.push({
          canonicalQuantity,
          enteredInventoryUnitId: unit.id,
          enteredQuantity,
          factor: unit.factor,
        })
      }
      observedBalanceQuantity = parseExactDecimal(observedBalanceQuantity, {
        maxScale: balance.inventoryUnit.transactionScale,
      })
      const firstEntry = entries[0]
      if (!firstEntry) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Every counted Balance Source requires at least one observation.",
        )
      }
      const line = await tx.stockCountLine.create({
        data: {
          balanceSourceId: balance.id,
          configurationVersionId: balance.inventoryUnit.configurationVersionId,
          expectedQuantity: balance.onHandQuantity,
          expectedRevision: balance.revision,
          observedInventoryUnitId: firstEntry.enteredInventoryUnitId,
          observedQuantity: observedBalanceQuantity,
          stockCountId: count.id,
          varianceQuantity: subtractExactDecimals(
            observedBalanceQuantity,
            balance.onHandQuantity.toString(),
          ),
        },
      })
      await tx.stockCountEntry.createMany({
        data: entries.map((entry) => ({
          canonicalQuantity: entry.canonicalQuantity,
          enteredInventoryUnitId: entry.enteredInventoryUnitId,
          enteredQuantity: entry.enteredQuantity,
          stockCountLineId: line.id,
          unitFactorSnapshot: entry.factor,
        })),
      })
    }
    return count
  })
}

export async function finalizeStockCount(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    reason: string
    schemaVersion: number
    stockCountId: string
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  const payloadHash = hash(input)

  return db.$transaction(
    async (tx) => {
      const identity = await tx.stockCount.findFirst({
        select: { storeId: true },
        where: { id: input.stockCountId, tenantId: input.tenantId },
      })
      if (!identity) {
        throw new CatalogError(
          "STOCK_COUNT_NOT_FOUND",
          "Draft Stock Count not found.",
        )
      }
      await lockInventoryFinancialStore(tx, {
        storeId: identity.storeId,
        tenantId: input.tenantId,
      })
      const previous = await previousOperation(tx, {
        clientOperationId: input.clientOperationId,
        payloadHash,
        tenantId: input.tenantId,
      })
      if (previous) return serializeOperation(previous)

      await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockCount"
      WHERE "id" = ${input.stockCountId}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${identity.storeId}
      FOR UPDATE
    `
      const lineIdentities = await tx.stockCountLine.findMany({
        select: { balanceSourceId: true },
        where: { stockCountId: input.stockCountId },
      })
      const balanceIds = lineIdentities
        .map((line) => line.balanceSourceId)
        .sort()
      if (balanceIds.length) {
        await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockBalanceSource"
        WHERE "id" IN (${Prisma.join(balanceIds)})
          AND "tenantId" = ${input.tenantId}
          AND "storeId" = ${identity.storeId}
        ORDER BY "id"
        FOR UPDATE
      `
      }

      const count = await tx.stockCount.findFirst({
        include: {
          lines: {
            include: {
              balanceSource: { include: balanceGraph },
              observedInventoryUnit: true,
            },
          },
        },
        where: {
          id: input.stockCountId,
          storeId: identity.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!count || count.status !== StockCountStatus.DRAFT) {
        throw new CatalogError(
          "STOCK_COUNT_NOT_FOUND",
          "Draft Stock Count not found.",
        )
      }
      for (const line of count.lines) {
        if (line.balanceSource.revision !== line.expectedRevision) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "A counted Balance Source changed before finalization.",
          )
        }
      }

      const finalizedAt = new Date()
      const operation = await tx.stockOperation.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          effectiveAt: finalizedAt,
          payloadHash,
          reason: input.reason.trim(),
          source: "stock_count",
          storeId: count.storeId,
          tenantId: input.tenantId,
          type: StockOperationType.COUNT_RECONCILIATION,
        },
      })
      for (const line of count.lines) {
        if (compareExactDecimals(line.varianceQuantity.toFixed(), "0") === 0) {
          continue
        }
        const update = await tx.stockBalanceSource.updateMany({
          data: {
            onHandQuantity: line.observedQuantity,
            revision: { increment: 1 },
          },
          where: {
            id: line.balanceSourceId,
            revision: line.expectedRevision,
          },
        })
        if (update.count !== 1) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "A counted Balance Source changed during finalization.",
          )
        }
        const canonicalEffect =
          line.balanceSource.kind === StockBalanceKind.SHARED_POOL
            ? line.varianceQuantity.toFixed()
            : multiplyExactDecimals(
                line.varianceQuantity.toFixed(),
                line.balanceSource.inventoryUnit.factor.toFixed(),
              )
        await tx.stockMovement.create({
          data: {
            balanceSourceId: line.balanceSourceId,
            configurationVersionId: line.configurationVersionId,
            enteredInventoryUnitId: line.balanceSource.inventoryUnitId,
            enteredQuantity: line.varianceQuantity.abs(),
            operationId: operation.id,
            previousOnHandQuantity: line.expectedQuantity,
            resultingOnHandQuantity: line.observedQuantity,
            signedCanonicalEffect: canonicalEffect,
            transactionScaleSnapshot:
              line.balanceSource.inventoryUnit.transactionScale,
            unitFactorSnapshot: line.balanceSource.inventoryUnit.factor,
          },
        })
      }
      await tx.stockCount.update({
        data: {
          finalizedAt,
          finalizedOperationId: operation.id,
          status: StockCountStatus.FINALIZED,
        },
        where: { id: count.id },
      })
      const result = await tx.stockOperation.findUniqueOrThrow({
        include: { movements: true, categories: stockOperationCategoryGraph },
        where: { id: operation.id },
      })
      await recordStockCountValuationInTransaction(tx, {
        tenantId: input.tenantId,
        stockCountId: count.id,
      })
      await postStockCountFinanceJournalsInTransaction(tx, {
        tenantId: input.tenantId,
        stockCountId: count.id,
      })
      return serializeOperation(result)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function correctStockOperation(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    corrections: Array<{
      correctedEnteredQuantity: string
      expectedBalanceRevision: number
      movementId: string
    }>
    reason: string
    schemaVersion: number
    source: string
    targetOperationId: string
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  const payloadHash = hash(input)

  return db.$transaction(
    async (tx) => {
      const identity = await tx.stockOperation.findFirst({
        select: { storeId: true },
        where: { id: input.targetOperationId, tenantId: input.tenantId },
      })
      if (!identity) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "The Stock Operation to correct was not found.",
        )
      }
      const movementIdentities = await tx.stockMovement.findMany({
        select: {
          balanceSourceId: true,
          balanceSource: { select: { storeId: true, tenantId: true } },
        },
        where: { operationId: input.targetOperationId },
      })
      if (
        movementIdentities.some(
          (movement) => movement.balanceSource.tenantId !== input.tenantId,
        )
      ) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Correction Balance Sources must belong to this business.",
        )
      }
      await lockInventoryFinancialStores(tx, {
        storeIds: [
          identity.storeId,
          ...movementIdentities.map(
            (movement) => movement.balanceSource.storeId,
          ),
        ],
        tenantId: input.tenantId,
      })
      const previous = await previousOperation(tx, {
        clientOperationId: input.clientOperationId,
        payloadHash,
        tenantId: input.tenantId,
      })
      if (previous) return serializeOperation(previous)

      await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockOperation"
      WHERE "id" = ${input.targetOperationId}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${identity.storeId}
      FOR UPDATE
    `

      const balanceIds = [
        ...new Set(
          movementIdentities.map((movement) => movement.balanceSourceId),
        ),
      ].sort()
      if (balanceIds.length) {
        await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockBalanceSource"
        WHERE "id" IN (${Prisma.join(balanceIds)})
          AND "tenantId" = ${input.tenantId}
        ORDER BY "id"
        FOR UPDATE
      `
      }

      const target = await tx.stockOperation.findFirst({
        include: {
          committedReservation: { select: { id: true } },
          _count: {
            select: {
              purchaseReceipts: true,
              productFulfillments: true,
              productReturns: true,
              finalizedCounts: true,
              dispatchedTransfers: true,
              receivedTransfers: true,
              cancelledTransfers: true,
              finalizedCloseouts: true,
            },
          },
          categories: stockOperationCategoryGraph,
          corrections: { select: { id: true } },
          movements: {
            include: {
              balanceSource: { include: balanceGraph },
              enteredInventoryUnit: true,
              purchaseReceipt: { select: { id: true } },
              valuationEvent: {
                select: {
                  id: true,
                  sourceKind: true,
                  sourceId: true,
                  stockOperationId: true,
                  stockMovementId: true,
                  purchaseReceiptId: true,
                  productReturnCostId: true,
                },
              },
            },
          },
        },
        where: {
          id: input.targetOperationId,
          storeId: identity.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!target) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "The Stock Operation to correct was not found.",
        )
      }
      if (target.committedReservation != null) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "A committed reservation must be corrected through its owning source.",
        )
      }
      if (target._count.finalizedCloseouts > 0) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "An Inventory Closeout must be corrected through its owning source.",
        )
      }
      if (target.type === StockOperationType.OPENING_STOCK) {
        try {
          const owner = await findInventoryOpeningOwnerInTransaction(tx, {
            tenantId: input.tenantId,
            storeId: target.storeId,
            payloadHash: target.payloadHash,
            clientOperationId: target.clientOperationId,
            source: target.source,
            catalogItemIds: target.movements.map(
              (movement) => movement.balanceSource.product.catalogItemId,
            ),
          })
          if (owner)
            throw new CatalogError(
              "INVALID_STOCK_OPERATION",
              "A Catalog opening must be corrected through its owning source.",
            )
        } catch (error) {
          if (error instanceof FinanceError)
            throw new CatalogError("INVALID_STOCK_OPERATION", error.message)
          throw error
        }
      }
      const ordinaryTarget =
        (target.type === StockOperationType.RECEIPT ||
          target.type === StockOperationType.RETURN ||
          target.type === StockOperationType.ADJUSTMENT) &&
        target.movements.length === 1 &&
        target.correctionOfOperationId === null &&
        Object.values(target._count).every((count) => count === 0)
      if (
        target.movements.some(
          (movement) =>
            movement.purchaseReceipt != null ||
            (movement.valuationEvent != null &&
              (!ordinaryTarget ||
                movement.valuationEvent.sourceKind !==
                  "ORDINARY_STOCK_OPERATION" ||
                movement.valuationEvent.sourceId !== target.id ||
                movement.valuationEvent.stockOperationId !== target.id ||
                movement.valuationEvent.stockMovementId !== movement.id ||
                movement.valuationEvent.purchaseReceiptId !== null ||
                movement.valuationEvent.productReturnCostId !== null)),
        )
      ) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "A financially registered Stock Operation must be corrected through its linked source.",
        )
      }
      if (target.corrections.length > 0) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "This Stock Operation already has a correction.",
        )
      }
      if (input.corrections.length !== target.movements.length) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "A correction must replace every movement in the accepted operation.",
        )
      }
      const correctionByMovement = new Map(
        input.corrections.map((correction) => [
          correction.movementId,
          correction,
        ]),
      )

      const operation = await tx.stockOperation.create({
        data: {
          actorUserId: input.actorUserId,
          clientOperationId: input.clientOperationId,
          correctionOfOperationId: target.id,
          effectiveAt: new Date(),
          payloadHash,
          reason: input.reason.trim(),
          source: input.source,
          storeId: target.storeId,
          tenantId: input.tenantId,
          type: StockOperationType.CORRECTION,
        },
      })

      if (target.categories.length)
        await tx.stockOperationCategory.createMany({
          data: target.categories.map(({ categoryNameId, position }) => ({
            tenantId: input.tenantId,
            stockOperationId: operation.id,
            categoryNameId,
            position,
          })),
        })
      for (const movement of target.movements) {
        const correction = correctionByMovement.get(movement.id)
        if (!correction) {
          throw new CatalogError(
            "INVALID_STOCK_OPERATION",
            `Movement ${movement.id} is missing from the correction.`,
          )
        }
        if (
          movement.balanceSource.revision !== correction.expectedBalanceRevision
        ) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "A corrected Balance Source changed before confirmation.",
          )
        }

        const correctedQuantity = parseExactDecimal(
          correction.correctedEnteredQuantity,
          {
            allowZero: false,
            maxScale: movement.transactionScaleSnapshot,
          },
        )
        const originalWasIncrease =
          compareExactDecimals(movement.signedCanonicalEffect.toFixed(), "0") >
          0
        const originalBalanceQuantity =
          movement.balanceSource.kind === StockBalanceKind.SHARED_POOL
            ? movement.signedCanonicalEffect.abs().toFixed()
            : movement.enteredQuantity.toFixed()
        const correctedCanonical = multiplyExactDecimals(
          correctedQuantity,
          movement.unitFactorSnapshot.toFixed(),
        )
        const correctedBalanceQuantity =
          movement.balanceSource.kind === StockBalanceKind.SHARED_POOL
            ? correctedCanonical
            : correctedQuantity
        const afterReversal = originalWasIncrease
          ? subtractExactDecimals(
              movement.balanceSource.onHandQuantity.toFixed(),
              originalBalanceQuantity,
            )
          : addExactDecimals(
              movement.balanceSource.onHandQuantity.toFixed(),
              originalBalanceQuantity,
            )
        const afterReplacement = originalWasIncrease
          ? addExactDecimals(afterReversal, correctedBalanceQuantity)
          : subtractExactDecimals(afterReversal, correctedBalanceQuantity)
        if (
          compareExactDecimals(
            afterReplacement,
            movement.balanceSource.reservedQuantity.toFixed(),
          ) < 0
        ) {
          throw new CatalogError(
            "INSUFFICIENT_STOCK",
            "The corrected operation would reduce on-hand below reserved stock.",
          )
        }

        const updated = await tx.stockBalanceSource.updateMany({
          data: {
            onHandQuantity: afterReplacement,
            revision: { increment: 1 },
          },
          where: {
            id: movement.balanceSourceId,
            revision: movement.balanceSource.revision,
          },
        })
        if (updated.count !== 1) {
          throw new CatalogError(
            "REVISION_CONFLICT",
            "A corrected Balance Source changed while posting.",
          )
        }

        await tx.stockMovement.create({
          data: {
            balanceSourceId: movement.balanceSourceId,
            configurationVersionId: movement.configurationVersionId,
            enteredInventoryUnitId: movement.enteredInventoryUnitId,
            enteredQuantity: movement.enteredQuantity,
            operationId: operation.id,
            previousOnHandQuantity: movement.balanceSource.onHandQuantity,
            resultingOnHandQuantity: afterReversal,
            reversalOfMovementId: movement.id,
            signedCanonicalEffect: subtractExactDecimals(
              "0",
              movement.signedCanonicalEffect.toFixed(),
            ),
            transactionScaleSnapshot: movement.transactionScaleSnapshot,
            unitFactorSnapshot: movement.unitFactorSnapshot,
          },
        })
        await tx.stockMovement.create({
          data: {
            balanceSourceId: movement.balanceSourceId,
            configurationVersionId: movement.configurationVersionId,
            enteredInventoryUnitId: movement.enteredInventoryUnitId,
            enteredQuantity: correctedQuantity,
            operationId: operation.id,
            previousOnHandQuantity: afterReversal,
            resultingOnHandQuantity: afterReplacement,
            signedCanonicalEffect: originalWasIncrease
              ? correctedCanonical
              : subtractExactDecimals("0", correctedCanonical),
            transactionScaleSnapshot: movement.transactionScaleSnapshot,
            unitFactorSnapshot: movement.unitFactorSnapshot,
          },
        })
      }

      const result = await tx.stockOperation.findUniqueOrThrow({
        include: { movements: true, categories: stockOperationCategoryGraph },
        where: { id: operation.id },
      })
      if (ordinaryTarget) {
        const correction = input.corrections[0]
        if (!correction) {
          throw new CatalogError(
            "INVALID_STOCK_OPERATION",
            "An ordinary correction requires its original movement.",
          )
        }
        await recordOrdinaryStockCorrectionValuationInTransaction(tx, {
          tenantId: input.tenantId,
          stockOperationId: operation.id,
          expectedStockRevision: correction.expectedBalanceRevision + 1,
        })
      }
      return serializeOperation(result)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
