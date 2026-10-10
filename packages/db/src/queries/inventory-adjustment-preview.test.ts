import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { previewOrdinaryStockAdjustment, previewOrdinaryStockReceipt } from "./inventory-operations"

const input = { tenantId: "tenant", storeId: "store", balanceSourceId: "balance", enteredInventoryUnitId: "crate", enteredQuantity: "0.5" }
function fixture(custodyType = "STORE") {
  const decimal = (value: string) => new Prisma.Decimal(value)
  const unit = { id: "crate", name: "Crate", transactionScale: 2, factor: decimal("30"), configurationVersionId: "config", configurationVersion: { status: "CURRENT" }, stockBehavior: "CONVERTIBLE_SHARED" }
  const tx = {
    stockBalanceSource: { findFirst: async ({ where }: { where: unknown }) => {
      expect(where).toEqual({ id: "balance", storeId: "store", tenantId: "tenant" })
      return { id: "balance", revision: 4, custodyType, kind: "SHARED_POOL", productId: "product", product: { catalogItemId: "item" }, variant: { name: "Big" }, inventoryUnit: unit, onHandQuantity: decimal("20"), reservedQuantity: decimal("3"), store: { currencyCode: "NGN" } }
    } },
    inventoryUnit: { findFirst: async () => unit, findMany: async () => [{ name: "Piece" }] },
    catalogItem: { findUniqueOrThrow: async () => ({ name: "Eggs" }) },
  } as unknown as Prisma.TransactionClient
  return tx
}
test("adjustment preview converts fractional crates and protects reserved pieces", async () => {
  const result = await previewOrdinaryStockAdjustment(fixture(), { ...input, direction: "decrease" })
  expect(result).toMatchObject({ before: "20", after: "5", reserved: "3", availableAfter: "2", canonicalQuantity: "15", balanceUnitName: "Piece", revision: 4 })
  await expect(previewOrdinaryStockAdjustment(fixture(), { ...input, enteredQuantity: "0.6", direction: "decrease" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
})
test("receipt preview retains increase semantics and custody restrictions", async () => {
  expect(await previewOrdinaryStockReceipt(fixture(), input)).toMatchObject({ after: "35", availableAfter: "32" })
  await expect(previewOrdinaryStockAdjustment(fixture("IN_TRANSIT"), { ...input, direction: "decrease" })).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
})
test("adjustments reject zero, negative and over-precision observations", async () => {
  for (const enteredQuantity of ["0", "-1", "0.001"]) {
    await expect(previewOrdinaryStockAdjustment(fixture(), { ...input, enteredQuantity, direction: "decrease" })).rejects.toThrow()
  }
})
