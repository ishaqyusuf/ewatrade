import { Prisma } from "../../../generated/prisma/client"

const decimal = (value: string) => new Prisma.Decimal(value)
export const openingInput = { tenantId: "tenant", receiptId: "receipt" }
export const openingDate = new Date("2026-10-01T10:00:00Z")

export function openingFixture(
  options: {
    graduation?: boolean
    zero?: boolean
    empty?: boolean
    noBook?: boolean
  } = {},
) {
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const item = {
    id: "catalog",
    tenantId: "tenant",
    kind: "PRODUCT",
    product: { id: "product", catalogItemId: "catalog" } as {
      id: string
      catalogItemId: string
    } | null,
  }
  const receipt = {
    id: "receipt",
    tenantId: "tenant",
    storeId: "store",
    store,
    catalogItemId: "catalog",
    catalogItem: item,
    clientOperationId: "create",
    payloadHash: "a".repeat(64),
    commandType: options.graduation
      ? "GRADUATE_CATALOG_OFFERING"
      : "CREATE_CATALOG_ITEM",
    createdAt: new Date("2026-09-30T10:00:00Z"),
  }
  const unit = {
    id: "unit",
    configurationVersionId: "version",
    configurationVersion: { id: "version", productId: "product" },
    stockBehavior: "CANONICAL_SHARED",
    factor: decimal("1"),
    transactionScale: 3,
  }
  const quantity = options.zero ? "0" : "4"
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    store,
    kind: "SHARED_POOL",
    custodyType: "STORE",
    custodyReferenceId: "",
    parentBalanceSourceId: null as string | null,
    productId: "product",
    product: { id: "product", catalogItemId: "catalog" },
    variantId: "variant",
    variant: { id: "variant", catalogItemId: "catalog", key: "renamed" },
    inventoryUnitId: "unit",
    inventoryUnit: unit,
    onHandQuantity: decimal(quantity),
    reservedQuantity: decimal("0"),
    revision: 0,
  }
  const movement = {
    id: "movement",
    operationId: "operation",
    balanceSourceId: "balance",
    balanceSource: balance,
    enteredInventoryUnitId: "unit",
    enteredInventoryUnit: unit,
    configurationVersionId: "version",
    enteredQuantity: decimal(quantity),
    previousOnHandQuantity: decimal("0"),
    resultingOnHandQuantity: decimal(quantity),
    signedCanonicalEffect: decimal(quantity),
    unitFactorSnapshot: decimal("1"),
    transactionScaleSnapshot: 3,
    reversalOfMovementId: null as string | null,
    purchaseReceipt: null as { id: string } | null,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const operation = {
    id: "operation",
    tenantId: "tenant",
    storeId: "store",
    store,
    type: "OPENING_STOCK",
    source: options.graduation
      ? "service_commerce_catalog_graduation"
      : "catalog_setup",
    payloadHash: receipt.payloadHash,
    clientOperationId: options.graduation
      ? "create:opening-stock"
      : "create:opening-stock:original",
    actorUserId: "actor",
    effectiveAt: openingDate,
    correctionOfOperationId: null as string | null,
    linkedOperationId: null as string | null,
    committedReservation: null as { id: string } | null,
    movements: [movement],
    _count: {
      corrections: 0,
      movements: 1,
      purchaseReceipts: 0,
      productFulfillments: 0,
      productReturns: 0,
      finalizedCounts: 0,
      finalizedCloseouts: 0,
      dispatchedTransfers: 0,
      receivedTransfers: 0,
      cancelledTransfers: 0,
    },
  }
  const operations = options.empty ? [] : [operation]
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    closedThrough: null as Date | null,
  }
  let bookReads = 0
  let reads = 0
  let writes = 0
  let count = 1
  const pools: Array<Record<string, unknown>> = []
  const events: Array<Record<string, unknown>> = []
  const tx = {
    catalogCommandReceipt: { findFirst: async () => receipt },
    stockOperation: { findMany: async () => operations },
    financeBook: {
      findUnique: async () => {
        bookReads++
        return options.noBook ? null : book
      },
    },
    stockMovement: {
      groupBy: async () => {
        reads++
        return operations.map((op) => ({
          balanceSourceId: op.movements[0]?.balanceSourceId,
          _count: { _all: count },
        }))
      },
    },
    financeInventoryPool: {
      findMany: async () => {
        reads++
        return pools
      },
      createManyAndReturn: async ({
        data,
      }: { data: Array<Record<string, unknown>> }) => {
        writes++
        const created: Array<Record<string, unknown>> = data.map((row) => ({
          id: `pool-${row.balanceSourceId}`,
          ...row,
        }))
        pools.push(...created)
        return created
      },
    },
    financeInventoryValuationEvent: {
      createManyAndReturn: async ({
        data,
      }: { data: Array<Record<string, unknown>> }) => {
        writes++
        const created: Array<Record<string, unknown>> = data.map((row) => ({
          id: `event-${row.stockMovementId}`,
          ...row,
          purchaseReceiptId: null,
          productReturnCostId: null,
          canonicalEffect: decimal(String(row.canonicalEffect)),
          quantityBefore: decimal(String(row.quantityBefore)),
          quantityAfter: decimal(String(row.quantityAfter)),
          pool: pools.find((pool) => pool.id === row.poolId),
        }))
        for (const event of created) {
          const target = operations
            .flatMap((op) => op.movements)
            .find((row) => row.id === event.stockMovementId)
          if (target) target.valuationEvent = event
        }
        events.push(...created)
        return created
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    receipt,
    item,
    unit,
    balance,
    movement,
    operation,
    operations,
    book,
    pools,
    events,
    bookReads: () => bookReads,
    reads: () => reads,
    writes: () => writes,
    setCount: (value: number) => {
      count = value
    },
  }
}
