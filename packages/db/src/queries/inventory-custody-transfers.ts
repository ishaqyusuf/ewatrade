import { createHash } from "node:crypto"

import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  InventoryCloseoutStatus,
  StockCustodyType,
  StockOperationType,
  StockTransferStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { recordInventoryCloseoutFinanceInTransaction } from "./finance/posting"
import { recordInventoryRelocationValuationInTransaction } from "./finance/valuation-relocations"
import { lockInventoryFinancialStores } from "./inventory-finance-locks"

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const

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

function custodyType(value: "session" | "staff" | "store" | "transit") {
  if (value === "staff") return StockCustodyType.STAFF
  if (value === "session") return StockCustodyType.SESSION
  if (value === "transit") return StockCustodyType.TRANSIT
  return StockCustodyType.STORE
}

const balanceInclude = {
  store: true,
  inventoryUnit: { include: { configurationVersion: true } },
} satisfies Prisma.StockBalanceSourceInclude

async function tenantStore(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
) {
  const store = await tx.store.findFirst({
    where: { id: storeId, tenantId },
    select: { id: true, currencyCode: true },
  })
  if (!store) {
    throw new CatalogError(
      "STORE_NOT_FOUND",
      "Store not found for this business.",
    )
  }
  return store
}

async function balance(
  tx: Prisma.TransactionClient,
  input: { balanceSourceId: string; storeId?: string; tenantId: string },
) {
  const row = await tx.stockBalanceSource.findFirst({
    include: balanceInclude,
    where: {
      id: input.balanceSourceId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!row) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Balance Source not found for this business.",
    )
  }
  return row
}

function assertRevision(actual: number, expected: number) {
  if (actual !== expected) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "A Balance Source changed before confirmation.",
    )
  }
}

async function lockRelocationBalances(
  tx: Prisma.TransactionClient,
  tenantId: string,
  balanceIds: string[],
) {
  const ids = [...new Set(balanceIds)].sort()
  if (ids.length !== 2) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Stock relocation requires two distinct Balance Sources.",
    )
  }
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockBalanceSource"
    WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId}
    ORDER BY "id" FOR UPDATE
  `
  if (
    locked.length !== ids.length ||
    locked.some((row) => !ids.includes(row.id))
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Stock relocation Balance Sources must belong to this business.",
    )
  }
}

async function postCustodyMovement(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    clientOperationId: string
    payloadHash: string
    quantity: string
    reason: string
    source: string
    sourceBalance: Awaited<ReturnType<typeof balance>>
    targetBalance: Awaited<ReturnType<typeof balance>>
    tenantId: string
    type: "assignment" | "return" | "transfer"
  },
) {
  const quantity = parseExactDecimal(input.quantity, {
    allowZero: false,
    maxScale: input.sourceBalance.inventoryUnit.transactionScale,
  })
  if (
    input.sourceBalance.storeId !== input.targetBalance.storeId &&
    input.type !== "transfer"
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Custody movement must remain in one Store.",
    )
  }
  if (
    input.sourceBalance.productId !== input.targetBalance.productId ||
    input.sourceBalance.variantId !== input.targetBalance.variantId ||
    input.sourceBalance.inventoryUnitId !== input.targetBalance.inventoryUnitId
  ) {
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Custody and transfer movements must preserve Product, variant, and Inventory Unit meaning.",
    )
  }
  const sourceResult = subtractExactDecimals(
    input.sourceBalance.onHandQuantity.toFixed(),
    quantity,
  )
  if (
    compareExactDecimals(
      sourceResult,
      input.sourceBalance.reservedQuantity.toFixed(),
    ) < 0
  ) {
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The source Balance Source has insufficient available stock.",
    )
  }
  const targetResult = addExactDecimals(
    input.targetBalance.onHandQuantity.toFixed(),
    quantity,
  )
  const sourceUpdate = await tx.stockBalanceSource.updateMany({
    data: { onHandQuantity: sourceResult, revision: { increment: 1 } },
    where: {
      id: input.sourceBalance.id,
      revision: input.sourceBalance.revision,
    },
  })
  const targetUpdate = await tx.stockBalanceSource.updateMany({
    data: { onHandQuantity: targetResult, revision: { increment: 1 } },
    where: {
      id: input.targetBalance.id,
      revision: input.targetBalance.revision,
    },
  })
  if (sourceUpdate.count !== 1 || targetUpdate.count !== 1) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "A Balance Source changed while moving stock.",
    )
  }

  const canonicalQuantity = multiplyExactDecimals(
    quantity,
    input.sourceBalance.inventoryUnit.factor.toFixed(),
  )
  const operation = await tx.stockOperation.create({
    data: {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      effectiveAt: new Date(),
      payloadHash: input.payloadHash,
      reason: input.reason.trim(),
      source: input.source,
      storeId: input.sourceBalance.storeId,
      tenantId: input.tenantId,
      type:
        input.type === "assignment"
          ? StockOperationType.CUSTODY_ASSIGNMENT
          : input.type === "return"
            ? StockOperationType.CUSTODY_RETURN
            : StockOperationType.TRANSFER,
    },
  })
  await tx.stockMovement.createMany({
    data: [
      {
        balanceSourceId: input.sourceBalance.id,
        configurationVersionId:
          input.sourceBalance.inventoryUnit.configurationVersionId,
        enteredInventoryUnitId: input.sourceBalance.inventoryUnitId,
        enteredQuantity: quantity,
        operationId: operation.id,
        previousOnHandQuantity: input.sourceBalance.onHandQuantity,
        resultingOnHandQuantity: sourceResult,
        signedCanonicalEffect: subtractExactDecimals("0", canonicalQuantity),
        transactionScaleSnapshot:
          input.sourceBalance.inventoryUnit.transactionScale,
        unitFactorSnapshot: input.sourceBalance.inventoryUnit.factor,
      },
      {
        balanceSourceId: input.targetBalance.id,
        configurationVersionId:
          input.targetBalance.inventoryUnit.configurationVersionId,
        enteredInventoryUnitId: input.targetBalance.inventoryUnitId,
        enteredQuantity: quantity,
        operationId: operation.id,
        previousOnHandQuantity: input.targetBalance.onHandQuantity,
        resultingOnHandQuantity: targetResult,
        signedCanonicalEffect: canonicalQuantity,
        transactionScaleSnapshot:
          input.targetBalance.inventoryUnit.transactionScale,
        unitFactorSnapshot: input.targetBalance.inventoryUnit.factor,
      },
    ],
  })
  return operation
}

export async function moveInventoryCustody(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    expectedSourceRevision: number
    expectedTargetRevision?: number
    quantity: string
    reason: string
    schemaVersion: 1
    source: string
    sourceBalanceSourceId: string
    targetCustodyReferenceId: string
    targetCustodyType: "session" | "staff" | "store"
    tenantId: string
  },
) {
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const sourceIdentity = await tx.stockBalanceSource.findFirst({
      where: { id: input.sourceBalanceSourceId, tenantId: input.tenantId },
      select: { id: true, storeId: true },
    })
    if (!sourceIdentity) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Balance Source not found for this business.",
      )
    }
    await lockInventoryFinancialStores(tx, {
      tenantId: input.tenantId,
      storeIds: [sourceIdentity.storeId],
    })

    const previous = await tx.stockOperation.findUnique({
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
          "This custody operation identity was already used with different input.",
        )
      }
      return previous
    }

    let sourceBalance = await balance(tx, {
      balanceSourceId: input.sourceBalanceSourceId,
      storeId: sourceIdentity.storeId,
      tenantId: input.tenantId,
    })
    assertRevision(sourceBalance.revision, input.expectedSourceRevision)
    const targetType = custodyType(input.targetCustodyType)
    const targetReference =
      targetType === StockCustodyType.STORE
        ? ""
        : input.targetCustodyReferenceId.trim()
    if (targetType !== StockCustodyType.STORE && !targetReference) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Staff or session custody requires a stable reference identity.",
      )
    }
    const target = await tx.stockBalanceSource.upsert({
      create: {
        custodyReferenceId: targetReference,
        custodyType: targetType,
        inventoryUnitId: sourceBalance.inventoryUnitId,
        kind: sourceBalance.kind,
        parentBalanceSourceId:
          sourceBalance.custodyType === StockCustodyType.STORE
            ? sourceBalance.id
            : sourceBalance.parentBalanceSourceId,
        productId: sourceBalance.productId,
        storeId: sourceBalance.storeId,
        tenantId: input.tenantId,
        variantId: sourceBalance.variantId,
      },
      update: {},
      where: {
        storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
          custodyReferenceId: targetReference,
          custodyType: targetType,
          inventoryUnitId: sourceBalance.inventoryUnitId,
          storeId: sourceBalance.storeId,
          variantId: sourceBalance.variantId,
        },
      },
    })
    await lockRelocationBalances(tx, input.tenantId, [
      sourceBalance.id,
      target.id,
    ])
    sourceBalance = await balance(tx, {
      balanceSourceId: sourceBalance.id,
      storeId: sourceIdentity.storeId,
      tenantId: input.tenantId,
    })
    assertRevision(sourceBalance.revision, input.expectedSourceRevision)
    const targetBalance = await balance(tx, {
      balanceSourceId: target.id,
      tenantId: input.tenantId,
    })
    if (
      input.expectedTargetRevision !== undefined &&
      targetBalance.revision !== input.expectedTargetRevision
    ) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "The target custody balance changed before confirmation.",
      )
    }
    const isReturn =
      sourceBalance.custodyType !== StockCustodyType.STORE &&
      targetType === StockCustodyType.STORE
    const operation = await postCustodyMovement(tx, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      quantity: input.quantity,
      reason: input.reason,
      source: input.source,
      sourceBalance,
      targetBalance,
      tenantId: input.tenantId,
      type: isReturn ? "return" : "assignment",
    })
    await recordInventoryRelocationValuationInTransaction(tx, {
      tenantId: input.tenantId,
      stockOperationId: operation.id,
      expectedSourceStockRevision: sourceBalance.revision + 1,
      expectedTargetStockRevision: targetBalance.revision + 1,
    })
    return operation
  }, TRANSACTION_OPTIONS)
}

export async function createAndDispatchStockTransfer(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    clientTransferId: string
    expectedSourceRevision: number
    quantity: string
    reason: string
    schemaVersion: 1
    source: string
    sourceBalanceSourceId: string
    targetStoreId: string
    tenantId: string
  },
) {
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const sourceIdentity = await tx.stockBalanceSource.findFirst({
      where: { id: input.sourceBalanceSourceId, tenantId: input.tenantId },
      select: { id: true, storeId: true },
    })
    if (!sourceIdentity) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Balance Source not found for this business.",
      )
    }
    await lockInventoryFinancialStores(tx, {
      tenantId: input.tenantId,
      storeIds: [sourceIdentity.storeId, input.targetStoreId],
    })

    const previous = await tx.stockTransfer.findUnique({
      where: {
        tenantId_clientTransferId: {
          clientTransferId: input.clientTransferId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This transfer identity was already used with different input.",
        )
      }
      return previous
    }

    let sourceBalance = await balance(tx, {
      balanceSourceId: input.sourceBalanceSourceId,
      storeId: sourceIdentity.storeId,
      tenantId: input.tenantId,
    })
    if (sourceBalance.custodyType !== StockCustodyType.STORE) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Store transfer dispatch must start from central Store custody.",
      )
    }
    assertRevision(sourceBalance.revision, input.expectedSourceRevision)
    const targetStore = await tenantStore(
      tx,
      input.tenantId,
      input.targetStoreId,
    )
    if (sourceBalance.storeId === input.targetStoreId) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Source and target Stores must be different.",
      )
    }
    const quantity = parseExactDecimal(input.quantity, {
      allowZero: false,
      maxScale: sourceBalance.inventoryUnit.transactionScale,
    })
    const canonicalQuantity = multiplyExactDecimals(
      quantity,
      sourceBalance.inventoryUnit.factor.toFixed(),
    )
    const transfer = await tx.stockTransfer.create({
      data: {
        canonicalQuantity,
        clientTransferId: input.clientTransferId,
        configurationVersionId:
          sourceBalance.inventoryUnit.configurationVersionId,
        createdByUserId: input.actorUserId,
        enteredQuantity: quantity,
        inventoryUnitId: sourceBalance.inventoryUnitId,
        payloadHash,
        schemaVersion: input.schemaVersion,
        sourceBalanceSourceId: sourceBalance.id,
        sourceStoreId: sourceBalance.storeId,
        stockBehaviorSnapshot: sourceBalance.inventoryUnit.stockBehavior,
        targetStoreId: input.targetStoreId,
        tenantId: input.tenantId,
        unitFactorSnapshot: sourceBalance.inventoryUnit.factor,
      },
    })
    const transit = await tx.stockBalanceSource.create({
      data: {
        custodyReferenceId: transfer.id,
        custodyType: StockCustodyType.TRANSIT,
        inventoryUnitId: sourceBalance.inventoryUnitId,
        kind: sourceBalance.kind,
        parentBalanceSourceId: sourceBalance.id,
        productId: sourceBalance.productId,
        storeId: sourceBalance.storeId,
        tenantId: input.tenantId,
        variantId: sourceBalance.variantId,
      },
    })
    await lockRelocationBalances(tx, input.tenantId, [
      sourceBalance.id,
      transit.id,
    ])
    sourceBalance = await balance(tx, {
      balanceSourceId: sourceBalance.id,
      storeId: sourceIdentity.storeId,
      tenantId: input.tenantId,
    })
    assertRevision(sourceBalance.revision, input.expectedSourceRevision)
    const transitBalance = await balance(tx, {
      balanceSourceId: transit.id,
      tenantId: input.tenantId,
    })
    const operation = await postCustodyMovement(tx, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      quantity,
      reason: input.reason,
      source: input.source,
      sourceBalance,
      targetBalance: transitBalance,
      tenantId: input.tenantId,
      type: "transfer",
    })
    const dispatched = await tx.stockTransfer.update({
      data: {
        dispatchedAt: operation.effectiveAt,
        dispatchedOperationId: operation.id,
        status: StockTransferStatus.IN_TRANSIT,
        transitBalanceSourceId: transit.id,
      },
      where: { id: transfer.id },
    })
    if (sourceBalance.store.currencyCode === targetStore.currencyCode) {
      await recordInventoryRelocationValuationInTransaction(tx, {
        tenantId: input.tenantId,
        stockOperationId: operation.id,
        expectedSourceStockRevision: sourceBalance.revision + 1,
        expectedTargetStockRevision: transitBalance.revision + 1,
      })
    }
    return dispatched
  }, TRANSACTION_OPTIONS)
}

export async function receiveOrCancelStockTransfer(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    expectedTransitRevision: number
    reason: string
    schemaVersion: 1
    source: string
    tenantId: string
    transferId: string
    transition: "cancel" | "receive"
  },
) {
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const transferIdentity = await tx.stockTransfer.findFirst({
      select: { id: true, sourceStoreId: true, targetStoreId: true },
      where: { id: input.transferId, tenantId: input.tenantId },
    })
    if (!transferIdentity) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Stock Transfer not found for this business.",
      )
    }
    await lockInventoryFinancialStores(tx, {
      tenantId: input.tenantId,
      storeIds: [
        transferIdentity.sourceStoreId,
        transferIdentity.targetStoreId,
      ],
    })

    const previousOperation = await tx.stockOperation.findUnique({
      where: {
        tenantId_clientOperationId: {
          clientOperationId: input.clientOperationId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previousOperation) {
      if (previousOperation.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This transfer transition identity was already used with different input.",
        )
      }
      return tx.stockTransfer.findFirstOrThrow({
        where: { id: input.transferId, tenantId: input.tenantId },
      })
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockTransfer"
      WHERE "id" = ${input.transferId} AND "tenantId" = ${input.tenantId}
        AND "sourceStoreId" = ${transferIdentity.sourceStoreId}
        AND "targetStoreId" = ${transferIdentity.targetStoreId}
      FOR UPDATE
    `

    const transfer = await tx.stockTransfer.findFirst({
      include: {
        sourceStore: true,
        targetStore: true,
        sourceBalanceSource: { include: balanceInclude },
        transitBalanceSource: { include: balanceInclude },
      },
      where: {
        id: input.transferId,
        tenantId: input.tenantId,
        sourceStoreId: transferIdentity.sourceStoreId,
        targetStoreId: transferIdentity.targetStoreId,
      },
    })
    if (
      !transfer?.transitBalanceSource ||
      transfer.status !== StockTransferStatus.IN_TRANSIT
    ) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Only an in-transit Stock Transfer can be received or cancelled.",
      )
    }
    assertRevision(
      transfer.transitBalanceSource.revision,
      input.expectedTransitRevision,
    )

    let targetBalance = transfer.sourceBalanceSource
    if (input.transition === "receive") {
      const target = await tx.stockBalanceSource.upsert({
        create: {
          custodyReferenceId: "",
          custodyType: StockCustodyType.STORE,
          inventoryUnitId: transfer.inventoryUnitId,
          kind: transfer.sourceBalanceSource.kind,
          productId: transfer.sourceBalanceSource.productId,
          storeId: transfer.targetStoreId,
          tenantId: input.tenantId,
          variantId: transfer.sourceBalanceSource.variantId,
        },
        update: {},
        where: {
          storeId_variantId_inventoryUnitId_custodyType_custodyReferenceId: {
            custodyReferenceId: "",
            custodyType: StockCustodyType.STORE,
            inventoryUnitId: transfer.inventoryUnitId,
            storeId: transfer.targetStoreId,
            variantId: transfer.sourceBalanceSource.variantId,
          },
        },
      })
      targetBalance = await balance(tx, {
        balanceSourceId: target.id,
        tenantId: input.tenantId,
      })
    }
    await lockRelocationBalances(tx, input.tenantId, [
      transfer.transitBalanceSource.id,
      targetBalance.id,
    ])
    const transitBalance = await balance(tx, {
      balanceSourceId: transfer.transitBalanceSource.id,
      tenantId: input.tenantId,
    })
    targetBalance = await balance(tx, {
      balanceSourceId: targetBalance.id,
      tenantId: input.tenantId,
    })
    assertRevision(transitBalance.revision, input.expectedTransitRevision)
    const operation = await postCustodyMovement(tx, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      quantity: transfer.enteredQuantity.toFixed(),
      reason: input.reason,
      source: input.source,
      sourceBalance: transitBalance,
      targetBalance,
      tenantId: input.tenantId,
      type: "transfer",
    })
    const now = operation.effectiveAt
    const transitioned = await tx.stockTransfer.update({
      data:
        input.transition === "receive"
          ? {
              receivedAt: now,
              receivedOperationId: operation.id,
              status: StockTransferStatus.RECEIVED,
            }
          : {
              cancelledAt: now,
              cancelledOperationId: operation.id,
              status: StockTransferStatus.CANCELLED,
            },
      where: { id: transfer.id },
    })
    if (
      transfer.sourceStore.currencyCode === transfer.targetStore.currencyCode
    ) {
      await recordInventoryRelocationValuationInTransaction(tx, {
        tenantId: input.tenantId,
        stockOperationId: operation.id,
        expectedSourceStockRevision: transitBalance.revision + 1,
        expectedTargetStockRevision: targetBalance.revision + 1,
      })
    }
    return transitioned
  }, TRANSACTION_OPTIONS)
}

export async function createInventoryCloseout(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    custodyReferenceId: string
    custodyType: "session" | "staff"
    declarations: Array<{
      balanceSourceId: string
      declaredQuantity: string
      expectedRevision: number
    }>
    reason?: string
    schemaVersion: 1
    storeId: string
    tenantId: string
  },
) {
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const previous = await tx.inventoryCloseout.findUnique({
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
          "This closeout identity was already used with different input.",
        )
      }
      return previous
    }

    const type = custodyType(input.custodyType)
    const closeout = await tx.inventoryCloseout.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: input.clientOperationId,
        custodyReferenceId: input.custodyReferenceId,
        custodyType: type,
        payloadHash,
        reason: input.reason?.trim() || null,
        schemaVersion: input.schemaVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    for (const declaration of input.declarations) {
      const source = await balance(tx, {
        balanceSourceId: declaration.balanceSourceId,
        tenantId: input.tenantId,
      })
      if (
        source.storeId !== input.storeId ||
        source.custodyType !== type ||
        source.custodyReferenceId !== input.custodyReferenceId
      ) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Closeout declarations must target the selected custody balances.",
        )
      }
      assertRevision(source.revision, declaration.expectedRevision)
      const declaredQuantity = parseExactDecimal(declaration.declaredQuantity, {
        maxScale: source.inventoryUnit.transactionScale,
      })
      await tx.inventoryCloseoutLine.create({
        data: {
          balanceSourceId: source.id,
          closeoutId: closeout.id,
          declaredQuantity,
          expectedQuantity: source.onHandQuantity,
          expectedRevision: source.revision,
          varianceQuantity: subtractExactDecimals(
            declaredQuantity,
            source.onHandQuantity.toString(),
          ),
        },
      })
    }
    return closeout
  })
}

export async function finalizeInventoryCloseout(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    closeoutId: string
    reason: string
    schemaVersion: 1
    tenantId: string
  },
) {
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const closeoutIdentity = await tx.inventoryCloseout.findFirst({
      where: { id: input.closeoutId, tenantId: input.tenantId },
      select: { id: true, storeId: true },
    })
    if (!closeoutIdentity) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Draft Inventory Closeout not found.",
      )
    }
    const financialContexts = await lockInventoryFinancialStores(tx, {
      tenantId: input.tenantId,
      storeIds: [closeoutIdentity.storeId],
    })

    if (financialContexts.length !== 1) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Closeout financial Store context is incomplete.",
      )
    }

    const readPrevious = () =>
      tx.stockOperation.findUnique({
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
    const replay = (
      previous: NonNullable<Awaited<ReturnType<typeof readPrevious>>>,
    ) => {
      if (previous.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This closeout finalization identity was already used with different input.",
        )
      }
      return previous
    }
    const previous = await readPrevious()
    if (previous) return replay(previous)

    const lockedCloseouts = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "InventoryCloseout"
      WHERE "id" = ${input.closeoutId} AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${closeoutIdentity.storeId}
      FOR UPDATE
    `
    if (
      lockedCloseouts.length !== 1 ||
      lockedCloseouts[0]?.id !== input.closeoutId
    ) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Closeout source ownership changed before finalization.",
      )
    }
    const concurrentPrevious = await readPrevious()
    if (concurrentPrevious) return replay(concurrentPrevious)
    const lineIdentities = await tx.inventoryCloseoutLine.findMany({
      select: { balanceSourceId: true },
      where: { closeoutId: input.closeoutId },
    })
    const balanceIds = [
      ...new Set(lineIdentities.map((line) => line.balanceSourceId)),
    ].sort()
    if (balanceIds.length) {
      const lockedBalances = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StockBalanceSource"
        WHERE "id" IN (${Prisma.join(balanceIds)})
          AND "tenantId" = ${input.tenantId}
          AND "storeId" = ${closeoutIdentity.storeId}
        ORDER BY "id"
        FOR UPDATE
      `
      if (
        lockedBalances.length !== balanceIds.length ||
        new Set(lockedBalances.map((row) => row.id)).size !==
          balanceIds.length ||
        lockedBalances.some((row) => !balanceIds.includes(row.id))
      ) {
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Closeout Balance Sources must belong to this Store and business.",
        )
      }
    }

    const closeout = await tx.inventoryCloseout.findFirst({
      include: {
        lines: { include: { balanceSource: { include: balanceInclude } } },
      },
      where: {
        id: closeoutIdentity.id,
        storeId: closeoutIdentity.storeId,
        status: InventoryCloseoutStatus.DRAFT,
        tenantId: input.tenantId,
      },
    })
    if (!closeout) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Draft Inventory Closeout not found.",
      )
    }
    if (
      (closeout.custodyType !== StockCustodyType.STAFF &&
        closeout.custodyType !== StockCustodyType.SESSION) ||
      !closeout.custodyReferenceId.trim() ||
      closeout.lines.length !== lineIdentities.length ||
      new Set(closeout.lines.map((line) => line.balanceSourceId)).size !==
        balanceIds.length
    ) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Closeout declarations changed during confirmation.",
      )
    }
    for (const line of closeout.lines) {
      const source = line.balanceSource
      if (
        !balanceIds.includes(line.balanceSourceId) ||
        source.id !== line.balanceSourceId ||
        source.tenantId !== input.tenantId ||
        source.storeId !== closeout.storeId ||
        source.custodyType !== closeout.custodyType ||
        source.custodyReferenceId !== closeout.custodyReferenceId ||
        line.closeoutId !== closeout.id ||
        source.onHandQuantity.toFixed() !== line.expectedQuantity.toFixed() ||
        subtractExactDecimals(
          line.declaredQuantity.toFixed(),
          line.expectedQuantity.toFixed(),
        ) !== line.varianceQuantity.toFixed()
      )
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "Closeout declarations no longer match their original custody stock.",
        )
      assertRevision(source.revision, line.expectedRevision)
      if (
        compareExactDecimals(
          line.declaredQuantity.toFixed(),
          source.reservedQuantity.toFixed(),
        ) < 0
      ) {
        throw new CatalogError(
          "INSUFFICIENT_STOCK",
          "Closeout cannot remove reserved stock.",
        )
      }
    }
    const effectiveAt = new Date()
    const operation = await tx.stockOperation.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: input.clientOperationId,
        payloadHash,
        reason: input.reason.trim(),
        source: "inventory_closeout",
        storeId: closeout.storeId,
        tenantId: input.tenantId,
        effectiveAt,
        type: StockOperationType.ADJUSTMENT,
      },
    })
    for (const line of closeout.lines) {
      if (compareExactDecimals(line.varianceQuantity.toFixed(), "0") === 0) {
        continue
      }
      const update = await tx.stockBalanceSource.updateMany({
        data: {
          onHandQuantity: line.declaredQuantity,
          revision: { increment: 1 },
        },
        where: {
          id: line.balanceSourceId,
          tenantId: input.tenantId,
          storeId: closeout.storeId,
          revision: line.expectedRevision,
        },
      })
      if (update.count !== 1) {
        throw new CatalogError(
          "REVISION_CONFLICT",
          "A custody balance changed during closeout finalization.",
        )
      }
      const canonicalEffect = multiplyExactDecimals(
        line.varianceQuantity.toFixed(),
        line.balanceSource.inventoryUnit.factor.toFixed(),
      )
      await tx.stockMovement.create({
        data: {
          balanceSourceId: line.balanceSourceId,
          configurationVersionId:
            line.balanceSource.inventoryUnit.configurationVersionId,
          enteredInventoryUnitId: line.balanceSource.inventoryUnitId,
          enteredQuantity: line.varianceQuantity.abs(),
          operationId: operation.id,
          previousOnHandQuantity: line.expectedQuantity,
          resultingOnHandQuantity: line.declaredQuantity,
          signedCanonicalEffect: canonicalEffect,
          transactionScaleSnapshot:
            line.balanceSource.inventoryUnit.transactionScale,
          unitFactorSnapshot: line.balanceSource.inventoryUnit.factor,
        },
      })
    }
    await tx.inventoryCloseout.update({
      data: {
        finalizedAt: operation.effectiveAt,
        finalizedOperationId: operation.id,
        status: InventoryCloseoutStatus.FINALIZED,
      },
      where: { id: closeout.id },
    })
    const financialContext = financialContexts[0]
    if (financialContext) {
      await recordInventoryCloseoutFinanceInTransaction(tx, {
        tenantId: input.tenantId,
        closeoutId: closeout.id,
        expectedBookId: financialContext.bookId,
      })
    }
    return operation
  }, TRANSACTION_OPTIONS)
}

export async function listStockTransfers(
  db: PrismaClient,
  input: { limit?: number; storeId?: string; tenantId: string },
) {
  const transfers = await db.stockTransfer.findMany({
    include: {
      inventoryUnit: true,
      sourceBalanceSource: {
        include: {
          product: { include: { catalogItem: true } },
          variant: true,
        },
      },
      sourceStore: true,
      targetStore: true,
      transitBalanceSource: true,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 100, 1), 200),
    where: {
      OR: input.storeId
        ? [{ sourceStoreId: input.storeId }, { targetStoreId: input.storeId }]
        : undefined,
      tenantId: input.tenantId,
    },
  })
  return transfers.map((transfer) => ({
    createdAt: transfer.createdAt,
    id: transfer.id,
    inventoryUnitName: transfer.inventoryUnit.name,
    productName: transfer.sourceBalanceSource.product.catalogItem.name,
    quantity: transfer.enteredQuantity.toString(),
    sourceStore: {
      id: transfer.sourceStore.id,
      name: transfer.sourceStore.name,
    },
    status: transfer.status,
    targetStore: {
      id: transfer.targetStore.id,
      name: transfer.targetStore.name,
    },
    transitRevision: transfer.transitBalanceSource?.revision ?? null,
    variantName: transfer.sourceBalanceSource.variant.name,
  }))
}
