import { describe, expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordReservationCommitValuationInTransaction as record } from "./valuation-reservations"

import {
  effectiveAt,
  reservationCommitFixture as fixture,
  reservationCommitTestInput as input,
} from "./inventory-reservation-test-fixture"

const decimal = (value: string) => new Prisma.Decimal(value)

describe("standalone reservation carrying cost", () => {
  test("uses original weighted allocation and full residual without a sales journal", async () => {
    const f = fixture()
    const result = await record(f.tx, input)
    expect(result?.sourceCostMinor).toBe(BigInt(50))
    expect(result?.valueAfterMinor).toBe(BigInt(51))
    expect(result?.sourceKind).toBe("STOCK_RESERVATION_COMMIT")
    expect(result?.sourceId).toBe("reservation")
    expect(result?.kind).toBe("ISSUE")
    expect(f.writes()).toBe(2)
    const full = fixture({ quantity: "4" })
    expect((await record(full.tx, input))?.sourceCostMinor).toBe(BigInt(101))
    expect(full.getPool()?.valueMinor).toBe(BigInt(0))
  })

  test("converts packaged and alternate shared units from retained snapshots", async () => {
    for (const packaged of [false, true]) {
      const f = fixture({ packaged, factor: "12", quantity: "0.5" })
      const result = await record(f.tx, input)
      expect(result?.canonicalEffect.toFixed()).toBe("-6")
      expect(result?.quantityBefore.toFixed()).toBe("48")
      expect(result?.quantityAfter.toFixed()).toBe("42")
      expect(result?.sourceCostMinor).toBe(BigInt(250))
      expect(f.getPool()?.valueMinor).toBe(BigInt(1753))
    }
  })

  test("missing or incomplete movement history remains UNKNOWN", async () => {
    const missing = fixture({ noPool: true })
    const unknown = await record(missing.tx, input)
    expect(unknown?.sourceCostMinor).toBeNull()
    expect(unknown?.valueBeforeMinor).toBeNull()
    expect(unknown?.valueAfterMinor).toBeNull()
    expect(unknown?.unknownReason).toBe("MISSING_OPENING_COST")
    const gap = fixture()
    gap.initialPool.lastMovementCount = BigInt(0)
    expect((await record(gap.tx, input))?.unknownReason).toBe(
      "UNCAPTURED_MOVEMENTS",
    )
    const prior = fixture()
    prior.initialPool.valueMinor = null
    prior.initialPool.unknownReason = "PRIOR_UNKNOWN_COST"
    expect((await record(prior.tx, input))?.sourceCostMinor).toBeNull()
  })

  test("saved replay precedes current status, quantities, revisions and closed dates", async () => {
    const f = fixture()
    const first = await record(f.tx, input)
    f.reservation.status = "RELEASED"
    f.balance.revision = 30
    f.balance.onHandQuantity = decimal("77")
    f.book.closedThrough = effectiveAt
    f.operation._count.corrections = 1
    const replay = await record(f.tx, { ...input, expectedStockRevision: -1 })
    expect(replay?.id).toBe(first?.id)
    expect(f.writes()).toBe(2)
    expect(f.counts()).toBe(1)
  })

  test("source ownership, foreign scope and immutable snapshots reject before writes", async () => {
    const probes = [
      (f: ReturnType<typeof fixture>) => {
        f.reservation.commercialOrderLineId = "order-line"
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation.committedOperationId = "different"
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation.committedAt = new Date("2026-09-14T12:00:00Z")
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation.offering.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.balance.product.catalogItem.tenantId = "foreign"
      },
      (f: ReturnType<typeof fixture>) => {
        f.balance.variant.catalogItemId = "other"
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.configurationVersionId = "other"
      },
      (f: ReturnType<typeof fixture>) => {
        f.operation._count.productFulfillments = 1
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation._count.productFulfillments = 1
      },
    ]
    for (const mutate of probes) {
      const f = fixture()
      mutate(f)
      await expect(record(f.tx, input)).rejects.toBeInstanceOf(FinanceError)
      expect(f.writes()).toBe(0)
    }
  })

  test("rejects fresh closed/chronology/pool bounds while no-Book adds no finance writes", async () => {
    const closed = fixture()
    closed.book.closedThrough = effectiveAt
    await expect(record(closed.tx, input)).rejects.toMatchObject({
      code: "CLOSED_PERIOD",
    })
    expect(closed.writes()).toBe(0)
    const late = fixture()
    late.initialPool.latestEffectiveAt = new Date("2026-10-01T12:00:00Z")
    await expect(record(late.tx, input)).rejects.toMatchObject({
      code: "INVALID_JOURNAL",
    })
    expect(late.writes()).toBe(0)
    const ahead = fixture()
    ahead.initialPool.lastStockRevision = 8
    await expect(record(ahead.tx, input)).rejects.toBeInstanceOf(FinanceError)
    expect(ahead.writes()).toBe(0)
    const overflow = fixture()
    overflow.initialPool.valueMinor = BigInt("9223372036854775808")
    await expect(record(overflow.tx, input)).rejects.toBeInstanceOf(
      FinanceError,
    )
    expect(overflow.writes()).toBe(0)
    const noBook = fixture({ noBook: true })
    expect(await record(noBook.tx, input)).toBeNull()
    expect(noBook.writes()).toBe(0)
  })

  test("forged saved source/cost cannot turn replay into a backfill", async () => {
    const f = fixture()
    await record(f.tx, input)
    if (!f.movement.valuationEvent) throw new Error("Missing saved event")
    f.movement.valuationEvent.sourceId = "other-reservation"
    await expect(record(f.tx, input)).rejects.toBeInstanceOf(FinanceError)
    expect(f.writes()).toBe(2)
    f.movement.valuationEvent.sourceId = "reservation"
    f.movement.valuationEvent.sourceCostMinor = BigInt(51)
    await expect(record(f.tx, input)).rejects.toBeInstanceOf(FinanceError)
    expect(f.writes()).toBe(2)
  })

  test("fresh valuation must use the exact Book held by coordination", async () => {
    for (const noBook of [false, true]) {
      const f = fixture({ noBook })
      await expect(
        record(f.tx, { ...input, expectedBookId: "different-book" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(f.writes()).toBe(0)
      expect(f.counts()).toBe(0)
    }
  })

  test("invalid retained decimal quantities return domain conflicts before writes", async () => {
    const probes = [
      (f: ReturnType<typeof fixture>) => {
        f.reservation.enteredQuantity = decimal("0.0001")
        f.movement.enteredQuantity = decimal("0.0001")
      },
      (f: ReturnType<typeof fixture>) => {
        f.reservation.unitFactorSnapshot = decimal("-1")
        f.movement.unitFactorSnapshot = decimal("-1")
        f.unit.factor = decimal("-1")
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.previousOnHandQuantity = decimal("1")
      },
      (f: ReturnType<typeof fixture>) => {
        f.movement.resultingOnHandQuantity = decimal("-1")
      },
    ]
    for (const mutate of probes) {
      const f = fixture()
      mutate(f)
      await expect(record(f.tx, input)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(f.writes()).toBe(0)
    }
  })
})
