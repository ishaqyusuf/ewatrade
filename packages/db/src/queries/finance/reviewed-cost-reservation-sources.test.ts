import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { assertSavedReservationCommitSource } from "./inventory-reservation-source"
import {
  reservationCommitFixture,
  reservationCommitTestInput,
} from "./inventory-reservation-test-fixture"
import { readReviewedCostOwningSourcesInTransaction as readOwners } from "./reviewed-cost-owners"
import { readReviewedCostReservationSources as readSources } from "./reviewed-cost-reservation-sources"
import { recordReservationCommitValuationInTransaction } from "./valuation-reservations"

async function fixture(
  size = 1,
  options: Parameters<typeof reservationCommitFixture>[0] = {},
) {
  const original = reservationCommitFixture(options)
  await recordReservationCommitValuationInTransaction(
    original.tx,
    reservationCommitTestInput,
  )
  const owners = Array.from({ length: size }, (_, index) => ({
    ...original.operation,
    id: `operation-${index}`,
    clientOperationId: `commit-command-${index}`,
    payloadHash: "a".repeat(64),
    linkedOperationId: null,
    source: "inventory",
    purchaseReceipts: [],
    productFulfillments: [],
    productReturns: [],
    committedReservation: {
      id: `reservation-${index}`,
      commercialOrderLineId: null,
    },
    _count: { ...original.operation._count, movements: 1 },
  }))
  const graphs = owners.map((owner, index) => ({
    ...owner,
    movements: [
      {
        ...original.movement,
        id: `movement-${index}`,
        operationId: owner.id,
        valuationEvent: {
          ...original.movement.valuationEvent,
          id: `event-${index}`,
          stockMovementId: `movement-${index}`,
          stockOperationId: owner.id,
          sourceId: `reservation-${index}`,
        },
      },
    ],
  }))
  const reservations = owners.map((owner) => ({
    ...original.reservation,
    id: owner.committedReservation.id,
    committedOperationId: owner.id,
  }))
  let calls = 0
  let take = 0
  const tx = {
    stockReservation: {
      findMany: async (args: { take: number }) => {
        calls += 1
        take = args.take
        return reservations
      },
    },
  } as unknown as Prisma.TransactionClient
  const discovery = {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    operationIds: owners.map((row) => row.id),
  }
  const input = {
    owners,
    graphs,
    discovery,
    book: original.book,
  } as unknown as Parameters<typeof readSources>[1]
  return {
    original,
    owners,
    graphs,
    reservations,
    input,
    tx,
    read: () => readSources(tx, input),
    calls: () => calls,
    take: () => take,
  }
}

async function ownerFixture() {
  const f = await fixture()
  const balance = f.original.balance
  const units = [
    ...new Map(
      [balance.inventoryUnit, f.original.unit].map((unit) => [unit.id, unit]),
    ).values(),
  ]
  Object.assign(f.tx, {
    stockOperation: { findMany: async () => f.owners },
    stockMovement: {
      findMany: async () => f.input.graphs.flatMap((graph) => graph.movements),
    },
    stockBalanceSource: { findMany: async () => [balance] },
    inventoryUnit: { findMany: async () => units },
    unitConfigurationVersion: {
      findMany: async () => [f.original.unit.configurationVersion],
    },
    store: { findMany: async () => [balance.store] },
    catalogProduct: { findMany: async () => [balance.product] },
    sellableVariant: { findMany: async () => [balance.variant] },
    financeInventoryPool: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const pool = f.original.getPool()
        return pool && where.id.in.includes(pool.id) ? [pool] : []
      },
    },
  })
  const discovery = {
    ...f.input.discovery,
    balanceSourceIds: [balance.id],
    movementIds: f.input.graphs.flatMap((graph) =>
      graph.movements.map((movement) => movement.id),
    ),
    transferIds: [],
    reviewAllocationIds: [],
  } as Parameters<typeof readOwners>[2]
  const returns = {
    snapshot: { ...f.original.book, fulfillments: [], returns: [] },
    issues: [],
  } as unknown as Parameters<typeof readOwners>[3]
  const read = () =>
    readOwners(
      f.tx,
      {
        tenantId: "tenant",
        actorUserId: "operator",
        bookId: "book",
        through: new Date("2026-10-01T00:00:00Z"),
      },
      discovery,
      returns,
    )
  return { ...f, readOwners: read }
}

test("owning reader uses proved standalone withdrawal semantics and complete retained source", async () => {
  const f = await ownerFixture()
  const source = await f.readOwners()
  expect(source.blockers).toEqual([])
  expect(source.semantics).toEqual([
    {
      movementId: "movement-0",
      kind: "WITHDRAWAL",
      purpose: "STANDALONE_COMMITMENT",
    },
  ])
  expect(source.operationBindings).toHaveLength(1)
  expect(source.movementBindings[0]?.valuation?.sourceCostMinor).toBe(50n)
  expect(JSON.stringify(source.snapshot)).toContain(
    "STANDALONE_RESERVATION_COMMIT",
  )
  expect(JSON.stringify(source.snapshot)).toContain("reservation-0")
})

test("missing original saved event remains a blocker and does not acquire monetary authority", async () => {
  const f = await ownerFixture()
  const movement = f.input.graphs[0]?.movements[0]
  if (!movement) throw new Error("Missing movement")
  movement.valuationEvent = null
  const source = await f.readOwners()
  expect(source.semantics).toEqual([])
  expect(source.blockers).toEqual([
    { code: "SOURCE_CONTRACT_PENDING", sourceId: "operation-0" },
  ])
  expect(f.original.writes()).toBe(2)
})

test("standalone commitment label alone cannot prove a missing original relation", async () => {
  const f = await ownerFixture()
  const owner = f.input.owners[0]
  if (!owner) throw new Error("Missing owner")
  owner.committedReservation = null
  const source = await f.readOwners()
  expect(source.semantics).toEqual([])
  expect(source.blockers).toEqual([
    { code: "SOURCE_CONTRACT_PENDING", sourceId: "operation-0" },
  ])
})

test("original standalone proof retains known half-even cost and full residual", async () => {
  for (const [quantity, cost] of [
    ["2", 50n],
    ["4", 101n],
  ] as const) {
    const f = await fixture(1, { quantity })
    const [source] = await f.read()
    if (!source) throw new Error("Missing source")
    expect(source.quantity).toBe(quantity)
    expect(assertSavedReservationCommitSource(source).sourceCostMinor).toBe(
      cost,
    )
    expect(f.calls()).toBe(1)
    expect(f.take()).toBe(4097)
  }
})

test("packaged and alternate entered units preserve exact canonical conversion", async () => {
  for (const packaged of [true, false]) {
    const f = await fixture(1, { quantity: "0.5", factor: "12", packaged })
    const [source] = await f.read()
    if (!source) throw new Error("Missing source")
    expect([source.quantity, source.before, source.after]).toEqual([
      "6",
      "48",
      "42",
    ])
    expect(assertSavedReservationCommitSource(source).sourceCostMinor).toBe(
      250n,
    )
  }
})

test("original saved proof ignores later mutable status, balance and closed period", async () => {
  const f = await fixture()
  for (const reservation of f.reservations) reservation.status = "RELEASED"
  f.original.balance.revision = 400
  f.original.balance.onHandQuantity = new Prisma.Decimal("77")
  f.original.book.closedThrough = f.original.operation.effectiveAt
  const [source] = await f.read()
  if (!source) throw new Error("Missing source")
  expect(assertSavedReservationCommitSource(source).sourceCostMinor).toBe(50n)
})

test("UNKNOWN original carrying value is retained rather than classified or zeroed", async () => {
  const f = await fixture(1, { noPool: true })
  const [source] = await f.read()
  if (!source) throw new Error("Missing source")
  const event = assertSavedReservationCommitSource(source)
  expect(event.sourceCostMinor).toBeNull()
  expect(event.unknownReason).toBe("MISSING_OPENING_COST")
})

test("4,096 registered commitments hydrate through one bounded reservation read", async () => {
  const f = await fixture(4096)
  const sources = await f.read()
  expect(sources).toHaveLength(4096)
  expect(new Set(sources.map((source) => source.reservation.id)).size).toBe(
    4096,
  )
  expect(f.calls()).toBe(1)
})

for (const kind of [
  "missing",
  "duplicate",
  "moved owner",
  "wrong source identity",
  "foreign tenant",
  "Order ownership",
  "competing owner",
  "changed factor",
  "changed committed date",
]) {
  test(`refuses ${kind} before trace classification`, async () => {
    const f = await fixture(2)
    const reservation = f.reservations[0]
    const graph = f.graphs[0]
    if (!reservation || !graph) throw new Error("Missing source fixture")
    if (kind === "missing") f.reservations.pop()
    if (kind === "duplicate") f.reservations[1] = reservation
    if (kind === "moved owner")
      reservation.committedOperationId = "foreign-operation"
    if (kind === "wrong source identity") reservation.id = "foreign-reservation"
    if (kind === "foreign tenant") reservation.tenantId = "foreign"
    if (kind === "Order ownership")
      reservation.commercialOrderLineId = "order-line"
    if (kind === "competing owner") graph._count.productReturns = 1
    if (kind === "changed factor")
      reservation.unitFactorSnapshot = new Prisma.Decimal("12")
    if (kind === "changed committed date")
      reservation.committedAt = new Date("2026-09-14T00:00:00Z")
    await expect(f.read()).rejects.toMatchObject({ code: "CONFLICT" })
  })
}

test("refuses held Book drift and duplicate owning operations before repository read", async () => {
  const f = await fixture()
  f.input.book = { ...f.input.book, id: "foreign-book" }
  await expect(f.read()).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.calls()).toBe(0)
  f.input.book = f.original.book
  const owner = f.input.owners[0]
  if (!owner) throw new Error("Missing owner fixture")
  f.input.owners.push(owner)
  await expect(f.read()).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.calls()).toBe(0)
})

test("saved source and exact cost corruption reject independently of current pool", async () => {
  const f = await fixture()
  const [source] = await f.read()
  if (!source?.movement.valuationEvent) throw new Error("Missing event")
  source.movement.valuationEvent.sourceCostMinor = 51n
  expect(() => assertSavedReservationCommitSource(source)).toThrow(
    "immutable source",
  )
  source.movement.valuationEvent.sourceCostMinor = 50n
  source.movement.valuationEvent.sourceId = "foreign-reservation"
  expect(() => assertSavedReservationCommitSource(source)).toThrow(
    "immutable source",
  )
})
