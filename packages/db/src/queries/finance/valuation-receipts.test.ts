import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  recordPurchaseReceiptValuationInTransaction,
  recordRecognitionReceiptValuations,
} from "./valuation-receipts"

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
    receipt,
    poolState,
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

function batchFixture() {
  const setups = Array.from({ length: 10 }, (_, index) =>
    fixture(
      index % 4 === 2
        ? { before: "4", after: "6", movementCount: 8, pool: {} }
        : index % 4 === 1
          ? { before: "2", after: "4" }
          : { movementCount: index % 4 === 3 ? 3 : 1 },
    ),
  )
  const receipts = setups.map(({ receipt }, index) => {
    receipt.id = `receipt-${index}`
    receipt.stockOperationId = `operation-${index}`
    receipt.stockMovementId = `movement-${index}`
    receipt.stockMovement.id = receipt.stockMovementId
    receipt.stockMovement.balanceSourceId = `balance-${index}`
    receipt.stockMovement.balanceSource.id = `balance-${index}`
    receipt.stockMovement.operation.id = receipt.stockOperationId
    receipt.billLine.bill.kind = "PURCHASE_ACCRUAL"
    if (index % 4 === 1) {
      receipt.stockMovement.balanceSource.kind = "PACKAGED_STOCK"
      receipt.stockMovement.unitFactorSnapshot = decimal("12")
      receipt.stockMovement.signedCanonicalEffect = decimal("24")
    }
    return receipt
  })
  const pools = setups.flatMap(({ poolState }, index) =>
    poolState
      ? [
          {
            ...poolState,
            id: `pool-${index}`,
            tenantId: "tenant-1",
            bookId: "book-1",
            balanceSourceId: `balance-${index}`,
            lastStockRevision: 2,
          },
        ]
      : [],
  ) as Array<Record<string, any>>
  const calls: string[] = []
  const state = {
    stale: false,
    partial: false,
    missingSaved: false,
    changedSaved: false,
    events: [] as Array<Record<string, any>>,
  }
  const tx = {
    financePurchaseReceiptLine: {
      findMany: async () => {
        calls.push("receipts")
        return receipts
      },
    },
    financeInventoryPool: {
      findMany: async () => {
        calls.push("pools")
        return pools
      },
      createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
        calls.push("new-pools")
        pools.push(
          ...data.map((pool) => ({
            ...pool,
            quantity: decimal(pool.quantity),
          })),
        )
        return { count: data.length }
      },
    },
    stockMovement: {
      groupBy: async () => {
        calls.push("counts")
        return receipts.map((receipt, index) => ({
          balanceSourceId: receipt.stockMovement.balanceSourceId,
          _count: { _all: index % 4 === 2 ? 8 : index % 4 === 3 ? 3 : 1 },
        }))
      },
    },
    $queryRaw: async (sql: { values: unknown[] }) => {
      calls.push("pool-CAS")
      if (state.stale) return []
      const updated = []
      for (let index = 0; index < sql.values.length - 2; index += 15) {
        const pool = pools.find((pool) => pool.id === sql.values[index])!
        Object.assign(pool, {
          quantity: decimal(String(sql.values[index + 1])),
          valueMinor: sql.values[index + 2],
          unknownReason: sql.values[index + 3],
          lastStockRevision: sql.values[index + 4],
          lastMovementCount: sql.values[index + 5],
          lastSequence: sql.values[index + 6],
          latestEffectiveAt: sql.values[index + 7],
        })
        updated.push({ id: pool.id })
      }
      return state.partial ? updated.slice(0, -1) : updated
    },
    financeInventoryValuationEvent: {
      createMany: async ({ data }: { data: Array<Record<string, any>> }) => {
        calls.push("events")
        state.events = data
        return { count: data.length }
      },
      findMany: async () => {
        calls.push("saved")
        const saved = state.events.map((event) => ({
          ...event,
          canonicalEffect: decimal(event.canonicalEffect),
          quantityBefore: decimal(event.quantityBefore),
          quantityAfter: decimal(event.quantityAfter),
          pool: pools.find((pool) => pool.id === event.poolId)!,
        }))
        if (state.missingSaved) saved.pop()
        if (state.changedSaved)
          Object.assign(saved[0]!, { sourceCostMinor: 999n })
        return saved
      },
    },
  } as unknown as Prisma.TransactionClient
  const input = {
    tenantId: "tenant-1",
    bookId: "book-1",
    actorUserId: "actor-1",
    receipts: receipts.map((receipt) => ({
      receiptId: receipt.id,
      expectedStockRevision: 3,
    })),
  }
  const dates = async (actual: unknown) => {
    expect(actual).toBe(receipts)
    return new Map(
      receipts.map((receipt) => [receipt.stockMovementId, effectiveAt]),
    )
  }
  return { tx, receipts, input, dates, calls, state }
}

test("ten actual receipts batch pool/history reads and writes while preserving known, packaged and gap arithmetic", async () => {
  const f = batchFixture()
  const events = await recordRecognitionReceiptValuations(
    f.tx,
    f.input,
    f.dates,
  )
  expect(f.calls).toEqual([
    "receipts",
    "pools",
    "counts",
    "pool-CAS",
    "new-pools",
    "events",
    "saved",
  ])
  expect(events).toHaveLength(10)
  for (let index = 0; index < 10; index++) {
    const event = events[index]!
    expect(event.sourceCostMinor).toBe(125n)
    expect(event.purchaseReceiptId).toBe(`receipt-${index}`)
    expect(event.stockMovementId).toBe(`movement-${index}`)
    expect(event.actorUserId).toBe("actor-1")
    expect(event.effectiveAt).toBe(effectiveAt)
    expect(event.valueAfterMinor).toBe(
      index % 4 === 0 ? 125n : index % 4 === 2 ? 525n : null,
    )
    expect(event.unknownReason).toBe(
      index % 4 === 1
        ? "MISSING_OPENING_COST"
        : index % 4 === 3
          ? "UNCAPTURED_MOVEMENTS"
          : null,
    )
    expect(event.sequence).toBe(index % 4 === 2 ? 7n : 1n)
    if (index % 4 === 1) expect(event.quantityAfter.toFixed()).toBe("48")
  }
})

test("batch validates every receipt and dated owner before valuation effects", async () => {
  for (const mutate of [
    (f: ReturnType<typeof batchFixture>) => {
      f.receipts[0]!.stockMovement.operation.actorUserId = "other"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.receipts[0]!.stockMovement.balanceSource.revision = 4
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.receipts[0]!.stockMovement.signedCanonicalEffect = decimal("9")
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.receipts[0]!.billLine.account.code = "1310"
    },
    (f: ReturnType<typeof batchFixture>) => {
      f.receipts.pop()
    },
  ]) {
    const f = batchFixture()
    mutate(f)
    await expect(
      recordRecognitionReceiptValuations(f.tx, f.input, f.dates),
    ).rejects.toThrow()
    expect(f.calls).toEqual(["receipts"])
  }
  const f = batchFixture()
  await expect(
    recordRecognitionReceiptValuations(f.tx, f.input, async () => {
      throw Error("OWNER_CHANGED")
    }),
  ).rejects.toThrow("OWNER_CHANGED")
  expect(f.calls).toEqual(["receipts"])
})

test("pool CAS and actual saved valuation completeness/source mismatches refuse", async () => {
  for (const flag of [
    "stale",
    "partial",
    "missingSaved",
    "changedSaved",
  ] as const) {
    const f = batchFixture()
    f.state[flag] = true
    await expect(
      recordRecognitionReceiptValuations(f.tx, f.input, f.dates),
    ).rejects.toThrow()
    if (flag === "stale" || flag === "partial")
      expect(f.calls).toEqual(["receipts", "pools", "counts", "pool-CAS"])
  }
})

test("completed valuation replay keeps original events without reading or writing pools, even after later stock revisions", async () => {
  const f = batchFixture()
  const original = await recordRecognitionReceiptValuations(
    f.tx,
    f.input,
    f.dates,
  )
  for (let index = 0; index < 10; index++) {
    Object.assign(f.receipts[index]!, { valuationEvent: original[index] })
    f.receipts[index]!.stockMovement.balanceSource.revision++
  }
  f.calls.length = 0
  expect(
    await recordRecognitionReceiptValuations(f.tx, f.input, f.dates),
  ).toEqual(original)
  expect(f.calls).toEqual(["receipts"])
  Object.assign(f.receipts[0]!, {
    valuationEvent: { ...original[0]!, sourceCostMinor: 999n },
  })
  await expect(
    recordRecognitionReceiptValuations(f.tx, f.input, f.dates),
  ).rejects.toThrow("source already differs")
  expect(f.calls).toEqual(["receipts", "receipts"])
})
