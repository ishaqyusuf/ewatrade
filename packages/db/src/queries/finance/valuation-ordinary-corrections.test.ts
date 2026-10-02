import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordOrdinaryStockCorrectionValuationInTransaction } from "./valuation-ordinary-corrections"

import {
  book,
  decimal,
  ordinaryCorrectionFixture as fixture,
  persistedPair,
  requirePair,
} from "./inventory-ordinary-correction-test-fixture"

describe("ordinary stock correction valuation", () => {
  test("original or correction reservation ownership blocks generic cost restoration", async () => {
    for (const originalOwner of [true, false]) {
      const f = fixture()
      const operation = originalOwner ? f.correction.correctionOf : f.correction
      operation.committedReservation = { id: "reservation" }
      await expect(
        recordOrdinaryStockCorrectionValuationInTransaction(f.tx, {
          tenantId: "tenant-1",
          stockOperationId: "correction-operation",
          expectedStockRevision: 3,
        }),
      ).rejects.toBeInstanceOf(FinanceError)
      expect(f.savedEvents).toHaveLength(0)
      expect(f.getPool()).toBeNull()
    }
  })
  test("restores original issue cost and allocates replacement withdrawal in packaged canonical units", async () => {
    const state = fixture({ packaged: true })
    const result = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(result?.inverseEvent.sourceCostMinor).toBe(BigInt(240))
    expect(result?.inverseEvent.valueAfterMinor).toBe(BigInt(720))
    expect(result?.replacementEvent.canonicalEffect.toFixed()).toBe("-12")
    expect(result?.replacementEvent.sourceCostMinor).toBe(BigInt(120))
    expect(result?.replacementEvent.valueAfterMinor).toBe(BigInt(600))
    expect(state.getPool()?.quantity).toBe("60")
  })

  test("legacy original without registered valuation stays unknown and does not infer current cost", async () => {
    const state = fixture({ legacy: true })
    const result = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(result?.inverseEvent.sourceCostMinor).toBeNull()
    expect(result?.inverseEvent.valueBeforeMinor).toBeNull()
    expect(result?.replacementEvent.sourceCostMinor).toBeNull()
    expect(result?.replacementEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
    expect(state.getPool()?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
  })

  test("retains immutable restored issue cost when current pool value is unknown", async () => {
    const state = fixture({ unknownPool: true })
    const result = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(result?.inverseEvent.sourceCostMinor).toBe(BigInt(200))
    expect(result?.inverseEvent.valueBeforeMinor).toBeNull()
    expect(result?.inverseEvent.valueDeltaMinor).toBeNull()
    expect(result?.inverseEvent.valueAfterMinor).toBeNull()
    expect(result?.inverseEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
    expect(result?.replacementEvent.sourceCostMinor).toBeNull()
  })

  test("a movement-history gap keeps both correction legs unknown", async () => {
    const state = fixture({ historyGap: true })
    const result = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(result?.inverseEvent.sourceCostMinor).toBe(BigInt(200))
    expect(result?.inverseEvent.valueAfterMinor).toBeNull()
    expect(result?.replacementEvent.sourceCostMinor).toBeNull()
    expect(result?.replacementEvent.valueAfterMinor).toBeNull()
  })

  test("replays a saved known-cost restoration into an unknown pool after current state changes", async () => {
    const state = fixture({ unknownPool: true })
    const first = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    const saved = persistedPair(state.savedEvents)
    const [inverse, replacement] = requirePair(saved)
    expect(first?.inverseEvent.sourceCostMinor).toBe(BigInt(200))
    const inverseMovement = state.correction.movements[0]
    if (!inverseMovement) throw new Error("Expected inverse movement")
    inverseMovement.valuationEvent = inverse
    state.replacementMovement.valuationEvent = replacement
    state.changeCurrentState()
    const replay = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(replay?.inverseEvent.id).toBe(first?.inverseEvent.id)
    expect(replay?.replacementEvent.id).toBe(first?.replacementEvent.id)
  })

  test("replays a legacy unknown pair without requiring a current pool", async () => {
    const state = fixture({ legacy: true })
    const first = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    const [inverse, replacement] = requirePair(
      persistedPair(state.savedEvents, "new-pool"),
    )
    const inverseMovement = state.correction.movements[0]
    if (!inverseMovement) throw new Error("Expected inverse movement")
    inverseMovement.valuationEvent = inverse
    state.replacementMovement.valuationEvent = replacement
    state.changeCurrentState()
    const replay = await recordOrdinaryStockCorrectionValuationInTransaction(
      state.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    expect(replay?.inverseEvent.id).toBe(first?.inverseEvent.id)
    expect(replay?.replacementEvent.id).toBe(first?.replacementEvent.id)
  })

  test("rejects incorrect original source and correction source links on replay", async () => {
    const wrongOriginal = fixture()
    const originalEvent = wrongOriginal.originalMovement.valuationEvent
    if (!originalEvent) throw new Error("Expected registered original event")
    originalEvent.sourceId = "other-operation"
    await expect(
      recordOrdinaryStockCorrectionValuationInTransaction(wrongOriginal.tx, {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const wrongCorrection = fixture()
    const first = await recordOrdinaryStockCorrectionValuationInTransaction(
      wrongCorrection.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    const [inverse, replacement] = requirePair(
      persistedPair(wrongCorrection.savedEvents),
    )
    ;(replacement as { sourceId: string }).sourceId = "other-correction"
    const inverseMovement = wrongCorrection.correction.movements[0]
    if (!inverseMovement) throw new Error("Expected inverse movement")
    inverseMovement.valuationEvent = inverse
    wrongCorrection.replacementMovement.valuationEvent = replacement
    await expect(
      recordOrdinaryStockCorrectionValuationInTransaction(wrongCorrection.tx, {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
    expect(first?.replacementEvent.id).toBeTruthy()

    const wrongReversal = fixture()
    await recordOrdinaryStockCorrectionValuationInTransaction(
      wrongReversal.tx,
      {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      },
    )
    const [replayedInverse, replayedReplacement] = requirePair(
      persistedPair(wrongReversal.savedEvents),
    )
    wrongReversal.replacementMovement.valuationEvent = replayedReplacement
    wrongReversal.replacementMovement.reversalOfMovementId = "original-movement"
    const savedInverse = wrongReversal.correction.movements[0]
    if (!savedInverse) throw new Error("Expected inverse movement")
    savedInverse.valuationEvent = replayedInverse
    await expect(
      recordOrdinaryStockCorrectionValuationInTransaction(wrongReversal.tx, {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("rejects a partial correction valuation pair", async () => {
    const state = fixture()
    const correction = await (
      state.tx as unknown as {
        stockOperation: { findFirst: () => Promise<Record<string, unknown>> }
      }
    ).stockOperation.findFirst()
    const movement = (correction.movements as Array<Record<string, unknown>>)[0]
    if (!movement) throw new Error("Expected inverse movement")
    movement.valuationEvent = { id: "partial" }
    await expect(
      recordOrdinaryStockCorrectionValuationInTransaction(state.tx, {
        tenantId: "tenant-1",
        stockOperationId: "correction-operation",
        expectedStockRevision: 3,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })
})
