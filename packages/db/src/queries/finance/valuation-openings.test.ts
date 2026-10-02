import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { resolveInventoryOpeningSourceInTransaction as resolve } from "./inventory-opening-source"
import {
  openingDate,
  openingFixture,
  openingInput,
} from "./inventory-opening-test-fixture"
import { recordInventoryOpeningValuationInTransaction as record } from "./valuation-openings"

const decimal = (value: string) => new Prisma.Decimal(value)

test("opening receipt owns immutable Catalog/graduation roots without depending on a renamed variant key", async () => {
  for (const graduation of [false, true]) {
    const f = openingFixture({ graduation })
    const source = await resolve(f.tx, {
      ...openingInput,
      expectedBookId: "book",
    })
    expect(source.sources).toHaveLength(1)
    expect(source.sourceKind).toBe(
      graduation ? "GRADUATION_OPENING" : "CATALOG_OPENING",
    )
    expect(source.sources[0]?.quantity).toBe("4")
    f.balance.onHandQuantity = decimal("2")
    f.balance.revision = 5
    f.operation._count.corrections = 1
    expect((await resolve(f.tx, openingInput)).sources).toHaveLength(1)
  }
})

test("foreign, forged, competing, reversed, duplicate and malformed opening provenance is refused before Book access", async () => {
  const probes: Array<(f: ReturnType<typeof openingFixture>) => void> = [
    (f) => {
      f.receipt.tenantId = "foreign"
    },
    (f) => {
      f.item.tenantId = "foreign"
    },
    (f) => {
      f.receipt.commandType = "UPDATE_ITEM"
    },
    (f) => {
      f.operation.payloadHash = "b".repeat(64)
    },
    (f) => {
      f.operation.clientOperationId = "unrelated"
    },
    (f) => {
      f.operation.source = "inventory"
    },
    (f) => {
      f.operation.type = "ADJUSTMENT"
    },
    (f) => {
      f.operation._count.finalizedCloseouts = 1
    },
    (f) => {
      f.operation.committedReservation = { id: "reservation" }
    },
    (f) => {
      f.operation.effectiveAt = new Date("invalid")
    },
    (f) => {
      f.balance.custodyType = "STAFF"
    },
    (f) => {
      f.balance.parentBalanceSourceId = "parent"
    },
    (f) => {
      f.balance.variant.catalogItemId = "foreign"
    },
    (f) => {
      f.unit.configurationVersion.productId = "foreign"
    },
    (f) => {
      f.unit.stockBehavior = "PACKAGED_STOCK"
    },
    (f) => {
      f.unit.factor = decimal("12")
    },
    (f) => {
      f.movement.previousOnHandQuantity = decimal("1")
    },
    (f) => {
      f.movement.signedCanonicalEffect = decimal("3")
    },
    (f) => {
      f.movement.reversalOfMovementId = "other"
    },
    (f) => {
      f.movement.purchaseReceipt = { id: "receipt" }
    },
    (f) => {
      f.operations.push(f.operation)
    },
    (f) => {
      f.operation.movements.push(f.movement)
    },
    (f) => {
      f.movement.enteredQuantity = decimal("0.0001")
      f.movement.resultingOnHandQuantity = decimal("0.0001")
      f.movement.signedCanonicalEffect = decimal("0.0001")
    },
  ]
  for (const mutate of probes) {
    const f = openingFixture()
    mutate(f)
    await expect(resolve(f.tx, openingInput)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.bookReads()).toBe(0)
    expect(f.writes()).toBe(0)
  }
})

test("held Book must exist and match the opening Store's currency and Tenant", async () => {
  const absent = openingFixture({ noBook: true })
  expect((await resolve(absent.tx, openingInput)).book).toBeNull()
  await expect(
    resolve(absent.tx, { ...openingInput, expectedBookId: "book" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const foreign = openingFixture()
  foreign.book.currencyCode = "USD"
  await expect(resolve(foreign.tx, openingInput)).rejects.toMatchObject({
    code: "CONFLICT",
  })
})

test("receipt persistence after the post-lock owning date does not invalidate a scoped opening", async () => {
  const f = openingFixture()
  f.receipt.createdAt = new Date(f.operation.effectiveAt.getTime() + 1000)
  const source = await resolve(f.tx, openingInput)
  expect(source.sources).toHaveLength(1)
  expect(source.sources[0]?.operation.effectiveAt).toEqual(
    f.operation.effectiveAt,
  )
  await record(f.tx, openingInput)
  expect(f.events[0]?.effectiveAt).toEqual(f.operation.effectiveAt)
  expect(f.events[0]?.unknownReason).toBe("MISSING_OPENING_COST")
})

test("positive fresh openings preserve exact quantity and explicit missing cost without an invented value or journal", async () => {
  for (const graduation of [false, true]) {
    const f = openingFixture({ graduation })
    const event = (await record(f.tx, openingInput))?.[0]
    expect(event).toMatchObject({
      sourceId: "receipt",
      stockOperationId: "operation",
      stockMovementId: "movement",
      sequence: BigInt(1),
      kind: "OPENING",
      valueBeforeMinor: BigInt(0),
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: null,
      unknownReason: "MISSING_OPENING_COST",
      effectiveAt: openingDate,
      actorUserId: "actor",
    })
    expect(event?.quantityAfter.toFixed()).toBe("4")
    expect(f.pools[0]?.valueMinor).toBeNull()
    expect(f.pools[0]?.lastStockRevision).toBe(0)
    expect(f.pools[0]?.lastMovementCount).toBe(BigInt(1))
    expect(f.writes()).toBe(2)
  }
})

test("zero graduation registers real zero movement history; Catalog zero and Service empty sources have no events", async () => {
  const zero = openingFixture({ graduation: true, zero: true })
  const event = (await record(zero.tx, openingInput))?.[0]
  expect(event).toMatchObject({
    valueBeforeMinor: BigInt(0),
    valueAfterMinor: BigInt(0),
    valueDeltaMinor: BigInt(0),
    sourceCostMinor: BigInt(0),
    unknownReason: null,
  })
  expect(zero.pools[0]?.lastMovementCount).toBe(BigInt(1))
  expect(zero.pools[0]?.quantity).toBe("0")
  await expect(
    record(openingFixture({ zero: true }).tx, openingInput),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  for (const service of [false, true]) {
    const empty = openingFixture({ empty: true })
    if (service) {
      empty.item.kind = "SERVICE"
      empty.item.product = null
    }
    expect(await record(empty.tx, openingInput)).toEqual([])
    expect(empty.reads()).toBe(0)
    expect(empty.writes()).toBe(0)
  }
})

test("no-Book source preserves physical compatibility without financial writes", async () => {
  const f = openingFixture({ noBook: true })
  expect(await record(f.tx, openingInput)).toBeNull()
  expect(f.reads()).toBe(0)
  expect(f.writes()).toBe(0)
})

test("fresh period, revision, quantity, reservation, correction, gap and existing-pool guards precede writes", async () => {
  const probes: Array<{
    code: string
    mutate: (f: ReturnType<typeof openingFixture>) => void
  }> = [
    {
      code: "CLOSED_PERIOD",
      mutate: (f) => {
        f.book.closedThrough = openingDate
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.balance.revision = 1
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.balance.onHandQuantity = decimal("3")
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.balance.reservedQuantity = decimal("1")
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.operation._count.corrections = 1
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.setCount(2)
      },
    },
    {
      code: "CONFLICT",
      mutate: (f) => {
        f.pools.push({ id: "existing" })
      },
    },
  ]
  for (const probe of probes) {
    const f = openingFixture()
    probe.mutate(f)
    await expect(record(f.tx, openingInput)).rejects.toMatchObject({
      code: probe.code,
    })
    expect(f.writes()).toBe(0)
  }
})

test("saved exact opening proof precedes later stock, correction and closed period; forged saved costs reject", async () => {
  for (const zero of [false, true]) {
    const f = openingFixture({ graduation: true, zero })
    const original = await record(f.tx, openingInput)
    f.balance.revision = 22
    f.balance.onHandQuantity = decimal("999")
    f.operation._count.corrections = 1
    f.book.closedThrough = openingDate
    expect(await record(f.tx, openingInput)).toEqual(original)
    expect(f.writes()).toBe(2)
    expect(f.reads()).toBe(2)
    const saved = f.movement.valuationEvent
    if (!saved) throw new Error("Missing event")
    saved.sourceCostMinor = BigInt(10)
    await expect(record(f.tx, openingInput)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.writes()).toBe(2)
  }
})

test("multiple variant roots batch their histories/pools/events and a partial saved set never backfills", async () => {
  const f = openingFixture()
  const other = openingFixture()
  other.operation.id = "second-operation"
  other.operation.clientOperationId = "create:opening-stock:other"
  other.movement.id = "second-movement"
  other.movement.operationId = "second-operation"
  other.balance.id = "second-balance"
  other.balance.variantId = "second-variant"
  other.balance.variant.id = "second-variant"
  other.movement.balanceSourceId = "second-balance"
  f.operations.push(other.operation)
  expect(await record(f.tx, openingInput)).toHaveLength(2)
  expect(f.writes()).toBe(2)
  expect(f.reads()).toBe(2)
  other.movement.valuationEvent = null
  await expect(record(f.tx, openingInput)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(f.writes()).toBe(2)
})
