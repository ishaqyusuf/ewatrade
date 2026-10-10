import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { previewOrdinaryCorrectionCost } from "./preview-ordinary-correction-cost"
const input = { tenantId: "tenant", storeId: "store", currencyCode: "NGN", operationId: "operation", movementId: "movement", balanceSourceId: "balance", stockRevision: 2, originalEffectNegative: true, inverseCanonicalBefore: "8", originalCanonical: "2", replacementEffect: "-3", inverseAfterCanonical: "10", replacementCanonical: "3" }
function fixture(stale = false) {
  return {
    financeBook: { findUnique: async () => ({ id: "book", startsAt: new Date("2020-01-01"), closedThrough: null }) },
    financeInventoryPool: { findUnique: async () => ({ id: "pool", tenantId: "tenant", bookId: "book", balanceSourceId: "balance", lastStockRevision: 2, lastMovementCount: stale ? 1n : 2n, lastSequence: 2n, latestEffectiveAt: new Date("2020-01-02"), quantity: new Prisma.Decimal("8"), valueMinor: 800n, unknownReason: null }) },
    financeInventoryValuationEvent: { findFirst: async () => ({ poolId: "pool", sequence: 1n, sourceCostMinor: 200n }) },
    stockMovement: { count: async () => 2 },
  } as unknown as Prisma.TransactionClient
}
test("cost preview projects known correction without writes", async () => {
  expect(await previewOrdinaryCorrectionCost(fixture(), input)).toMatchObject({ valueBeforeMinor: "800", valueAfterMinor: "700", valueDeltaMinor: "-100", unknownReason: null })
})
test("unaccounted stock movements make cost unknown", async () => {
  expect(await previewOrdinaryCorrectionCost(fixture(true), input)).toMatchObject({ valueBeforeMinor: null, valueAfterMinor: null, valueDeltaMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
})

test("future valuation events and mismatched cost state fail closed", async () => {
  for (const change of [
    { latestEffectiveAt: new Date("2099-01-01") },
    { valueMinor: 800n, unknownReason: "UNCAPTURED_MOVEMENTS" },
    { lastStockRevision: 3 },
    { lastSequence: 9223372036854775806n },
  ]) {
    const tx = fixture()
    const pool = await tx.financeInventoryPool.findUnique({ where: { bookId_balanceSourceId: { bookId: "book", balanceSourceId: "balance" } } })
    const altered = { ...tx, financeInventoryPool: { findUnique: async () => ({ ...pool, ...change }) } } as unknown as Prisma.TransactionClient
    await expect(previewOrdinaryCorrectionCost(altered, input)).rejects.toThrow()
  }
})
