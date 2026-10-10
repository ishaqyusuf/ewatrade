import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { previewOrdinaryAdjustmentCost } from "./preview-ordinary-adjustment-cost"
const input = { tenantId: "tenant", currencyCode: "NGN", balanceSourceId: "balance", canonicalBefore: "10", canonicalQuantity: "2", direction: "decrease" as const, effectiveAt: new Date() }
function fixture(count = 1) {
  return {
    financeBook: { findUnique: async () => ({ id: "book", startsAt: new Date("2020-01-01"), closedThrough: null }) },
    financeInventoryPool: { findUnique: async () => ({ tenantId: "tenant", bookId: "book", balanceSourceId: "balance", quantity: new Prisma.Decimal("10"), valueMinor: 1000n, unknownReason: null, lastMovementCount: 1n, lastSequence: 1n, lastStockRevision: 1, latestEffectiveAt: new Date("2020-01-02") }) },
    stockMovement: { count: async () => count },
  } as unknown as Prisma.TransactionClient
}
test("ordinary decrease projects known weighted-average cost", async () => {
  expect(await previewOrdinaryAdjustmentCost(fixture(), input)).toMatchObject({ valueBeforeMinor: "1000", valueAfterMinor: "800", valueDeltaMinor: "-200", unknownReason: null })
})
test("missing valuation continuity and positive changes stay unknown", async () => {
  expect(await previewOrdinaryAdjustmentCost(fixture(2), input)).toMatchObject({ valueAfterMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
  expect(await previewOrdinaryAdjustmentCost(fixture(), { ...input, direction: "increase" })).toMatchObject({ valueBeforeMinor: "1000", valueAfterMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
})
