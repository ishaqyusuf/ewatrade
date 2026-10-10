import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { planStockTransferTransition } from "./inventory-transfer-quantity"

export async function getStockTransferReview(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    transferId: string
    allowedStoreIds: string[]
  },
) {
  const transfer = await tx.stockTransfer.findFirst({
    where: {
      id: input.transferId,
      tenantId: input.tenantId,
      sourceStoreId: { in: input.allowedStoreIds },
      targetStoreId: { in: input.allowedStoreIds },
      OR: [{ sourceStoreId: input.storeId }, { targetStoreId: input.storeId }],
    },
    include: {
      sourceStore: {
        select: { id: true, tenantId: true, name: true, currencyCode: true },
      },
      targetStore: {
        select: { id: true, tenantId: true, name: true, currencyCode: true },
      },
      sourceBalanceSource: true,
      transitBalanceSource: true,
      inventoryUnit: true,
      acknowledgments: {
        orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
        take: 101,
      },
    },
  })
  if (!transfer)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer not found for these Stores.",
    )
  const source = transfer.sourceBalanceSource,
    transit = transfer.transitBalanceSource
  if (
    transfer.tenantId !== input.tenantId ||
    !input.allowedStoreIds.includes(transfer.sourceStoreId) ||
    !input.allowedStoreIds.includes(transfer.targetStoreId) ||
    ![transfer.sourceStoreId, transfer.targetStoreId].includes(input.storeId) ||
    transfer.sourceStore.tenantId !== input.tenantId ||
    transfer.targetStore.tenantId !== input.tenantId ||
    transfer.sourceStore.id !== transfer.sourceStoreId ||
    transfer.targetStore.id !== transfer.targetStoreId ||
    source.tenantId !== input.tenantId ||
    source.storeId !== transfer.sourceStoreId ||
    source.custodyType !== "STORE" ||
    source.id !== transfer.sourceBalanceSourceId ||
    source.inventoryUnitId !== transfer.inventoryUnitId ||
    transfer.inventoryUnit.id !== transfer.inventoryUnitId ||
    transfer.inventoryUnit.stockBehavior !== transfer.stockBehaviorSnapshot ||
    transfer.canonicalQuantity.toFixed() !==
      multiplyExactDecimals(
        transfer.enteredQuantity.toFixed(),
        transfer.unitFactorSnapshot.toFixed(),
        18,
      ) ||
    transfer.inventoryUnit.configurationVersionId !==
      transfer.configurationVersionId ||
    transfer.inventoryUnit.factor.toFixed() !==
      transfer.unitFactorSnapshot.toFixed() ||
    (transit &&
      (transit.tenantId !== input.tenantId ||
        transit.storeId !== transfer.sourceStoreId ||
        transit.id !== transfer.transitBalanceSourceId ||
        transit.custodyType !== "TRANSIT" ||
        transit.custodyReferenceId !== transfer.id ||
        transit.parentBalanceSourceId !== source.id ||
        transit.inventoryUnitId !== source.inventoryUnitId ||
        transit.productId !== source.productId ||
        transit.variantId !== source.variantId ||
        transit.kind !== source.kind))
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer scope or stock meaning changed.",
    )
  if (
    transfer.acknowledgments.some(
      (row) =>
        row.tenantId !== input.tenantId || row.transferId !== transfer.id,
    )
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer acknowledgment scope changed.",
    )
  const product = await tx.catalogProduct.findFirst({
    where: { id: source.productId, catalogItem: { tenantId: input.tenantId } },
    select: { catalogItemId: true, catalogItem: { select: { name: true } } },
  })
  const variant = await tx.sellableVariant.findFirst({
    where: {
      id: source.variantId,
      catalogItemId: product?.catalogItemId ?? "",
    },
    select: { name: true },
  })
  if (!product || !variant)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer Product or variant is unavailable.",
    )
  const destination = await tx.stockBalanceSource.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: transfer.targetStoreId,
      productId: source.productId,
      variantId: source.variantId,
      inventoryUnitId: source.inventoryUnitId,
      kind: source.kind,
      custodyType: "STORE",
      custodyReferenceId: "",
    },
  })
  const balance = (row: typeof source | null) =>
    row
      ? {
          id: row.id,
          revision: row.revision,
          quantity: row.onHandQuantity.toFixed(),
          reserved: row.reservedQuantity.toFixed(),
        }
      : null
  return {
    id: transfer.id,
    createdAt: transfer.createdAt,
    status: transfer.status,
    catalogItemId: product.catalogItemId,
    productName: product.catalogItem.name,
    variantName: variant.name,
    sourceStore: transfer.sourceStore,
    targetStore: transfer.targetStore,
    inventoryUnitId: transfer.inventoryUnitId,
    unitName: transfer.inventoryUnit.name,
    factor: transfer.unitFactorSnapshot.toFixed(),
    transactionScale: transfer.inventoryUnit.transactionScale,
    configurationVersionId: transfer.configurationVersionId,
    dispatchedQuantity: transfer.enteredQuantity.toFixed(),
    source: balance(source)!,
    transit: balance(transit),
    destination: balance(destination),
    acknowledgmentHistoryLimited: transfer.acknowledgments.length > 100,
    acknowledgments: transfer.acknowledgments.slice(0, 100).map((row) => ({
      id: row.id,
      operationId: row.operationId,
      kind: row.kind,
      actorUserId: row.acknowledgedByUserId,
      quantity: row.quantity.toFixed(),
      remainingBefore: row.remainingBefore.toFixed(),
      remainingAfter: row.remainingAfter.toFixed(),
      reason: row.reason,
      effectiveAt: row.effectiveAt.toISOString(),
    })),
  }
}

export async function previewStockTransferTransition(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof getStockTransferReview>[1] & {
    quantity?: string
    transition: "receive" | "cancel"
  },
) {
  const review = await getStockTransferReview(tx, input)
  if (review.status !== "IN_TRANSIT" || !review.transit)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Only an in-transit transfer can be received or cancelled.",
    )
  const plan = planStockTransferTransition({
    dispatchedQuantity: review.dispatchedQuantity,
    inTransitQuantity: review.transit.quantity,
    quantity: input.quantity,
    transactionScale: review.transactionScale,
    transition: input.transition,
  })
  if (compareExactDecimals(plan.remainingAfter, review.transit.reserved) < 0)
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The transfer would consume reserved transit stock.",
    )
  const target =
    input.transition === "receive" ? review.destination : review.source
  return {
    ...review,
    plan,
    canonicalQuantity: multiplyExactDecimals(plan.quantity, review.factor, 18),
    targetBefore: target?.quantity ?? "0",
    targetAfter: addExactDecimals(target?.quantity ?? "0", plan.quantity),
    targetReserved: target?.reserved ?? "0",
  }
}

/** Dispatch moves stock into transit; it does not acknowledge arrival at the target. */
export async function previewStockTransferDispatch(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    allowedStoreIds: string[]
    sourceBalanceSourceId: string
    targetStoreId: string
    quantity: string
  },
) {
  if (
    input.storeId === input.targetStoreId ||
    !input.allowedStoreIds.includes(input.storeId) ||
    !input.allowedStoreIds.includes(input.targetStoreId)
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer requires two accessible Stores.",
    )
  const source = await tx.stockBalanceSource.findFirst({
    where: {
      id: input.sourceBalanceSourceId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      custodyType: "STORE",
      custodyReferenceId: "",
    },
    include: {
      inventoryUnit: true,
      store: {
        select: { id: true, tenantId: true, name: true, currencyCode: true },
      },
      product: {
        select: {
          catalogItemId: true,
          catalogItem: { select: { name: true, tenantId: true } },
        },
      },
      variant: { select: { name: true, catalogItemId: true } },
    },
  })
  const targetStore = await tx.store.findFirst({
    where: { id: input.targetStoreId, tenantId: input.tenantId },
    select: { id: true, tenantId: true, name: true, currencyCode: true },
  })
  if (
    !source ||
    !targetStore ||
    source.tenantId !== input.tenantId ||
    source.storeId !== input.storeId ||
    source.store.id !== input.storeId ||
    source.store.tenantId !== input.tenantId ||
    targetStore.id !== input.targetStoreId ||
    targetStore.tenantId !== input.tenantId ||
    source.custodyType !== "STORE" ||
    source.inventoryUnitId !== source.inventoryUnit.id ||
    source.product.catalogItem.tenantId !== input.tenantId ||
    source.variant.catalogItemId !== source.product.catalogItemId
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer source or destination is unavailable.",
    )
  const quantity = parseExactDecimal(input.quantity, {
    allowZero: false,
    maxScale: source.inventoryUnit.transactionScale,
  })
  const before = source.onHandQuantity.toFixed(),
    reserved = source.reservedQuantity.toFixed()
  const after = subtractExactDecimals(before, quantity)
  if (compareExactDecimals(after, reserved) < 0)
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "Dispatch would consume reserved or unavailable stock.",
    )
  return {
    sourceBalanceSourceId: source.id,
    revision: source.revision,
    sourceStore: source.store,
    targetStore,
    catalogItemId: source.product.catalogItemId,
    productName: source.product.catalogItem.name,
    variantName: source.variant.name,
    inventoryUnitId: source.inventoryUnitId,
    configurationVersionId: source.inventoryUnit.configurationVersionId,
    unitName: source.inventoryUnit.name,
    factor: source.inventoryUnit.factor.toFixed(),
    quantity,
    canonicalQuantity: multiplyExactDecimals(
      quantity,
      source.inventoryUnit.factor.toFixed(),
      18,
    ),
    before,
    after,
    reserved,
    availableAfter: subtractExactDecimals(after, reserved),
    inTransitAfter: quantity,
  }
}

/** Read only identities needed to acquire confirmation locks, before full review. */
export async function getStockTransferLockScope(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof getStockTransferReview>[1],
) {
  const row = await tx.stockTransfer.findFirst({
    where: {
      id: input.transferId,
      tenantId: input.tenantId,
      sourceStoreId: { in: input.allowedStoreIds },
      targetStoreId: { in: input.allowedStoreIds },
      OR: [{ sourceStoreId: input.storeId }, { targetStoreId: input.storeId }],
    },
    select: {
      id: true,
      tenantId: true,
      sourceStoreId: true,
      targetStoreId: true,
      sourceBalanceSourceId: true,
      transitBalanceSourceId: true,
      sourceBalanceSource: {
        select: {
          productId: true,
          variantId: true,
          inventoryUnitId: true,
          kind: true,
        },
      },
    },
  })
  if (
    !row ||
    row.id !== input.transferId ||
    row.tenantId !== input.tenantId ||
    !input.allowedStoreIds.includes(row.sourceStoreId) ||
    !input.allowedStoreIds.includes(row.targetStoreId) ||
    ![row.sourceStoreId, row.targetStoreId].includes(input.storeId) ||
    !row.transitBalanceSourceId
  )
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "Transfer not found for these Stores.",
    )
  const destination = await tx.stockBalanceSource.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: row.targetStoreId,
      productId: row.sourceBalanceSource.productId,
      variantId: row.sourceBalanceSource.variantId,
      inventoryUnitId: row.sourceBalanceSource.inventoryUnitId,
      kind: row.sourceBalanceSource.kind,
      custodyType: "STORE",
      custodyReferenceId: "",
    },
    select: { id: true },
  })
  return {
    tenantId: input.tenantId,
    transferId: row.id,
    sourceStoreId: row.sourceStoreId,
    targetStoreId: row.targetStoreId,
    balanceSourceIds: [
      row.sourceBalanceSourceId,
      row.transitBalanceSourceId,
      ...(destination ? [destination.id] : []),
    ],
  }
}
