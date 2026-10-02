import { describe, expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import {
  closeoutFixture,
  closeoutInput,
  effectiveAt,
  closeoutValuationFixture as fixture,
} from "./inventory-closeout-test-fixture"
import { recordInventoryCloseoutValuationInTransaction as record } from "./valuation-closeouts"

const decimal = (value: string) => new Prisma.Decimal(value)

describe("closeout carrying cost", () => {
  test("allocates original weighted cost and full residual in packaged and shared pools", async () => {
    for (const packaged of [false, true]) {
      const f = fixture({ packaged })
      const events = await record(f.tx, closeoutInput)
      expect(events).toHaveLength(1)
      expect(events?.[0]?.sourceKind).toBe("INVENTORY_CLOSEOUT")
      expect(events?.[0]?.sourceId).toBe("closeout")
      expect(events?.[0]?.sourceCostMinor).toBe(BigInt(25))
      expect(events?.[0]?.valueDeltaMinor).toBe(BigInt(-25))
      expect(events?.[0]?.valueAfterMinor).toBe(BigInt(76))
      const full = fixture({ packaged })
      full.line.declaredQuantity = decimal("0")
      full.line.varianceQuantity = decimal("-4")
      full.movement.enteredQuantity = decimal("4")
      full.movement.resultingOnHandQuantity = decimal("0")
      full.movement.signedCanonicalEffect = decimal(packaged ? "-48" : "-4")
      full.balance.onHandQuantity = decimal("0")
      expect((await record(full.tx, closeoutInput))?.[0]?.sourceCostMinor).toBe(
        BigInt(101),
      )
      expect(full.pool()?.valueMinor).toBe(BigInt(0))
      const half = fixture({ packaged })
      half.line.declaredQuantity = decimal("2")
      half.line.varianceQuantity = decimal("-2")
      half.movement.enteredQuantity = decimal("2")
      half.movement.resultingOnHandQuantity = decimal("2")
      half.movement.signedCanonicalEffect = decimal(packaged ? "-24" : "-2")
      half.balance.onHandQuantity = decimal("2")
      expect((await record(half.tx, closeoutInput))?.[0]?.sourceCostMinor).toBe(
        BigInt(50),
      )
      expect(half.pool()?.valueMinor).toBe(BigInt(51))
    }
  })
  test("gains stay UNKNOWN, including known-zero-before without invented gain value", async () => {
    const gain = fixture({ gain: true })
    const event = (await record(gain.tx, closeoutInput))?.[0]
    expect(event?.sourceCostMinor).toBeNull()
    expect(event?.valueBeforeMinor).toBe(BigInt(101))
    expect(event?.valueAfterMinor).toBeNull()
    expect(event?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
    const empty = fixture({ gain: true, noPool: true })
    empty.line.expectedQuantity = decimal("0")
    empty.line.declaredQuantity = decimal("1")
    empty.movement.previousOnHandQuantity = decimal("0")
    empty.movement.resultingOnHandQuantity = decimal("1")
    empty.balance.onHandQuantity = decimal("1")
    const first = (await record(empty.tx, closeoutInput))?.[0]
    expect(first?.valueBeforeMinor).toBe(BigInt(0))
    expect(first?.sourceCostMinor).toBeNull()
    expect(first?.valueAfterMinor).toBeNull()
  })
  test("missing cost, movement gaps and prior UNKNOWN remain explicit", async () => {
    const missing = fixture({ noPool: true })
    const missingEvent = (await record(missing.tx, closeoutInput))?.[0]
    expect(missingEvent?.sourceCostMinor).toBeNull()
    expect(missingEvent?.unknownReason).toBe("MISSING_OPENING_COST")
    const gap = fixture()
    gap.initialPool.lastMovementCount = BigInt(0)
    expect((await record(gap.tx, closeoutInput))?.[0]?.unknownReason).toBe(
      "UNCAPTURED_MOVEMENTS",
    )
    const prior = fixture()
    prior.initialPool.valueMinor = null
    prior.initialPool.unknownReason = "PRIOR_UNKNOWN_COST"
    expect((await record(prior.tx, closeoutInput))?.[0]?.unknownReason).toBe(
      "PRIOR_UNKNOWN_COST",
    )
  })
  test("complete saved replay precedes mutable quantity, revision, status and period gates", async () => {
    const f = fixture()
    const first = await record(f.tx, closeoutInput)
    f.balance.revision = 50
    f.balance.onHandQuantity = decimal("77")
    f.closeout.status = "CANCELLED"
    f.book.closedThrough = effectiveAt
    f.operation._count.corrections = 1
    expect(await record(f.tx, closeoutInput)).toEqual(first)
    expect(f.writes()).toBe(2)
    expect(f.reads()).toBe(2)
    const saved = f.movement.valuationEvent
    if (!saved) throw new Error("Missing event")
    saved.sourceCostMinor = BigInt(26)
    await expect(record(f.tx, closeoutInput)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.writes()).toBe(2)
  })
  test("zero lines and no-Book sources create no financial writes", async () => {
    const zero = fixture({ zero: true })
    zero.book.closedThrough = effectiveAt
    expect(await record(zero.tx, closeoutInput)).toEqual([])
    expect(zero.writes()).toBe(0)
    expect(zero.reads()).toBe(0)
    const noBook = fixture({ noBook: true })
    expect(await record(noBook.tx, closeoutInput)).toBeNull()
    expect(noBook.writes()).toBe(0)
  })
  test("fresh closed, stale, corrected, chronology and pool-bound sources reject", async () => {
    const probes = [
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.book.closedThrough = effectiveAt
        },
        code: "CLOSED_PERIOD",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.balance.revision = 9
        },
        code: "CONFLICT",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.operation._count.corrections = 1
        },
        code: "CONFLICT",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.initialPool.latestEffectiveAt = new Date("2026-10-02T10:00:00Z")
        },
        code: "INVALID_JOURNAL",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.initialPool.lastSequence = BigInt("9223372036854775807")
        },
        code: "CONFLICT",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.initialPool.valueMinor = BigInt("9223372036854775808")
        },
        code: "CONFLICT",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.initialPool.lastStockRevision = 5
        },
        code: "CONFLICT",
      },
      {
        mutate: (f: ReturnType<typeof fixture>) => {
          f.initialPool.tenantId = "foreign"
        },
        code: "CONFLICT",
      },
    ]
    for (const probe of probes) {
      const f = fixture()
      probe.mutate(f)
      await expect(record(f.tx, closeoutInput)).rejects.toMatchObject({
        code: probe.code,
      })
      expect(f.writes()).toBe(0)
    }
  })
  test("a partially saved multi-line closeout cannot be completed from current stock", async () => {
    const f = fixture()
    await record(f.tx, closeoutInput)
    const another = closeoutFixture()
    another.parent.id = "root-2"
    another.parent.variantId = "variant-2"
    another.balance.id = "balance-2"
    another.balance.parentBalanceSourceId = "root-2"
    another.balance.variantId = "variant-2"
    another.balance.variant.id = "variant-2"
    another.line.id = "line-2"
    another.line.balanceSourceId = "balance-2"
    another.movement.id = "movement-2"
    another.movement.balanceSourceId = "balance-2"
    f.closeout.lines.push(another.line)
    f.operation.movements.push(another.movement)
    await expect(record(f.tx, closeoutInput)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(f.writes()).toBe(2)
    expect(f.reads()).toBe(2)
  })
})
