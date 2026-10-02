import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { recordPurchaseReceiptValuationInTransaction } from "./valuation-receipts"

const effectiveAt = new Date("2026-09-30T12:00:00.000Z")
const decimal = (value: string) => ({ toFixed: () => value })

function fixture(
  options: {
    before?: string
    after?: string
    movementCount?: number
    pool?: Record<string, unknown> | null
  } = {},
) {
  const before = options.before ?? "0"
  const after = options.after ?? "2"
  const movementCount = options.movementCount ?? 1
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    kind: "SHARED_POOL",
    revision: 3,
    onHandQuantity: decimal(after),
  }
  const operation = {
    id: "operation-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    type: "RECEIPT",
    source: "finance_purchase",
    actorUserId: "actor-1",
    effectiveAt,
  }
  const movement = {
    id: "movement-1",
    balanceSourceId: balance.id,
    signedCanonicalEffect: decimal("2"),
    previousOnHandQuantity: decimal(before),
    resultingOnHandQuantity: decimal(after),
    unitFactorSnapshot: decimal("1"),
    balanceSource: balance,
    operation,
  }
  const receipt = {
    id: "receipt-1",
    tenantId: "tenant-1",
    bookId: "book-1",
    stockOperationId: operation.id,
    stockMovementId: movement.id,
    valuationEvent: null,
    stockMovement: movement,
    billLine: {
      amountMinor: 125,
      bill: {
        kind: "PURCHASE",
        voidedAt: null,
        supplierId: "supplier-1",
        actorUserId: "actor-1",
        storeId: "store-1",
        incurredAt: effectiveAt,
      },
      account: { kind: "ASSET", purpose: "INVENTORY", code: "1300" },
    },
  }
  const poolState: Record<string, unknown> | null = options.pool
    ? {
        id: "pool-1",
        quantity: decimal(before),
        valueMinor: BigInt(400),
        unknownReason: null,
        lastMovementCount: BigInt(movementCount - 1),
        lastSequence: BigInt(6),
        latestEffectiveAt: new Date("2026-09-20T12:00:00.000Z"),
        ...options.pool,
      }
    : null
  let writtenPool: Record<string, unknown> | null = null
  let writtenEvent: Record<string, unknown> | null = null
  const tx = {
    financePurchaseReceiptLine: { findFirst: async () => receipt },
    financeInventoryPool: {
      findUnique: async () => poolState,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writtenPool = { ...poolState, ...data }
        return writtenPool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writtenPool = { id: "pool-1", ...data }
        return writtenPool
      },
    },
    stockMovement: { count: async () => movementCount },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writtenEvent = data
        return data
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    get pool() {
      return writtenPool
    },
    get event() {
      return writtenEvent
    },
  }
}

const source = {
  tenantId: "tenant-1",
  bookId: "book-1",
  receiptId: "receipt-1",
  actorUserId: "actor-1",
  expectedStockRevision: 3,
}

describe("purchase receipt inventory valuation", () => {
  test("only movement one establishes a known zero opening and records exact receipt provenance", async () => {
    const setup = fixture({ before: "0", after: "2", movementCount: 1 })
    const event = await recordPurchaseReceiptValuationInTransaction(
      setup.tx,
      source,
    )

    expect(event).toMatchObject({
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      kind: "PURCHASE_RECEIPT",
      sourceKind: "PURCHASE_RECEIPT",
      sourceId: "receipt-1",
      stockOperationId: "operation-1",
      stockMovementId: "movement-1",
      purchaseReceiptId: "receipt-1",
      quantityBefore: "0",
      quantityAfter: "2",
      valueBeforeMinor: BigInt(0),
      valueDeltaMinor: BigInt(125),
      valueAfterMinor: BigInt(125),
      sourceCostMinor: BigInt(125),
      unknownReason: null,
      effectiveAt,
      actorUserId: "actor-1",
    })
    expect(setup.pool).toMatchObject({
      quantity: "2",
      valueMinor: BigInt(125),
      lastMovementCount: BigInt(1),
      lastSequence: BigInt(1),
    })
  })

  test("a net-zero history gap stays UNKNOWN even when the physical opening was zero", async () => {
    const setup = fixture({ before: "0", after: "2", movementCount: 3 })
    const event = await recordPurchaseReceiptValuationInTransaction(
      setup.tx,
      source,
    )

    expect(event).toMatchObject({
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: BigInt(125),
      unknownReason: "UNCAPTURED_MOVEMENTS",
    })
    expect(setup.pool).toMatchObject({
      valueMinor: null,
      lastMovementCount: BigInt(3),
      unknownReason: "UNCAPTURED_MOVEMENTS",
    })
  })

  test("positive unregistered opening quantity remains unknown as missing opening cost", async () => {
    const setup = fixture({ before: "5", after: "7", movementCount: 1 })
    const event = await recordPurchaseReceiptValuationInTransaction(
      setup.tx,
      source,
    )

    expect(event).toMatchObject({
      quantityBefore: "5",
      quantityAfter: "7",
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: BigInt(125),
      unknownReason: "MISSING_OPENING_COST",
    })
  })

  test("a sequential receipt extends a known pool without changing source-cost arithmetic", async () => {
    const setup = fixture({
      before: "4",
      after: "6",
      movementCount: 8,
      pool: {
        quantity: decimal("4"),
        valueMinor: BigInt(400),
        lastMovementCount: BigInt(7),
        lastSequence: BigInt(6),
      },
    })
    const event = await recordPurchaseReceiptValuationInTransaction(
      setup.tx,
      source,
    )

    expect(event).toMatchObject({
      quantityBefore: "4",
      quantityAfter: "6",
      valueBeforeMinor: BigInt(400),
      valueDeltaMinor: BigInt(125),
      valueAfterMinor: BigInt(525),
      sourceCostMinor: BigInt(125),
      unknownReason: null,
    })
    expect(setup.pool).toMatchObject({
      quantity: "6",
      valueMinor: BigInt(525),
      lastMovementCount: BigInt(8),
      lastSequence: BigInt(7),
    })
  })
})
