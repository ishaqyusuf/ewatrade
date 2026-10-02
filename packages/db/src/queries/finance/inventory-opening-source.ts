import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { normalizeQuantity } from "./valuation-math"

const scopeStore = {
  select: { id: true, tenantId: true, currencyCode: true },
} as const
const unitGraph = {
  include: { configurationVersion: { select: { id: true, productId: true } } },
} as const
const receiptGraph = {
  store: scopeStore,
  catalogItem: {
    select: {
      id: true,
      tenantId: true,
      kind: true,
      product: { select: { id: true, catalogItemId: true } },
    },
  },
} satisfies Prisma.CatalogCommandReceiptInclude
const operationGraph = {
  store: scopeStore,
  committedReservation: { select: { id: true } },
  movements: {
    take: 2,
    include: {
      enteredInventoryUnit: unitGraph,
      valuationEvent: { include: { pool: true } },
      purchaseReceipt: { select: { id: true } },
      balanceSource: {
        include: {
          store: scopeStore,
          inventoryUnit: unitGraph,
          product: { select: { id: true, catalogItemId: true } },
          variant: { select: { id: true, catalogItemId: true } },
        },
      },
    },
  },
  _count: {
    select: {
      corrections: true,
      movements: true,
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      finalizedCloseouts: true,
      dispatchedTransfers: true,
      receivedTransfers: true,
      cancelledTransfers: true,
    },
  },
} satisfies Prisma.StockOperationInclude

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

/** Immutable private opening proof; callers retain the source's permission/locks. */
export async function resolveInventoryOpeningSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; receiptId: string; expectedBookId?: string },
) {
  const receipt = await tx.catalogCommandReceipt.findFirst({
    where: { id: input.receiptId, tenantId: input.tenantId },
    include: receiptGraph,
  })
  if (!receipt)
    throw new FinanceError("NOT_FOUND", "Catalog opening receipt not found.")
  const graduation = receipt.commandType === "GRADUATE_CATALOG_OFFERING"
  if (
    (!graduation && receipt.commandType !== "CREATE_CATALOG_ITEM") ||
    receipt.tenantId !== input.tenantId ||
    !receipt.clientOperationId.trim() ||
    !/^[a-f0-9]{64}$/.test(receipt.payloadHash) ||
    !Number.isFinite(receipt.createdAt.getTime()) ||
    receipt.storeId !== receipt.store.id ||
    receipt.store.tenantId !== input.tenantId ||
    receipt.catalogItemId !== receipt.catalogItem.id ||
    receipt.catalogItem.tenantId !== input.tenantId
  )
    conflict("Opening receipt command or scoped ownership is invalid.")
  const prefix = `${receipt.clientOperationId}:opening-stock`
  const operations = await tx.stockOperation.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [
        { clientOperationId: prefix },
        { clientOperationId: { startsWith: `${prefix}:` } },
      ],
    },
    include: operationGraph,
    orderBy: { id: "asc" },
    take: 129,
  })
  if (operations.length > 128)
    conflict("Opening source exceeds its bounded variant scope.")
  const item = receipt.catalogItem
  if (
    (item.kind === "PRODUCT" &&
      (!item.product || item.product.catalogItemId !== item.id)) ||
    (item.kind === "SERVICE" && item.product !== null)
  )
    conflict("Opening receipt has inconsistent Catalog Product ownership.")
  if ((item.kind !== "PRODUCT" || !item.product) && operations.length)
    conflict("A non-Product receipt cannot own opening stock.")
  if (graduation && operations.length > 1)
    conflict("Graduation owns at most one opening operation.")
  const seen = new Set<string>()
  const sources = operations.map((operation) => {
    const {
      corrections,
      movements: movementCount,
      ...owners
    } = operation._count
    const movement = operation.movements[0]
    if (
      operation.tenantId !== input.tenantId ||
      operation.storeId !== receipt.storeId ||
      operation.store.id !== receipt.storeId ||
      operation.store.tenantId !== input.tenantId ||
      operation.store.currencyCode !== receipt.store.currencyCode ||
      operation.type !== "OPENING_STOCK" ||
      operation.source !==
        (graduation
          ? "service_commerce_catalog_graduation"
          : "catalog_setup") ||
      operation.payloadHash !== receipt.payloadHash ||
      !operation.actorUserId.trim() ||
      operation.correctionOfOperationId !== null ||
      operation.linkedOperationId !== null ||
      operation.committedReservation !== null ||
      Object.values(owners).some((count) => count !== 0) ||
      !Number.isFinite(operation.effectiveAt.getTime()) ||
      (graduation
        ? operation.clientOperationId !== prefix
        : !operation.clientOperationId.startsWith(`${prefix}:`) ||
          operation.clientOperationId.length <= prefix.length + 1) ||
      movementCount !== 1 ||
      operation.movements.length !== 1 ||
      !movement
    )
      conflict("Opening operation differs from its owning receipt.")
    // Receipt persistence follows the physical writes. Its creation timestamp
    // does not order the command's post-lock owning date across database clocks.
    // Fresh Book date gates and saved event proof use operation.effectiveAt.
    const balance = movement.balanceSource
    const unit = balance.inventoryUnit
    const entered = movement.enteredInventoryUnit
    if (
      seen.has(balance.id) ||
      !item.product ||
      item.product.catalogItemId !== item.id ||
      movement.operationId !== operation.id ||
      movement.balanceSourceId !== balance.id ||
      movement.reversalOfMovementId !== null ||
      movement.purchaseReceipt !== null ||
      balance.tenantId !== input.tenantId ||
      balance.storeId !== receipt.storeId ||
      balance.store.id !== receipt.storeId ||
      balance.store.tenantId !== input.tenantId ||
      balance.store.currencyCode !== receipt.store.currencyCode ||
      balance.kind !== "SHARED_POOL" ||
      balance.custodyType !== "STORE" ||
      balance.custodyReferenceId !== "" ||
      balance.parentBalanceSourceId !== null ||
      balance.productId !== item.product.id ||
      balance.product.id !== item.product.id ||
      balance.product.catalogItemId !== item.id ||
      balance.variant.id !== balance.variantId ||
      balance.variant.catalogItemId !== item.id ||
      balance.inventoryUnitId !== unit.id ||
      unit.stockBehavior !== "CANONICAL_SHARED" ||
      unit.factor.toFixed() !== "1" ||
      unit.configurationVersion.id !== unit.configurationVersionId ||
      unit.configurationVersion.productId !== item.product.id ||
      movement.enteredInventoryUnitId !== unit.id ||
      entered.id !== unit.id ||
      entered.configurationVersionId !== unit.configurationVersionId ||
      entered.configurationVersion.id !== unit.configurationVersionId ||
      entered.configurationVersion.productId !== item.product.id ||
      entered.stockBehavior !== "CANONICAL_SHARED" ||
      entered.factor.toFixed() !== "1" ||
      entered.transactionScale !== unit.transactionScale ||
      !Number.isSafeInteger(unit.transactionScale) ||
      unit.transactionScale < 0 ||
      unit.transactionScale > 18 ||
      movement.configurationVersionId !== unit.configurationVersionId ||
      movement.unitFactorSnapshot.toFixed() !== "1" ||
      movement.transactionScaleSnapshot !== unit.transactionScale ||
      movement.previousOnHandQuantity.toFixed() !== "0"
    )
      conflict("Opening root, Product or canonical unit provenance is invalid.")
    let quantity: string
    try {
      quantity = normalizeQuantity(movement.enteredQuantity.toFixed())
      const fraction = quantity.split(".")[1] ?? ""
      if (fraction.length > unit.transactionScale)
        conflict("Opening exceeds canonical unit precision.")
    } catch (error) {
      if (error instanceof FinanceError) throw error
      conflict("Opening quantity exceeds exact supported bounds.")
    }
    if (
      (!graduation && quantity === "0") ||
      movement.resultingOnHandQuantity.toFixed() !== quantity ||
      movement.signedCanonicalEffect.toFixed() !== quantity
    )
      conflict("Opening movement differs from its original canonical count.")
    seen.add(balance.id)
    return { operation, movement, quantity, corrections }
  })
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: receipt.store.currencyCode,
      },
    },
  })
  if (
    (input.expectedBookId !== undefined && book?.id !== input.expectedBookId) ||
    (book &&
      (book.tenantId !== input.tenantId ||
        book.currencyCode !== receipt.store.currencyCode))
  )
    conflict("Opening Book differs from the held financial context.")
  return {
    receipt,
    sources,
    book,
    sourceKind: graduation ? "GRADUATION_OPENING" : "CATALOG_OPENING",
  }
}
