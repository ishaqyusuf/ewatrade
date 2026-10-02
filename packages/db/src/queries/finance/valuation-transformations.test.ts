import { describe, expect, test } from "bun:test"
import { FinanceError } from "./rules"
import { recordPackagedTransformationValuationInTransaction } from "./valuation-transformations"

import {
  decimal,
  transformationFixture as fixture,
} from "./inventory-transformation-test-fixture"

async function record(fixtureValue: ReturnType<typeof fixture>) {
  return recordPackagedTransformationValuationInTransaction(fixtureValue.tx, {
    tenantId: "tenant-1",
    stockOperationId: "operation-1",
  })
}

describe("packaged transformation valuation", () => {
  test("moves the exact weighted-average residual between known pools", async () => {
    const f = fixture()
    const result = await record(f)
    expect(result?.sourceEvent.valueDeltaMinor).toBe(BigInt(-50))
    expect(result?.sourceEvent.valueAfterMinor).toBe(BigInt(51))
    expect(result?.targetEvent.valueDeltaMinor).toBe(BigInt(50))
    expect(result?.targetEvent.valueAfterMinor).toBe(BigInt(59))
    expect(f.state.pools.get("source-balance")?.valueMinor).toBe(BigInt(51))
    expect(f.state.pools.get("target-balance")?.valueMinor).toBe(BigInt(59))
  })

  test("replays immutable paired events after later physical changes", async () => {
    const f = fixture({ existing: true, currentBalanceChanged: true })
    const result = await record(f)
    expect(result?.sourceEvent.id).toBe("source-event")
    expect(result?.targetEvent.id).toBe("target-event")
    expect(f.state.eventCreateCount).toBe(0)
  })

  test("keeps known source cost while an unknown target remains unknown", async () => {
    const f = fixture({
      targetPool: {
        id: "target-pool",
        quantity: decimal("3"),
        valueMinor: null,
        unknownReason: "MISSING_OPENING_COST",
        lastMovementCount: BigInt(1),
        lastSequence: BigInt(3),
        latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    })
    const result = await record(f)
    expect(result?.sourceEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.valueBeforeMinor).toBeNull()
    expect(result?.targetEvent.valueDeltaMinor).toBeNull()
    expect(result?.targetEvent.valueAfterMinor).toBeNull()
    expect(result?.targetEvent.unknownReason).toBe("MISSING_OPENING_COST")
  })

  test("makes a known target unknown when the source carrying cost is unknown", async () => {
    const f = fixture({ sourcePool: null })
    const result = await record(f)
    expect(result?.sourceEvent.sourceCostMinor).toBeNull()
    expect(result?.sourceEvent.unknownReason).toBe("MISSING_OPENING_COST")
    expect(result?.targetEvent.valueBeforeMinor).toBe(BigInt(9))
    expect(result?.targetEvent.sourceCostMinor).toBeNull()
    expect(result?.targetEvent.valueAfterMinor).toBeNull()
    expect(result?.targetEvent.unknownReason).toBe("MISSING_OPENING_COST")
  })

  test("creates a known zero-valued pool for the first movement from empty stock", async () => {
    const f = fixture({
      targetPool: null,
      targetEmpty: true,
      count: { source: 2, target: 1 },
    })
    const result = await record(f)
    expect(result?.targetEvent.valueBeforeMinor).toBe(BigInt(0))
    expect(result?.targetEvent.valueAfterMinor).toBe(BigInt(50))
    expect(f.state.pools.get("target-balance")?.valueMinor).toBe(BigInt(50))
  })

  test("keeps gaps unknown, and permits no-Book stock transformations", async () => {
    const gap = fixture({
      targetPool: null,
      targetEmpty: true,
      count: { source: 2, target: 2 },
    })
    const gapResult = await record(gap)
    expect(gapResult?.targetEvent.valueBeforeMinor).toBeNull()
    expect(gapResult?.targetEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")

    const noBook = fixture({ book: null })
    expect(await record(noBook)).toBeNull()
    expect(noBook.state.eventCreateCount).toBe(0)
  })

  test("rejects cross-variant endpoints and corrupted saved event pairs", async () => {
    const wrongScope = fixture({ otherVariant: true })
    await expect(record(wrongScope)).rejects.toBeInstanceOf(FinanceError)

    const corruptedPair = fixture({ existing: true })
    const corruptedSavedTarget = corruptedPair.targetMovement.valuationEvent
    if (corruptedSavedTarget) corruptedSavedTarget.valueDeltaMinor = BigInt(49)
    await expect(record(corruptedPair)).rejects.toBeInstanceOf(FinanceError)

    const partialPair = fixture({ existing: "source" })
    await expect(record(partialPair)).rejects.toBeInstanceOf(FinanceError)

    const negativeTargetValue = fixture({ existing: true })
    const negativeSavedTarget =
      negativeTargetValue.targetMovement.valuationEvent
    if (negativeSavedTarget) {
      negativeSavedTarget.valueBeforeMinor = BigInt(-1)
      negativeSavedTarget.valueAfterMinor = BigInt(49)
    }
    await expect(record(negativeTargetValue)).rejects.toBeInstanceOf(
      FinanceError,
    )
  })
})
