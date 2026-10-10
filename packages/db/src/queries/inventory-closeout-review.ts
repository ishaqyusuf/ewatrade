import {
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { lockInventoryFinancialStore } from "./inventory-finance-locks"

/** Reading preserves original declarations; it never rebases them onto current stock. */
export async function getInventoryCloseoutReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; closeoutId: string },
) {
  const closeout = await db.inventoryCloseout.findFirst({
    where: {
      id: input.closeoutId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    include: {
      lines: {
        orderBy: { id: "asc" },
        take: 501,
        include: {
          balanceSource: {
            include: {
              inventoryUnit: { include: { configurationVersion: true } },
              product: { include: { catalogItem: true } },
              variant: true,
            },
          },
        },
      },
    },
  })
  if (!closeout)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Inventory Closeout not found for this business and Store.",
    )
  if (
    closeout.tenantId !== input.tenantId ||
    closeout.storeId !== input.storeId ||
    !["STAFF", "SESSION"].includes(closeout.custodyType) ||
    !closeout.custodyReferenceId.trim() ||
    closeout.lines.length > 500 ||
    new Set(closeout.lines.map((line) => line.balanceSourceId)).size !==
      closeout.lines.length
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Closeout declaration scope is invalid.",
    )
  const lines = closeout.lines.map((line) => {
    const source = line.balanceSource
    if (
      line.closeoutId !== closeout.id ||
      source.id !== line.balanceSourceId ||
      source.tenantId !== input.tenantId ||
      source.storeId !== input.storeId ||
      source.custodyType !== closeout.custodyType ||
      source.custodyReferenceId !== closeout.custodyReferenceId ||
      source.product.id !== source.productId ||
      source.product.catalogItem.tenantId !== input.tenantId ||
      source.variant.id !== source.variantId ||
      source.variant.catalogItemId !== source.product.catalogItemId ||
      source.inventoryUnit.id !== source.inventoryUnitId ||
      source.inventoryUnit.configurationVersion.productId !==
        source.productId ||
      subtractExactDecimals(
        line.declaredQuantity.toFixed(),
        line.expectedQuantity.toFixed(),
      ) !== line.varianceQuantity.toFixed()
    )
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Closeout declarations no longer match their original custody stock.",
      )
    const stockCurrent =
      source.revision === line.expectedRevision &&
      source.onHandQuantity.toFixed() === line.expectedQuantity.toFixed()
    const preservesReservations =
      compareExactDecimals(
        line.declaredQuantity.toFixed(),
        source.reservedQuantity.toFixed(),
      ) >= 0
    return {
      id: line.id,
      balanceSourceId: source.id,
      catalogItemId: source.product.catalogItemId,
      productName: source.product.catalogItem.name,
      variantName: source.variant.name,
      unitName: source.inventoryUnit.name,
      inventoryUnitId: source.inventoryUnitId,
      configurationVersionId: source.inventoryUnit.configurationVersionId,
      unitFactor: source.inventoryUnit.factor.toFixed(),
      transactionScale: source.inventoryUnit.transactionScale,
      expectedRevision: line.expectedRevision,
      currentRevision: source.revision,
      expectedQuantity: line.expectedQuantity.toFixed(),
      declaredQuantity: line.declaredQuantity.toFixed(),
      varianceQuantity: line.varianceQuantity.toFixed(),
      currentQuantity: source.onHandQuantity.toFixed(),
      reservedQuantity: source.reservedQuantity.toFixed(),
      stockCurrent,
      preservesReservations,
    }
  })
  return {
    id: closeout.id,
    storeId: closeout.storeId,
    custodyType: closeout.custodyType,
    custodyReferenceId: closeout.custodyReferenceId,
    status: closeout.status,
    reason: closeout.reason,
    createdAt: closeout.createdAt.toISOString(),
    finalizedAt: closeout.finalizedAt?.toISOString() ?? null,
    finalizedOperationId: closeout.finalizedOperationId,
    lines,
    canFinalize:
      closeout.status === "DRAFT" &&
      lines.length > 0 &&
      lines.every((line) => line.stockCurrent && line.preservesReservations),
  }
}

/** Bounded recent history; this is not an all-business count. */
export async function listInventoryCloseouts(
  db: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    status?: "DRAFT" | "FINALIZED" | "CANCELLED"
    limit?: number
  },
) {
  const rows = await db.inventoryCloseout.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: input.status,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(input.limit ?? 25, 1), 50),
    select: {
      id: true,
      status: true,
      custodyType: true,
      custodyReferenceId: true,
      reason: true,
      createdAt: true,
      finalizedAt: true,
      _count: { select: { lines: true } },
    },
  })
  return rows.map(({ _count, createdAt, finalizedAt, ...row }) => ({
    ...row,
    createdAt: createdAt.toISOString(),
    finalizedAt: finalizedAt?.toISOString() ?? null,
    lineCount: _count.lines,
  }))
}

export async function previewInventoryCloseoutCreation(
  db: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    custodyType: "staff" | "session"
    custodyReferenceId: string
    declarations: Array<{ balanceSourceId: string; declaredQuantity: string }>
  },
) {
  const ids = input.declarations.map((line) => line.balanceSourceId)
  if (
    !ids.length ||
    ids.length > 500 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !id.trim()) ||
    !input.custodyReferenceId.trim()
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Select distinct custody balances for this closeout.",
    )
  const custodyType = input.custodyType === "staff" ? "STAFF" : "SESSION"
  const sources = await db.stockBalanceSource.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      id: { in: ids },
      custodyType,
      custodyReferenceId: input.custodyReferenceId,
    },
    include: {
      inventoryUnit: { include: { configurationVersion: true } },
      product: { include: { catalogItem: true } },
      variant: true,
    },
    take: ids.length + 1,
  })
  if (
    sources.length !== ids.length ||
    new Set(sources.map((source) => source.id)).size !== ids.length
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Closeout sources are unavailable in this custody and Store.",
    )
  const byId = new Map(sources.map((source) => [source.id, source]))
  return input.declarations.map((declaration) => {
    const source = byId.get(declaration.balanceSourceId)
    if (
      !source ||
      source.tenantId !== input.tenantId ||
      source.storeId !== input.storeId ||
      source.custodyType !== custodyType ||
      source.custodyReferenceId !== input.custodyReferenceId ||
      source.product.id !== source.productId ||
      source.product.catalogItem.tenantId !== input.tenantId ||
      source.variant.id !== source.variantId ||
      source.variant.catalogItemId !== source.product.catalogItemId ||
      source.inventoryUnit.id !== source.inventoryUnitId ||
      source.inventoryUnit.configurationVersion.productId !== source.productId
    )
      throw new CatalogError(
        "INVALID_STOCK_OPERATION",
        "Closeout sources changed custody or unit meaning.",
      )
    const declaredQuantity = parseExactDecimal(declaration.declaredQuantity, {
      maxScale: source.inventoryUnit.transactionScale,
    })
    return {
      balanceSourceId: source.id,
      productName: source.product.catalogItem.name,
      variantName: source.variant.name,
      unitName: source.inventoryUnit.name,
      inventoryUnitId: source.inventoryUnitId,
      configurationVersionId: source.inventoryUnit.configurationVersionId,
      unitFactor: source.inventoryUnit.factor.toFixed(),
      transactionScale: source.inventoryUnit.transactionScale,
      expectedRevision: source.revision,
      expectedQuantity: source.onHandQuantity.toFixed(),
      declaredQuantity,
      varianceQuantity: subtractExactDecimals(
        declaredQuantity,
        source.onHandQuantity.toFixed(),
      ),
      reservedQuantity: source.reservedQuantity.toFixed(),
      preservesReservations:
        compareExactDecimals(
          declaredQuantity,
          source.reservedQuantity.toFixed(),
        ) >= 0,
    }
  })
}

/** Finalization review shares canonical Book → closeout → balance lock order. */
export async function lockInventoryCloseoutReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; closeoutId: string },
) {
  await lockInventoryFinancialStore(db, input)
  const closeouts = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "InventoryCloseout"
    WHERE "id" = ${input.closeoutId} AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId} FOR UPDATE
  `
  if (closeouts.length !== 1 || closeouts[0]?.id !== input.closeoutId)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Closeout changed before review.",
    )
  const lines = await db.inventoryCloseoutLine.findMany({
    where: { closeoutId: input.closeoutId },
    select: { balanceSourceId: true },
    take: 501,
  })
  const ids = [...new Set(lines.map((line) => line.balanceSourceId))].sort()
  if (!ids.length || ids.length > 500 || ids.length !== lines.length)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Closeout declaration scope is invalid.",
    )
  const balances = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StockBalanceSource"
    WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${input.tenantId}
      AND "storeId" = ${input.storeId} ORDER BY "id" FOR UPDATE
  `
  if (
    balances.length !== ids.length ||
    new Set(balances.map((row) => row.id)).size !== ids.length ||
    balances.some((row) => !ids.includes(row.id))
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Closeout balances changed scope.",
    )
}
