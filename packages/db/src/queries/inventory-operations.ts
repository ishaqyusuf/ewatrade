import { createHash } from "node:crypto"

import {
  EXACT_CANONICAL_MAX_SCALE,
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  InventoryUnitStockBehavior,
  StockBalanceKind,
  StockCountStatus,
  StockOperationType,
  UnitConfigurationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"

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
    include: { movements: true }
  }>,
) {
  return {
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
    include: { movements: true },
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

type SingleBalanceInput = {
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
  reason: string
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
  assertSchemaVersion(input.schemaVersion)
  const payloadHash = hash(input)

  return db.$transaction(async (tx) => {
    const previous = await previousOperation(tx, {
      clientOperationId: input.clientOperationId,
      payloadHash,
      tenantId: input.tenantId,
    })
    if (previous) return serializeOperation(previous)

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
      unit.factor.toString(),
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
        ? addExactDecimals(balance.onHandQuantity.toString(), balanceQuantity)
        : subtractExactDecimals(
            balance.onHandQuantity.toString(),
            balanceQuantity,
          )
    if (
      compareExactDecimals(
        resultingOnHand,
        balance.reservedQuantity.toString(),
      ) < 0
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
        effectiveAt: input.effectiveAt,
        linkedOperationId: input.linkedOperationId,
        payloadHash,
        reason: input.reason.trim(),
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
      include: { movements: true },
      where: { id: operation.id },
    })
    return serializeOperation(result)
  })
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

  return db.$transaction(async (tx) => {
    const previous = await previousOperation(tx, {
      clientOperationId: input.clientOperationId,
      payloadHash,
      tenantId: input.tenantId,
    })
    if (previous) return serializeOperation(previous)

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
      include: { movements: true },
      where: { id: operation.id },
    })
    return serializeOperation(result)
  })
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
      const line = await tx.stockCountLine.create({
        data: {
          balanceSourceId: balance.id,
          configurationVersionId: balance.inventoryUnit.configurationVersionId,
          expectedQuantity: balance.onHandQuantity,
          expectedRevision: balance.revision,
          observedInventoryUnitId: entries[0]!.enteredInventoryUnitId,
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

  return db.$transaction(async (tx) => {
    const previous = await previousOperation(tx, {
      clientOperationId: input.clientOperationId,
      payloadHash,
      tenantId: input.tenantId,
    })
    if (previous) return serializeOperation(previous)

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
        status: StockCountStatus.DRAFT,
        tenantId: input.tenantId,
      },
    })
    if (!count) {
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

    const operation = await tx.stockOperation.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: input.clientOperationId,
        payloadHash,
        reason: input.reason.trim(),
        source: "stock_count",
        storeId: count.storeId,
        tenantId: input.tenantId,
        type: StockOperationType.COUNT_RECONCILIATION,
      },
    })
    for (const line of count.lines) {
      if (compareExactDecimals(line.varianceQuantity.toString(), "0") === 0) {
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
          ? line.varianceQuantity.toString()
          : multiplyExactDecimals(
              line.varianceQuantity.toString(),
              line.balanceSource.inventoryUnit.factor.toString(),
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
        finalizedAt: new Date(),
        finalizedOperationId: operation.id,
        status: StockCountStatus.FINALIZED,
      },
      where: { id: count.id },
    })
    const result = await tx.stockOperation.findUniqueOrThrow({
      include: { movements: true },
      where: { id: operation.id },
    })
    return serializeOperation(result)
  })
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

  return db.$transaction(async (tx) => {
    const previous = await previousOperation(tx, {
      clientOperationId: input.clientOperationId,
      payloadHash,
      tenantId: input.tenantId,
    })
    if (previous) return serializeOperation(previous)

    const target = await tx.stockOperation.findFirst({
      include: {
        corrections: { select: { id: true } },
        movements: {
          include: {
            balanceSource: { include: balanceGraph },
            enteredInventoryUnit: true,
          },
        },
      },
      where: { id: input.targetOperationId, tenantId: input.tenantId },
    })
    if (!target) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "The Stock Operation to correct was not found.",
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
        payloadHash,
        reason: input.reason.trim(),
        source: input.source,
        storeId: target.storeId,
        tenantId: input.tenantId,
        type: StockOperationType.CORRECTION,
      },
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
        compareExactDecimals(movement.signedCanonicalEffect.toString(), "0") > 0
      const originalBalanceQuantity =
        movement.balanceSource.kind === StockBalanceKind.SHARED_POOL
          ? movement.signedCanonicalEffect.abs().toString()
          : movement.enteredQuantity.toString()
      const correctedCanonical = multiplyExactDecimals(
        correctedQuantity,
        movement.unitFactorSnapshot.toString(),
      )
      const correctedBalanceQuantity =
        movement.balanceSource.kind === StockBalanceKind.SHARED_POOL
          ? correctedCanonical
          : correctedQuantity
      const afterReversal = originalWasIncrease
        ? subtractExactDecimals(
            movement.balanceSource.onHandQuantity.toString(),
            originalBalanceQuantity,
          )
        : addExactDecimals(
            movement.balanceSource.onHandQuantity.toString(),
            originalBalanceQuantity,
          )
      const afterReplacement = originalWasIncrease
        ? addExactDecimals(afterReversal, correctedBalanceQuantity)
        : subtractExactDecimals(afterReversal, correctedBalanceQuantity)
      if (
        compareExactDecimals(
          afterReplacement,
          movement.balanceSource.reservedQuantity.toString(),
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
            movement.signedCanonicalEffect.toString(),
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
      include: { movements: true },
      where: { id: operation.id },
    })
    return serializeOperation(result)
  })
}
