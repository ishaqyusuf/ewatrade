import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { transformationFixture } from "./inventory-transformation-test-fixture"
import { readReviewedCostOwningSourcesInTransaction as readOwners } from "./reviewed-cost-owners"
import { proveReviewedCostTransformationSources as prove } from "./reviewed-cost-transformation-sources"

function retainedValue(value: unknown): unknown {
  if (value instanceof Date || value === null) return value
  if (Array.isArray(value)) return value.map(retainedValue)
  if (value && typeof value === "object") {
    if ("toFixed" in value && typeof value.toFixed === "function")
      return new Prisma.Decimal(value.toFixed())
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, retainedValue(item)]),
    )
  }
  return value
}

function fixture() {
  const f = transformationFixture({ existing: true })
  const version = { id: "configuration-1", productId: "product-1" }
  const product = {
    id: "product-1",
    catalogItemId: "item-1",
    catalogItem: { id: "item-1", tenantId: "tenant-1" },
  }
  const variant = { id: "variant-1", catalogItemId: "item-1" }
  const graphs = retainedValue([
    {
      ...f.operation,
      committedReservation: null,
      correctionOfOperationId: null,
      purchaseReceipts: [],
      productFulfillments: [],
      productReturns: [],
      dispatchedTransfers: [],
      receivedTransfers: [],
      cancelledTransfers: [],
      _count: {
        movements: 2,
        corrections: 0,
        purchaseReceipts: 0,
        productFulfillments: 0,
        productReturns: 0,
        finalizedCounts: 0,
        finalizedCloseouts: 0,
        dispatchedTransfers: 0,
        receivedTransfers: 0,
        cancelledTransfers: 0,
      },
      movements: f.operation.movements.map((m) => {
        const unit = {
          ...m.balanceSource.inventoryUnit,
          id: m.enteredInventoryUnitId,
          configurationVersion: version,
          stockBehavior: "PACKAGED_STOCK",
        }
        const pool = {
          ...f.state.pools.get(m.balanceSourceId),
          tenantId: "tenant-1",
          bookId: "book-1",
          balanceSourceId: m.balanceSourceId,
        }
        return {
          ...m,
          purchaseReceipt: null,
          enteredInventoryUnit: unit,
          balanceSource: {
            ...m.balanceSource,
            inventoryUnit: unit,
            product,
            variant,
            parentBalanceSourceId: null,
            parentBalanceSource: null,
            custodyType: "STORE",
            custodyReferenceId: "",
          },
          valuationEvent: m.valuationEvent
            ? { ...m.valuationEvent, pool }
            : null,
        }
      }),
    },
  ]) as Parameters<typeof prove>[0]["graphs"]
  const graph = graphs[0]
  if (!graph) throw new Error("Missing transformation fixture")
  const discovery = {
    tenantId: "tenant-1",
    bookId: "book-1",
    currencyCode: "NGN",
    operationIds: [graph.id],
    movementIds: graph.movements.map((m) => m.id),
    balanceSourceIds: graph.movements.map((m) => m.balanceSourceId),
    transferIds: [],
    reviewAllocationIds: [],
    rootBalanceSourceIds: graph.movements.map((m) => m.balanceSourceId),
    orderLineIds: [],
    productReturnIds: [],
    bookSequence: 0n,
    sourceDiscoveryHash: "a".repeat(64),
    requiresOwningSourceProof: true as const,
    requiresMonetaryProof: true as const,
  } satisfies Parameters<typeof prove>[0]["discovery"]
  const input = {
    graphs,
    discovery,
    book: { id: "book-1", tenantId: "tenant-1", currencyCode: "NGN" },
  }
  const source = graph.movements.find((m) => m.id === "source-movement")
  const target = graph.movements.find((m) => m.id === "target-movement")
  if (!source || !target || !source.valuationEvent || !target.valuationEvent)
    throw new Error("Missing paired source")
  return {
    f,
    input,
    graph,
    source,
    target,
    sourceEvent: source.valuationEvent,
    targetEvent: target.valuationEvent,
    read: () => prove(input),
  }
}

test("original paired proof preserves exact allocation and ignores later mutable balances", () => {
  const f = fixture()
  f.source.balanceSource.onHandQuantity = new Prisma.Decimal("999")
  f.target.balanceSource.onHandQuantity = new Prisma.Decimal("999")
  const proof = f.read()[0]
  expect(proof?.saved?.sourceEvent.sourceCostMinor).toBe(50n)
  expect(proof?.saved?.targetEvent.sourceCostMinor).toBe(50n)
  expect(proof?.sourceCanonical).toBe("2")
  expect(proof?.targetCanonical).toBe("2")
})

test("complete original residual remains conserved between packages", () => {
  const f = fixture()
  f.source.previousOnHandQuantity = new Prisma.Decimal("2")
  f.source.resultingOnHandQuantity = new Prisma.Decimal("0")
  Object.assign(f.sourceEvent, {
    quantityBefore: new Prisma.Decimal("2"),
    quantityAfter: new Prisma.Decimal("0"),
    valueBeforeMinor: 51n,
    sourceCostMinor: 51n,
    valueDeltaMinor: -51n,
    valueAfterMinor: 0n,
  })
  Object.assign(f.targetEvent, {
    sourceCostMinor: 51n,
    valueDeltaMinor: 51n,
    valueAfterMinor: 60n,
  })
  expect(f.read()[0]?.saved?.sourceEvent.sourceCostMinor).toBe(51n)
  expect(f.read()[0]?.saved?.targetEvent.valueAfterMinor).toBe(60n)
})

test("UNKNOWN source and known source to UNKNOWN target preserve their distinct saved states", () => {
  const unknownSource = fixture()
  Object.assign(unknownSource.sourceEvent, {
    sourceCostMinor: null,
    valueBeforeMinor: null,
    valueDeltaMinor: null,
    valueAfterMinor: null,
    unknownReason: "MISSING_OPENING_COST",
  })
  Object.assign(unknownSource.targetEvent, {
    sourceCostMinor: null,
    valueDeltaMinor: null,
    valueAfterMinor: null,
    unknownReason: "MISSING_OPENING_COST",
  })
  expect(unknownSource.read()[0]?.saved?.targetEvent.valueAfterMinor).toBeNull()
  const unknownTarget = fixture()
  Object.assign(unknownTarget.targetEvent, {
    valueBeforeMinor: null,
    valueDeltaMinor: null,
    valueAfterMinor: null,
    unknownReason: "MISSING_OPENING_COST",
  })
  expect(unknownTarget.read()[0]?.saved?.sourceEvent.sourceCostMinor).toBe(50n)
  expect(unknownTarget.read()[0]?.saved?.targetEvent.sourceCostMinor).toBe(50n)
  expect(unknownTarget.read()[0]?.saved?.targetEvent.valueAfterMinor).toBeNull()
})

test("two absent saved events grant no registration while partial pairing refuses", () => {
  const missing = fixture()
  missing.source.valuationEvent = null
  missing.target.valuationEvent = null
  expect(missing.read()[0]?.saved).toBeNull()
  const partial = fixture()
  partial.target.valuationEvent = null
  expect(partial.read).toThrow()
})

const mutations: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
  [
    "outside operation",
    (f) => {
      f.input.discovery.operationIds = []
    },
  ],
  [
    "outside movement",
    (f) => {
      f.input.discovery.movementIds = [f.source.id]
    },
  ],
  [
    "outside balance",
    (f) => {
      f.input.discovery.balanceSourceIds = [f.source.balanceSourceId]
    },
  ],
  [
    "duplicate operation",
    (f) => {
      f.input.graphs.push(f.graph)
    },
  ],
  [
    "held Book",
    (f) => {
      f.input.book.id = "foreign"
    },
  ],
  [
    "competing document",
    (f) => {
      f.graph._count.purchaseReceipts = 1
    },
  ],
  [
    "correction",
    (f) => {
      f.graph._count.corrections = 1
    },
  ],
  [
    "foreign Product",
    (f) => {
      f.source.balanceSource.product.catalogItem.tenantId = "foreign"
    },
  ],
  [
    "wrong configuration Product",
    (f) => {
      f.source.enteredInventoryUnit.configurationVersion.productId = "foreign"
    },
  ],
  [
    "foreign saved pool",
    (f) => {
      f.sourceEvent.pool.tenantId = "foreign"
    },
  ],
  [
    "wrong pool balance",
    (f) => {
      f.targetEvent.pool.balanceSourceId = f.source.balanceSourceId
    },
  ],
  [
    "partial ownership count",
    (f) => {
      f.graph._count.movements = 1
    },
  ],
  [
    "fractional entered quantity",
    (f) => {
      f.source.enteredQuantity = new Prisma.Decimal("0.5")
    },
  ],
  [
    "changed factor",
    (f) => {
      f.source.unitFactorSnapshot = new Prisma.Decimal("2")
    },
  ],
  [
    "invalid retained quantity",
    (f) => {
      f.source.previousOnHandQuantity = new Prisma.Decimal("-1")
    },
  ],
  [
    "changed saved paired cost",
    (f) => {
      f.targetEvent.sourceCostMinor = 49n
    },
  ],
]
for (const [label, mutate] of mutations)
  test(`refuses ${label} before original transfer semantics`, () => {
    const f = fixture()
    mutate(f)
    expect(f.read).toThrow()
    expect(f.f.state.eventCreateCount).toBe(0)
  })

function ownerFixture() {
  const f = fixture()
  const balances = f.graph.movements.map((m) => m.balanceSource)
  const units = f.graph.movements.map((m) => m.enteredInventoryUnit)
  const tx = {
    stockOperation: { findMany: async () => [f.graph] },
    stockMovement: { findMany: async () => f.graph.movements },
    stockBalanceSource: { findMany: async () => balances },
    inventoryUnit: { findMany: async () => units },
    unitConfigurationVersion: {
      findMany: async () => [
        f.source.enteredInventoryUnit.configurationVersion,
      ],
    },
    store: { findMany: async () => [f.graph.store] },
    catalogProduct: { findMany: async () => [f.source.balanceSource.product] },
    sellableVariant: { findMany: async () => [f.source.balanceSource.variant] },
    financeInventoryPool: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        [f.sourceEvent.pool, f.targetEvent.pool].filter((p) =>
          where.id.in.includes(p.id),
        ),
    },
  } as unknown as Prisma.TransactionClient
  const returns = {
    snapshot: { ...f.input.book, fulfillments: [], returns: [] },
    issues: [],
  } as unknown as Parameters<typeof readOwners>[3]
  return {
    ...f,
    readOwners: () =>
      readOwners(
        tx,
        {
          tenantId: "tenant-1",
          actorUserId: "actor-1",
          bookId: "book-1",
          through: new Date("2026-10-01T00:00:00Z"),
        },
        f.input.discovery,
        returns,
      ),
  }
}

test("actual owning reader adds paired transfer semantics and complete source facts", async () => {
  const f = ownerFixture()
  const proof = await f.readOwners()
  expect(proof.blockers).toEqual([])
  expect(proof.semantics).toEqual([
    { movementId: "source-movement", kind: "TRANSFER_OUT" },
    {
      movementId: "target-movement",
      kind: "TRANSFER_IN",
      originalMovementId: "source-movement",
    },
  ])
  expect(proof.operationBindings).toHaveLength(1)
  expect(proof.movementBindings).toHaveLength(2)
  expect(JSON.stringify(proof.snapshot)).toContain("PACKAGED_TRANSFORMATION")
})

test("actual owning reader blocks two missing events without producing a pair", async () => {
  const f = ownerFixture()
  f.source.valuationEvent = null
  f.target.valuationEvent = null
  const proof = await f.readOwners()
  expect(proof.blockers).toEqual([
    { code: "SOURCE_CONTRACT_PENDING", sourceId: f.graph.id },
  ])
  expect(proof.semantics).toEqual([])
  expect(f.f.state.eventCreateCount).toBe(0)
})
