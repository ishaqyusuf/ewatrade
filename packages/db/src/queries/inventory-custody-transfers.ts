import { createHash } from "node:crypto"

import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  InventoryCloseoutStatus,
  StockCustodyType,
  StockOperationType,
  StockTransferStatus,
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

function custodyType(value: "session" | "staff" | "store" | "transit") {
  if (value === "staff") return StockCustodyType.STAFF
  if (value === "session") return StockCustodyType.SESSION
  if (value === "transit") return StockCustodyType.TRANSIT
  return StockCustodyType.STORE
}

const balanceInclude = {
  inventoryUnit: { include: { configurationVersion: true } },
} satisfies Prisma.StockBalanceSourceInclude

async function tenantStore(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
) {
  const store = await tx.store.findFirst({
    where: { id: storeId, tenantId },
    select: { id: true },
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
  input: { balanceSourceId: string; tenantId: string },
) {
  const row = await tx.stockBalanceSource.findFirst({
    include: balanceInclude,
    where: { id: input.balanceSourceId, tenantId: input.tenantId },
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
    input.sourceBalance.onHandQuantity.toString(),
    quantity,
  )
  if (
    compareExactDecimals(
      sourceResult,
      input.sourceBalance.reservedQuantity.toString(),
    ) < 0
  ) {
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The source Balance Source has insufficient available stock.",
    )
  }
  const targetResult = addExactDecimals(
    input.targetBalance.onHandQuantity.toString(),
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
    input.sourceBalance.inventoryUnit.factor.toString(),
  )
  const operation = await tx.stockOperation.create({
    data: {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
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

    const sourceBalance = await balance(tx, {
      balanceSourceId: input.sourceBalanceSourceId,
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
    return postCustodyMovement(tx, {
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
  })
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

    const sourceBalance = await balance(tx, {
      balanceSourceId: input.sourceBalanceSourceId,
      tenantId: input.tenantId,
    })
    if (sourceBalance.custodyType !== StockCustodyType.STORE) {
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Store transfer dispatch must start from central Store custody.",
      )
    }
    assertRevision(sourceBalance.revision, input.expectedSourceRevision)
    await tenantStore(tx, input.tenantId, input.targetStoreId)
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
      sourceBalance.inventoryUnit.factor.toString(),
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
    return tx.stockTransfer.update({
      data: {
        dispatchedAt: new Date(),
        dispatchedOperationId: operation.id,
        status: StockTransferStatus.IN_TRANSIT,
        transitBalanceSourceId: transit.id,
      },
      where: { id: transfer.id },
    })
  })
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

    const transfer = await tx.stockTransfer.findFirst({
      include: {
        sourceBalanceSource: { include: balanceInclude },
        transitBalanceSource: { include: balanceInclude },
      },
      where: {
        id: input.transferId,
        status: StockTransferStatus.IN_TRANSIT,
        tenantId: input.tenantId,
      },
    })
    if (!transfer?.transitBalanceSource) {
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
    const operation = await postCustodyMovement(tx, {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      quantity: transfer.enteredQuantity.toString(),
      reason: input.reason,
      source: input.source,
      sourceBalance: transfer.transitBalanceSource,
      targetBalance,
      tenantId: input.tenantId,
      type: "transfer",
    })
    const now = new Date()
    return tx.stockTransfer.update({
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
  })
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
          "This closeout finalization identity was already used with different input.",
        )
      }
      return previous
    }

    const closeout = await tx.inventoryCloseout.findFirst({
      include: {
        lines: { include: { balanceSource: { include: balanceInclude } } },
      },
      where: {
        id: input.closeoutId,
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
    const operation = await tx.stockOperation.create({
      data: {
        actorUserId: input.actorUserId,
        clientOperationId: input.clientOperationId,
        payloadHash,
        reason: input.reason.trim(),
        source: "inventory_closeout",
        storeId: closeout.storeId,
        tenantId: input.tenantId,
        type: StockOperationType.ADJUSTMENT,
      },
    })
    for (const line of closeout.lines) {
      assertRevision(line.balanceSource.revision, line.expectedRevision)
      if (compareExactDecimals(line.varianceQuantity.toString(), "0") === 0) {
        continue
      }
      const update = await tx.stockBalanceSource.updateMany({
        data: {
          onHandQuantity: line.declaredQuantity,
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
          "A custody balance changed during closeout finalization.",
        )
      }
      const canonicalEffect = multiplyExactDecimals(
        line.varianceQuantity.toString(),
        line.balanceSource.inventoryUnit.factor.toString(),
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
        finalizedAt: new Date(),
        finalizedOperationId: operation.id,
        status: InventoryCloseoutStatus.FINALIZED,
      },
      where: { id: closeout.id },
    })
    return operation
  })
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
    sourceStore: { id: transfer.sourceStore.id, name: transfer.sourceStore.name },
    status: transfer.status,
    targetStore: { id: transfer.targetStore.id, name: transfer.targetStore.name },
    transitRevision: transfer.transitBalanceSource?.revision ?? null,
    variantName: transfer.sourceBalanceSource.variant.name,
  }))
}
