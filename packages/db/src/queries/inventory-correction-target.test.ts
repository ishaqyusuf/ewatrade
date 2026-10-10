import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { readStockCorrectionTarget, previewStockCorrection } from "./inventory-operations"
const input = { tenantId: "tenant", storeId: "store", targetOperationId: "original" }
function fixture(change: Record<string, unknown> = {}, foreign = false) {
  const target = { id: "original", type: "ADJUSTMENT", correctionOfOperationId: null, committedReservation: null, _count: { purchaseReceipts: 0, productFulfillments: 0, productReturns: 0, finalizedCounts: 0, dispatchedTransfers: 0, receivedTransfers: 0, cancelledTransfers: 0, finalizedCloseouts: 0 }, corrections: [], movements: [{ id: "movement", balanceSource: { tenantId: "tenant", storeId: foreign ? "other" : "store" }, purchaseReceipt: null, valuationEvent: null }], ...change }
  const tx = { stockOperation: { findFirst: async ({ where }: { where: unknown }) => {
    expect(where).toEqual({ id: "original", tenantId: "tenant", storeId: "store" })
    return target
  } } } as unknown as Prisma.TransactionClient
  return { tx, target }
}
test("correction read binds original and movements to current Store", async () => {
  const f = fixture()
  expect(await readStockCorrectionTarget(f.tx, input)).toBe(f.target)
  await expect(readStockCorrectionTarget(fixture({}, true).tx, input)).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
})
test("correction review shares source-owner and already-corrected exclusions", async () => {
  for (const change of [
    { committedReservation: { id: "reservation" } },
    { corrections: [{ id: "existing" }] },
    { _count: { finalizedCloseouts: 1 } },
    { movements: [{ id: "movement", balanceSource: { tenantId: "tenant", storeId: "store" }, purchaseReceipt: { id: "receipt" }, valuationEvent: null }] },
  ]) await expect(readStockCorrectionTarget(fixture(change).tx, input)).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
})

test("correction preview uses saved conversion and reverses before replacing", async () => {
  const d = (value: string) => new Prisma.Decimal(value)
  const f = fixture({ movements: [{ id: "movement", balanceSourceId: "balance", enteredQuantity: d("2"), signedCanonicalEffect: d("60"), transactionScaleSnapshot: 2, unitFactorSnapshot: d("30"), enteredInventoryUnit: { name: "Crate" }, purchaseReceipt: null, valuationEvent: null, balanceSource: { tenantId: "tenant", storeId: "store", kind: "SHARED_POOL", store: { currencyCode: "NGN" }, revision: 5, onHandQuantity: d("90"), reservedQuantity: d("3"), product: { catalogItemId: "item" }, variant: { name: "Big" } } }] })
  const tx = { ...f.tx, financeBook: { findUnique: async () => null }, catalogItem: { findUniqueOrThrow: async () => ({ name: "Eggs" }) } } as unknown as Prisma.TransactionClient
  const correction = { ...input, corrections: [{ movementId: "movement", correctedEnteredQuantity: "1.5" }] }
  expect((await previewStockCorrection(tx, correction)).lines[0]).toMatchObject({ before: "90", afterReversal: "30", afterReplacement: "75", correctedCanonical: "45", availableAfter: "72", factor: "30" })
  await expect(previewStockCorrection(tx, { ...correction, corrections: [...correction.corrections, ...correction.corrections] })).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  await expect(previewStockCorrection(tx, { ...correction, corrections: [{ movementId: "foreign", correctedEnteredQuantity: "1" }] })).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
})
