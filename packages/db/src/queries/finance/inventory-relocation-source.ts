import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import {
  addQuantities,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

const scopeStore = {
  select: { id: true, tenantId: true, currencyCode: true },
} as const
const balanceInclude = {
  store: scopeStore,
  product: {
    select: {
      id: true,
      catalogItemId: true,
      catalogItem: { select: { id: true, tenantId: true } },
    },
  },
  variant: {
    select: {
      id: true,
      catalogItemId: true,
    },
  },
  inventoryUnit: { include: { configurationVersion: true } },
  parentBalanceSource: true,
} satisfies Prisma.StockBalanceSourceInclude

const transferInclude = {
  sourceStore: scopeStore,
  targetStore: scopeStore,
  sourceBalanceSource: { include: balanceInclude },
  transitBalanceSource: { include: balanceInclude },
  inventoryUnit: { include: { configurationVersion: true } },
  configurationVersion: true,
} satisfies Prisma.StockTransferInclude

export const relocationSourceInclude = {
  committedReservation: { select: { id: true } },
  store: scopeStore,
  movements: {
    include: {
      balanceSource: { include: balanceInclude },
      purchaseReceipt: { select: { id: true } },
      valuationEvent: { include: { pool: true } },
    },
  },
  _count: {
    select: {
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      finalizedCloseouts: true,
      corrections: true,
    },
  },
  dispatchedTransfers: { include: transferInclude },
  receivedTransfers: { include: transferInclude },
  cancelledTransfers: { include: transferInclude },
} satisfies Prisma.StockOperationInclude

type RelocationOperation = Prisma.StockOperationGetPayload<{
  include: typeof relocationSourceInclude
}>
type RelocationMovement = RelocationOperation["movements"][number]
type RelocationBalance = RelocationMovement["balanceSource"]

type RelocationEndpoint = {
  movement: RelocationMovement
  balance: RelocationBalance
  before: string
  after: string
  effect: string
}

function signedQuantity(value: string) {
  const text = value.trim()
  const negative = text.startsWith("-")
  const magnitude = normalizeQuantity(negative ? text.slice(1) : text)
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude
}

function magnitude(value: string) {
  return normalizeQuantity(value.startsWith("-") ? value.slice(1) : value)
}

function canonicalQuantity(
  physicalQuantity: string,
  balance: RelocationBalance,
  factor: string,
) {
  return normalizeQuantity(
    balance.kind === "PACKAGED_STOCK"
      ? multiplyExactDecimals(physicalQuantity, factor, 18)
      : physicalQuantity,
  )
}

function validateMovement(
  movement: RelocationMovement,
  operation: RelocationOperation,
  tenantId: string,
): RelocationEndpoint {
  const balance = movement.balanceSource
  // Custody/transfer uses the persisted balance base unit. Matching the
  // movement's unit/configuration IDs to it proves the entered relation too.
  const unit = balance.inventoryUnit
  const factor = normalizeQuantity(movement.unitFactorSnapshot.toFixed())
  const unitFactor = normalizeQuantity(unit.factor.toFixed())
  const parent = balance.parentBalanceSource
  const invalidParent =
    (balance.custodyType !== "STORE" &&
      balance.parentBalanceSourceId === null) ||
    (balance.parentBalanceSourceId === null
      ? parent !== null
      : !parent ||
        parent.id !== balance.parentBalanceSourceId ||
        parent.tenantId !== tenantId ||
        parent.storeId !== balance.storeId ||
        parent.productId !== balance.productId ||
        parent.variantId !== balance.variantId ||
        parent.inventoryUnitId !== balance.inventoryUnitId ||
        parent.kind !== balance.kind ||
        parent.custodyType !== "STORE")
  const quantity = parseExactDecimal(movement.enteredQuantity.toFixed(), {
    allowZero: false,
    maxScale: movement.transactionScaleSnapshot,
  })
  if (
    factor === "0" ||
    unitFactor === "0" ||
    balance.tenantId !== tenantId ||
    balance.store.tenantId !== tenantId ||
    balance.store.id !== balance.storeId ||
    balance.product.id !== balance.productId ||
    balance.product.catalogItem.tenantId !== tenantId ||
    balance.product.catalogItemId !== balance.product.catalogItem.id ||
    balance.variant.id !== balance.variantId ||
    balance.variant.catalogItemId !== balance.product.catalogItemId ||
    balance.inventoryUnitId !== balance.inventoryUnit.id ||
    movement.enteredInventoryUnitId !== balance.inventoryUnitId ||
    balance.inventoryUnit.configurationVersionId !==
      balance.inventoryUnit.configurationVersion.id ||
    balance.inventoryUnit.configurationVersionId !==
      movement.configurationVersionId ||
    balance.inventoryUnit.configurationVersion.productId !==
      balance.productId ||
    balance.productId !== unit.configurationVersion.productId ||
    (balance.kind !== "SHARED_POOL" && balance.kind !== "PACKAGED_STOCK") ||
    movement.operationId !== operation.id ||
    movement.balanceSourceId !== balance.id ||
    movement.reversalOfMovementId !== null ||
    movement.purchaseReceipt !== null ||
    movement.enteredInventoryUnitId !== unit.id ||
    movement.configurationVersionId !== unit.configurationVersionId ||
    unit.configurationVersion.id !== unit.configurationVersionId ||
    movement.transactionScaleSnapshot !== unit.transactionScale ||
    !Number.isSafeInteger(unit.transactionScale) ||
    unit.transactionScale < 0 ||
    unit.transactionScale > 18 ||
    movement.unitFactorSnapshot.toFixed() !== unit.factor.toFixed() ||
    (balance.kind === "PACKAGED_STOCK" &&
      unit.stockBehavior !== "PACKAGED_STOCK") ||
    (balance.kind === "SHARED_POOL" &&
      (unit.stockBehavior !== "CANONICAL_SHARED" || factor !== "1")) ||
    invalidParent
  ) {
    conflict("Inventory relocation movement scope or unit proof changed.")
  }
  const enteredCanonical = normalizeQuantity(
    multiplyExactDecimals(quantity, factor, 18),
  )
  const effect = signedQuantity(movement.signedCanonicalEffect.toFixed())
  const effectMagnitude = magnitude(effect)
  const before = canonicalQuantity(
    movement.previousOnHandQuantity.toFixed(),
    balance,
    factor,
  )
  const after = canonicalQuantity(
    movement.resultingOnHandQuantity.toFixed(),
    balance,
    factor,
  )
  if (
    effectMagnitude === "0" ||
    effectMagnitude !== enteredCanonical ||
    (effect.startsWith("-")
      ? subtractQuantities(before, effectMagnitude) !== after
      : addQuantities(before, effectMagnitude) !== after)
  ) {
    conflict("Inventory relocation movement quantity chain is inconsistent.")
  }
  return { movement, balance, before, after, effect }
}

function validateNoOtherOwners(operation: RelocationOperation) {
  if (
    operation.committedReservation != null ||
    operation._count.purchaseReceipts > 0 ||
    operation._count.productFulfillments > 0 ||
    operation._count.productReturns > 0 ||
    operation._count.finalizedCounts > 0 ||
    operation._count.finalizedCloseouts > 0 ||
    operation.movements.some((movement) => movement.purchaseReceipt !== null)
  ) {
    conflict("Inventory relocation overlaps another owned stock source.")
  }
}

function validateCommonPair(operation: RelocationOperation, tenantId: string) {
  validateNoOtherOwners(operation)
  if (
    operation.movements.length !== 2 ||
    operation.tenantId !== tenantId ||
    operation.store.tenantId !== tenantId ||
    operation.store.id !== operation.storeId ||
    operation.correctionOfOperationId !== null ||
    !operation.actorUserId.trim() ||
    !Number.isFinite(operation.effectiveAt.getTime())
  ) {
    conflict("Inventory relocation operation scope or pair is incomplete.")
  }
  const endpoints = operation.movements.map((movement) =>
    validateMovement(movement, operation, tenantId),
  )
  const source = endpoints.find((endpoint) => endpoint.effect.startsWith("-"))
  const target = endpoints.find((endpoint) => !endpoint.effect.startsWith("-"))
  if (!source || !target || source.balance.id === target.balance.id) {
    conflict(
      "Inventory relocation requires distinct outbound and inbound balances.",
    )
  }
  if (
    source.balance.storeId !== operation.storeId ||
    source.balance.store.currencyCode !== operation.store.currencyCode ||
    target.balance.store.currencyCode !== operation.store.currencyCode ||
    source.balance.tenantId !== target.balance.tenantId ||
    source.balance.store.tenantId !== target.balance.store.tenantId ||
    source.balance.productId !== target.balance.productId ||
    source.balance.variantId !== target.balance.variantId ||
    source.balance.kind !== target.balance.kind ||
    source.balance.inventoryUnitId !== target.balance.inventoryUnitId ||
    source.movement.configurationVersionId !==
      target.movement.configurationVersionId ||
    source.movement.transactionScaleSnapshot !==
      target.movement.transactionScaleSnapshot ||
    source.movement.unitFactorSnapshot.toFixed() !==
      target.movement.unitFactorSnapshot.toFixed() ||
    magnitude(source.effect) !== magnitude(target.effect)
  ) {
    conflict(
      "Inventory relocation endpoints do not share compatible stock meaning.",
    )
  }
  return { source, target }
}

function identifyTransferStage(operation: RelocationOperation) {
  const linked = [
    ...operation.dispatchedTransfers.map((transfer) => ({
      transfer,
      kind: "STOCK_TRANSFER_DISPATCH" as const,
      operationId: transfer.dispatchedOperationId,
    })),
    ...operation.receivedTransfers.map((transfer) => ({
      transfer,
      kind: "STOCK_TRANSFER_RECEIVE" as const,
      operationId: transfer.receivedOperationId,
    })),
    ...operation.cancelledTransfers.map((transfer) => ({
      transfer,
      kind: "STOCK_TRANSFER_CANCEL" as const,
      operationId: transfer.cancelledOperationId,
    })),
  ]
  if (linked.length !== 1 || linked[0]?.operationId !== operation.id) {
    conflict("Stock transfer operation must own exactly one linked stage.")
  }
  const stage = linked[0]
  if (!stage) conflict("Stock transfer stage link is missing.")
  return stage
}

function validateTransferSource(
  operation: RelocationOperation,
  stage: ReturnType<typeof identifyTransferStage>,
  source: RelocationEndpoint,
  target: RelocationEndpoint,
  tenantId: string,
) {
  const transfer = stage.transfer
  const sourceStore = transfer.sourceStore
  const targetStore = transfer.targetStore
  const transit = transfer.transitBalanceSource
  if (
    transfer.tenantId !== tenantId ||
    sourceStore.tenantId !== tenantId ||
    targetStore.tenantId !== tenantId ||
    sourceStore.id !== transfer.sourceStoreId ||
    targetStore.id !== transfer.targetStoreId ||
    sourceStore.currencyCode !== targetStore.currencyCode ||
    sourceStore.id !== operation.storeId ||
    transfer.sourceBalanceSourceId !== transfer.sourceBalanceSource.id ||
    transfer.inventoryUnitId !== transfer.inventoryUnit.id ||
    transfer.configurationVersionId !==
      transfer.inventoryUnit.configurationVersionId ||
    transfer.configurationVersionId !== transfer.configurationVersion.id ||
    transfer.configurationVersion.productId !==
      transfer.inventoryUnit.configurationVersion.productId ||
    transfer.inventoryUnit.configurationVersion.productId !==
      transfer.sourceBalanceSource.productId ||
    transfer.sourceBalanceSource.storeId !== sourceStore.id ||
    transfer.sourceBalanceSource.tenantId !== tenantId ||
    transfer.sourceBalanceSource.variantId !== target.balance.variantId ||
    transfer.sourceBalanceSource.productId !== target.balance.productId ||
    transfer.sourceBalanceSource.store.currencyCode !==
      sourceStore.currencyCode ||
    transfer.sourceBalanceSource.store.tenantId !== tenantId ||
    transfer.inventoryUnitId !== transfer.sourceBalanceSource.inventoryUnitId ||
    transfer.stockBehaviorSnapshot !== transfer.inventoryUnit.stockBehavior ||
    !Number.isFinite(transfer.createdAt.getTime())
  ) {
    conflict("Stock transfer owner scope or unit snapshot changed.")
  }
  if (
    stage.kind === "STOCK_TRANSFER_DISPATCH" &&
    (operation.type !== "TRANSFER" ||
      source.balance.id !== transfer.sourceBalanceSourceId ||
      transfer.sourceBalanceSource.custodyType !== "STORE" ||
      transfer.sourceBalanceSource.custodyReferenceId !== "" ||
      !transit ||
      transfer.transitBalanceSourceId !== transit.id ||
      target.balance.id !== transit.id ||
      transit.storeId !== sourceStore.id ||
      transit.custodyType !== "TRANSIT" ||
      transit.custodyReferenceId !== transfer.id ||
      transit.parentBalanceSourceId !== transfer.sourceBalanceSourceId ||
      transit.parentBalanceSource?.id !== transfer.sourceBalanceSourceId ||
      transfer.createdByUserId !== operation.actorUserId ||
      transfer.dispatchedAt === null ||
      transfer.dispatchedOperationId !== operation.id)
  ) {
    conflict("Stock transfer dispatch does not match its persisted owner.")
  }
  if (
    stage.kind === "STOCK_TRANSFER_RECEIVE" &&
    (operation.type !== "TRANSFER" ||
      !transit ||
      transfer.transitBalanceSourceId !== transit.id ||
      source.balance.id !== transit.id ||
      transit.storeId !== sourceStore.id ||
      transit.custodyType !== "TRANSIT" ||
      transit.custodyReferenceId !== transfer.id ||
      transit.parentBalanceSourceId !== transfer.sourceBalanceSourceId ||
      transit.parentBalanceSource?.id !== transfer.sourceBalanceSourceId ||
      target.balance.storeId !== transfer.targetStoreId ||
      target.balance.custodyType !== "STORE" ||
      target.balance.custodyReferenceId !== "" ||
      transfer.dispatchedAt === null ||
      transfer.receivedAt === null ||
      transfer.receivedAt < transfer.dispatchedAt ||
      transfer.receivedOperationId !== operation.id)
  ) {
    conflict("Stock transfer receipt does not match its persisted owner.")
  }
  if (
    stage.kind === "STOCK_TRANSFER_CANCEL" &&
    (operation.type !== "TRANSFER" ||
      !transit ||
      transfer.transitBalanceSourceId !== transit.id ||
      source.balance.id !== transit.id ||
      transit.storeId !== sourceStore.id ||
      transit.custodyType !== "TRANSIT" ||
      transit.custodyReferenceId !== transfer.id ||
      target.balance.id !== transfer.sourceBalanceSourceId ||
      target.balance.custodyType !== "STORE" ||
      target.balance.custodyReferenceId !== "" ||
      transfer.dispatchedAt === null ||
      transfer.cancelledAt === null ||
      transfer.cancelledAt < transfer.dispatchedAt ||
      transfer.cancelledOperationId !== operation.id)
  ) {
    conflict("Stock transfer cancellation does not match its persisted owner.")
  }

  const inputQuantity = parseExactDecimal(transfer.enteredQuantity.toFixed(), {
    allowZero: false,
    maxScale: transfer.inventoryUnit.transactionScale,
  })
  const factor = normalizeQuantity(transfer.unitFactorSnapshot.toFixed())
  const canonical = normalizeQuantity(
    multiplyExactDecimals(inputQuantity, factor, 18),
  )
  if (
    factor === "0" ||
    factor !== normalizeQuantity(transfer.inventoryUnit.factor.toFixed()) ||
    canonical !== normalizeQuantity(transfer.canonicalQuantity.toFixed()) ||
    source.movement.enteredInventoryUnitId !== transfer.inventoryUnitId ||
    target.movement.enteredInventoryUnitId !== transfer.inventoryUnitId ||
    source.movement.configurationVersionId !==
      transfer.configurationVersionId ||
    target.movement.configurationVersionId !==
      transfer.configurationVersionId ||
    source.movement.enteredQuantity.toFixed() !==
      transfer.enteredQuantity.toFixed() ||
    target.movement.enteredQuantity.toFixed() !==
      transfer.enteredQuantity.toFixed() ||
    source.effect !== `-${canonical}` ||
    target.effect !== canonical
  ) {
    conflict(
      "Stock transfer movement facts differ from its immutable snapshot.",
    )
  }

  const operationStageDate =
    stage.kind === "STOCK_TRANSFER_DISPATCH"
      ? transfer.dispatchedAt
      : stage.kind === "STOCK_TRANSFER_RECEIVE"
        ? transfer.receivedAt
        : transfer.cancelledAt
  if (
    operationStageDate === null ||
    !Number.isFinite(operationStageDate.getTime()) ||
    operationStageDate.getTime() !== operation.effectiveAt.getTime()
  ) {
    conflict("Stock transfer source date does not match its linked operation.")
  }
  const freshStageValid =
    stage.kind === "STOCK_TRANSFER_DISPATCH"
      ? transfer.status === "IN_TRANSIT"
      : stage.kind === "STOCK_TRANSFER_RECEIVE"
        ? transfer.status === "RECEIVED"
        : transfer.status === "CANCELLED"
  return { freshStageValid, sourceKind: stage.kind, sourceId: transfer.id }
}

function validateCustodySource(
  operation: RelocationOperation,
  source: RelocationEndpoint,
  target: RelocationEndpoint,
) {
  if (
    (operation.type !== "CUSTODY_ASSIGNMENT" &&
      operation.type !== "CUSTODY_RETURN") ||
    operation.dispatchedTransfers.length > 0 ||
    operation.receivedTransfers.length > 0 ||
    operation.cancelledTransfers.length > 0 ||
    source.balance.storeId !== target.balance.storeId ||
    source.balance.storeId !== operation.storeId
  ) {
    conflict("Custody operation is outside its persisted Store scope.")
  }
  const expectedParentId =
    source.balance.custodyType === "STORE"
      ? source.balance.id
      : source.balance.parentBalanceSourceId
  const returningToStore = target.balance.custodyType === "STORE"
  const sourceReferenceValid =
    source.balance.custodyType === "STORE"
      ? source.balance.custodyReferenceId === ""
      : source.balance.custodyReferenceId.trim().length > 0
  const targetReferenceValid = returningToStore
    ? target.balance.custodyReferenceId === ""
    : target.balance.custodyReferenceId.trim().length > 0
  if (
    !sourceReferenceValid ||
    !targetReferenceValid ||
    (operation.type === "CUSTODY_ASSIGNMENT" &&
      target.balance.custodyType !== "STAFF" &&
      target.balance.custodyType !== "SESSION") ||
    (returningToStore && source.balance.custodyType === "STORE") ||
    (operation.type === "CUSTODY_RETURN" &&
      (!returningToStore ||
        source.balance.custodyType === "STORE" ||
        source.balance.parentBalanceSourceId !== target.balance.id)) ||
    (operation.type === "CUSTODY_ASSIGNMENT" &&
      (returningToStore
        ? source.balance.custodyType !== "STORE"
        : target.balance.parentBalanceSourceId !== expectedParentId))
  ) {
    conflict(
      "Custody movement does not match its persisted parent/reference graph.",
    )
  }
  return {
    freshStageValid: true,
    sourceKind: "INVENTORY_CUSTODY_MOVE" as const,
    sourceId: operation.id,
  }
}

/** Private, persisted ownership proof for a custody or StockTransfer movement pair. */
export async function resolveInventoryRelocationSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; stockOperationId: string },
) {
  const operation = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: relocationSourceInclude,
  })
  if (!operation)
    throw new FinanceError("NOT_FOUND", "Stock operation not found.")
  const { operationCurrency } = prepareRelocation(operation, input.tenantId)
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: operationCurrency,
      },
    },
  })
  return resolveLoadedInventoryRelocationSource(operation, input.tenantId, book)
}

type RelocationBook = Pick<
  Prisma.FinanceBookGetPayload<Prisma.FinanceBookDefaultArgs>,
  "id" | "tenantId" | "currencyCode" | "startsAt" | "closedThrough"
>

function prepareRelocation(operation: RelocationOperation, tenantId: string) {
  if (
    operation.store.tenantId !== tenantId ||
    operation.tenantId !== tenantId
  ) {
    conflict("Inventory relocation operation belongs to another Tenant.")
  }

  let stage: ReturnType<typeof identifyTransferStage> | null = null
  if (operation.type === "TRANSFER") {
    stage = identifyTransferStage(operation)
  } else if (
    operation.type !== "CUSTODY_ASSIGNMENT" &&
    operation.type !== "CUSTODY_RETURN"
  ) {
    conflict("Stock operation is not an owned custody or transfer source.")
  }

  const stageTransfer = stage?.transfer
  const operationCurrency = operation.store.currencyCode
  const targetCurrency = stageTransfer?.targetStore.currencyCode
  if (targetCurrency !== undefined && targetCurrency !== operationCurrency) {
    conflict(
      "Cross-currency StockTransfer is outside relocation valuation scope.",
    )
  }
  return { stage, operationCurrency }
}

/** Pure proof over repository-loaded original graphs; no query or lock acquisition. */
export function resolveLoadedInventoryRelocationSource(
  operation: RelocationOperation,
  tenantId: string,
  book: RelocationBook | null,
) {
  const { stage, operationCurrency } = prepareRelocation(operation, tenantId)
  if (!book) return null
  if (book.tenantId !== tenantId || book.currencyCode !== operationCurrency) {
    conflict("Inventory relocation Book scope changed.")
  }

  const { source, target } = validateCommonPair(operation, tenantId)
  const resolved = stage
    ? validateTransferSource(operation, stage, source, target, tenantId)
    : validateCustodySource(operation, source, target)
  return {
    book,
    operation,
    sourceKind: resolved.sourceKind,
    sourceId: resolved.sourceId,
    source,
    target,
    freshStageValid: resolved.freshStageValid,
    correctionCount: operation._count.corrections,
  }
}
