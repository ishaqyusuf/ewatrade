import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordStockCountValuationInTransaction } from "./valuation-counts"

const decimal = (value: string) => ({ toFixed: () => value })
const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "count-finalizer"

type LineSpec = {
  id: string
  before: string
  after: string
  variance: string
  kind?: "SHARED_POOL" | "PACKAGED_STOCK"
  factor?: string
  canonicalEffect?: string
  pool?: Record<string, unknown> | null
  movementCount?: number
}

function fixture(
  options: {
    lines?: LineSpec[]
    changedAfterFinalize?: boolean
    book?: Record<string, unknown> | null
    invalidCountScope?: boolean
    invalidCountStoreScope?: boolean
    invalidZeroLineUnitScope?: boolean
    invalidFreshPoolScope?: boolean
    invalidReplayPoolScope?: boolean
    closedThrough?: Date | null
    operationSource?: string
  } = {},
) {
  const store = { id: "store-1", tenantId: "tenant-1", currencyCode: "NGN" }
  const specs = options.lines ?? [
    {
      id: "line-1",
      before: "4",
      after: "2",
      variance: "-2",
      pool: {
        id: "pool-line-1",
        quantity: decimal("4"),
        valueMinor: BigInt(101),
        unknownReason: null,
        lastMovementCount: BigInt(1),
        lastSequence: BigInt(1),
        latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
      },
      movementCount: 2,
    },
  ]
  const lines = specs.map((spec, index) => {
    const balance = {
      id: `balance-${index + 1}`,
      tenantId: "tenant-1",
      storeId: store.id,
      kind: spec.kind ?? "SHARED_POOL",
      inventoryUnitId: `unit-${index + 1}`,
      revision: options.changedAfterFinalize ? 20 : 6,
      onHandQuantity: decimal(options.changedAfterFinalize ? "99" : spec.after),
      store,
      inventoryUnit: {
        id: `unit-${index + 1}`,
        configurationVersionId: `configuration-${index + 1}`,
        transactionScale: 3,
        factor: decimal(spec.factor ?? "1"),
      },
    }
    return {
      id: spec.id,
      balanceSourceId: balance.id,
      configurationVersionId: balance.inventoryUnit.configurationVersionId,
      expectedRevision: 5,
      expectedQuantity: decimal(spec.before),
      observedQuantity: decimal(spec.after),
      varianceQuantity: decimal(spec.variance),
      balanceSource: balance,
    }
  })
  const movements = lines.flatMap((line, index) => {
    const spec = specs[index]
    const variance = specs[index]?.variance ?? "0"
    if (variance === "0") return []
    return [
      {
        id: `movement-${index + 1}`,
        operationId: "count-operation",
        balanceSourceId: line.balanceSourceId,
        configurationVersionId: line.configurationVersionId,
        enteredInventoryUnitId: line.balanceSource.inventoryUnitId,
        enteredQuantity: decimal(
          variance.startsWith("-") ? variance.slice(1) : variance,
        ),
        transactionScaleSnapshot:
          line.balanceSource.inventoryUnit.transactionScale,
        unitFactorSnapshot: decimal(spec?.factor ?? "1"),
        signedCanonicalEffect: decimal(spec?.canonicalEffect ?? variance),
        previousOnHandQuantity: line.expectedQuantity,
        resultingOnHandQuantity: line.observedQuantity,
        reversalOfMovementId: null,
        balanceSource: line.balanceSource,
        valuationEvent: null as Record<string, unknown> | null,
      },
    ]
  })
  const operation = {
    id: "count-operation",
    tenantId: "tenant-1",
    storeId: store.id,
    type: "COUNT_RECONCILIATION",
    source: options.operationSource ?? "stock_count",
    actorUserId,
    effectiveAt,
    createdAt: effectiveAt,
    store,
    movements,
  }
  const count = {
    id: "count-1",
    tenantId: options.invalidCountScope ? "tenant-other" : "tenant-1",
    storeId: store.id,
    status: "FINALIZED",
    finalizedAt: effectiveAt,
    finalizedOperationId: operation.id,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    store: options.invalidCountStoreScope
      ? { ...store, id: "unrelated-store" }
      : store,
    lines,
    finalizedOperation: operation,
  }
  if (options.invalidZeroLineUnitScope && lines[0]) {
    lines[0].balanceSource.inventoryUnit.id = "unrelated-unit"
  }
  const pools = new Map<string, Record<string, unknown> | null>()
  for (const [index, spec] of specs.entries()) {
    const line = lines[index]
    const pool = spec.pool ?? null
    if (!line) continue
    if (pool) {
      pool.tenantId = "tenant-1"
      pool.bookId = "book-1"
      pool.balanceSourceId = options.invalidFreshPoolScope
        ? "unrelated-balance"
        : line.balanceSourceId
      if (typeof pool.lastStockRevision !== "number") {
        pool.lastStockRevision = 5
      }
    }
    pools.set(line.balanceSourceId, pool)
  }
  const counts = new Map<string, number>()
  for (const [index, spec] of specs.entries()) {
    const line = lines[index]
    if (line) {
      counts.set(
        line.balanceSourceId,
        spec.movementCount ?? (spec.variance === "0" ? 0 : 1),
      )
    }
  }
  const state = { pools, eventCreateCount: 0, movementCountQueries: 0 }
  const tx = {
    stockCount: { findFirst: async () => count },
    financeBook: {
      findUnique: async () =>
        options.book === null
          ? null
          : (options.book ?? {
              id: "book-1",
              tenantId: "tenant-1",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01T00:00:00.000Z"),
              closedThrough: options.closedThrough ?? null,
            }),
    },
    stockMovement: {
      count: async ({ where }: { where: { balanceSourceId: string } }) => {
        state.movementCountQueries += 1
        return counts.get(where.balanceSourceId) ?? 0
      },
    },
    financeInventoryPool: {
      findUnique: async ({
        where,
      }: { where: { bookId_balanceSourceId: { balanceSourceId: string } } }) =>
        pools.get(where.bookId_balanceSourceId.balanceSourceId) ?? null,
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = [...pools.entries()].find(
          ([, pool]) => pool?.id === where.id,
        )
        if (!entry) throw new Error("missing pool")
        const updated = { ...entry[1], ...data }
        pools.set(entry[0], updated)
        return { id: where.id, ...updated }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const balanceSourceId = data.balanceSourceId as string
        const created = { id: `pool-${balanceSourceId}`, ...data }
        pools.set(balanceSourceId, created)
        return created
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.eventCreateCount += 1
        const created = {
          id: `event-${state.eventCreateCount}`,
          ...data,
          pool: {
            id: data.poolId,
            tenantId: "tenant-1",
            bookId: "book-1",
            balanceSourceId: options.invalidReplayPoolScope
              ? "unrelated-balance"
              : data.balanceSourceId,
          },
          purchaseReceiptId: data.purchaseReceiptId ?? null,
          productReturnCostId: data.productReturnCostId ?? null,
          canonicalEffect: decimal(String(data.canonicalEffect)),
          quantityBefore: decimal(String(data.quantityBefore)),
          quantityAfter: decimal(String(data.quantityAfter)),
        }
        const movement = movements.find(
          (candidate) => candidate.id === data.stockMovementId,
        )
        if (movement) movement.valuationEvent = created
        return created
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    count,
    operation,
    lines,
    movements,
  }
}

async function record(value: ReturnType<typeof fixture>) {
  return recordStockCountValuationInTransaction(value.tx, {
    tenantId: "tenant-1",
    stockCountId: "count-1",
  })
}

describe("stock count valuation", () => {
  test("values multiple known shortages with exact weighted-average and full residual cost", async () => {
    const f = fixture({
      lines: [
        {
          id: "line-1",
          before: "4",
          after: "2",
          variance: "-2",
          pool: {
            id: "pool-line-1",
            quantity: decimal("4"),
            valueMinor: BigInt(101),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(1),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
        {
          id: "line-2",
          before: "3",
          after: "0",
          variance: "-3",
          pool: {
            id: "pool-line-2",
            quantity: decimal("3"),
            valueMinor: BigInt(17),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(2),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
        {
          id: "line-packaged",
          before: "2",
          after: "1",
          variance: "-1",
          kind: "PACKAGED_STOCK",
          factor: "12",
          canonicalEffect: "-12",
          pool: {
            id: "pool-line-packaged",
            quantity: decimal("24"),
            valueMinor: BigInt(48),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(1),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
      ],
    })
    const result = await record(f)
    expect(result).toHaveLength(3)
    expect(result?.[0]?.sourceCostMinor).toBe(BigInt(50))
    expect(result?.[0]?.valueAfterMinor).toBe(BigInt(51))
    expect(result?.[1]?.sourceCostMinor).toBe(BigInt(17))
    expect(result?.[1]?.valueAfterMinor).toBe(BigInt(0))
    expect(f.movements[2]?.signedCanonicalEffect.toFixed()).toBe("-12")
    expect(result?.[2]?.sourceCostMinor).toBe(BigInt(24))
  })

  test("keeps count gains UNKNOWN even when the prior pool is known", async () => {
    const f = fixture({
      lines: [
        {
          id: "line-gain",
          before: "2",
          after: "5",
          variance: "3",
          pool: {
            id: "pool-gain",
            quantity: decimal("2"),
            valueMinor: BigInt(40),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(1),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
      ],
    })
    const result = await record(f)
    expect(result?.[0]?.valueBeforeMinor).toBe(BigInt(40))
    expect(result?.[0]?.sourceCostMinor).toBeNull()
    expect(result?.[0]?.valueDeltaMinor).toBeNull()
    expect(result?.[0]?.valueAfterMinor).toBeNull()
    expect(result?.[0]?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
    expect(f.state.pools.get("balance-1")?.valueMinor).toBeNull()
  })

  test("preserves known zero carrying value on a shortage", async () => {
    const f = fixture({
      lines: [
        {
          id: "line-zero-value",
          before: "2",
          after: "1",
          variance: "-1",
          pool: {
            id: "pool-zero-value",
            quantity: decimal("2"),
            valueMinor: BigInt(0),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(1),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
      ],
    })
    const result = await record(f)
    expect(result?.[0]?.sourceCostMinor).toBe(BigInt(0))
    expect(result?.[0]?.valueDeltaMinor).toBe(BigInt(0))
    expect(result?.[0]?.valueAfterMinor).toBe(BigInt(0))
    expect(result?.[0]?.unknownReason).toBeNull()
  })

  test("leaves zero-variance lines without movements or events", async () => {
    const f = fixture({
      lines: [{ id: "line-zero", before: "4", after: "4", variance: "0" }],
    })
    expect(await record(f)).toEqual([])
    expect(f.state.eventCreateCount).toBe(0)
    expect(f.state.movementCountQueries).toBe(0)
  })

  test("rejects zero-line Store and Inventory Unit scope corruption", async () => {
    const wrongStore = fixture({
      lines: [{ id: "line-zero", before: "4", after: "4", variance: "0" }],
      invalidCountStoreScope: true,
    })
    await expect(record(wrongStore)).rejects.toBeInstanceOf(FinanceError)

    const wrongUnit = fixture({
      lines: [{ id: "line-zero", before: "4", after: "4", variance: "0" }],
      invalidZeroLineUnitScope: true,
    })
    await expect(record(wrongUnit)).rejects.toBeInstanceOf(FinanceError)
  })

  test("replays saved events after later physical stock changes", async () => {
    const f = fixture()
    const original = await record(f)
    const changedLine = f.lines[0]
    if (changedLine) {
      changedLine.balanceSource.onHandQuantity = decimal("99")
      changedLine.balanceSource.revision = 20
    }
    const replay = await record(f)
    expect(replay?.[0]?.id).toBe(original?.[0]?.id)
    expect(f.state.eventCreateCount).toBe(1)
    expect(f.state.movementCountQueries).toBe(1)
  })

  test("rejects fresh pool and replayed event pool scope corruption", async () => {
    await expect(
      record(fixture({ invalidFreshPoolScope: true })),
    ).rejects.toBeInstanceOf(FinanceError)

    const replayPool = fixture({ invalidReplayPoolScope: true })
    await record(replayPool)
    await expect(record(replayPool)).rejects.toBeInstanceOf(FinanceError)
  })

  test("rejects partial event registration, bad scope, and closed-period posting", async () => {
    const partial = fixture({
      lines: [
        {
          id: "line-1",
          before: "4",
          after: "2",
          variance: "-2",
          pool: {
            id: "pool-line-1",
            quantity: decimal("4"),
            valueMinor: BigInt(101),
            unknownReason: null,
            lastMovementCount: BigInt(1),
            lastSequence: BigInt(1),
            latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
          },
          movementCount: 2,
        },
        { id: "line-2", before: "3", after: "0", variance: "-3" },
      ],
    })
    const result = await record(partial)
    const secondMovement = partial.movements[1]
    if (secondMovement) secondMovement.valuationEvent = null
    expect(result).toHaveLength(2)
    await expect(record(partial)).rejects.toBeInstanceOf(FinanceError)

    await expect(
      record(fixture({ invalidCountScope: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      record(fixture({ operationSource: "unrelated" })),
    ).rejects.toBeInstanceOf(FinanceError)

    const closed = fixture({
      closedThrough: new Date("2026-09-15T12:00:00.000Z"),
    })
    await expect(record(closed)).rejects.toBeInstanceOf(FinanceError)
  })

  test("preserves no-Book stock behavior", async () => {
    const f = fixture({ book: null })
    expect(await record(f)).toBeNull()
    expect(f.state.eventCreateCount).toBe(0)
    expect(f.state.movementCountQueries).toBe(0)
  })
})
