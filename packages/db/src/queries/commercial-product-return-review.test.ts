import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { getCommercialProductReturnStockReview } from "./commercial-product-return-review"
const d = (value: string) => new Prisma.Decimal(value)
const input = { tenantId: "tenant", storeId: "store", orderLineId: "line", quantity: "0.5", disposition: "restock" as const }
function fixture(options: { missing?: boolean; variant?: string; revision?: number; returns?: string[]; clinical?: object } = {}) {
  let balanceReads = 0
  const db = {
    commercialOrderLine: { findFirst: async (args: unknown) => {
      expect(args).toMatchObject({ where: { id: "line", kind: "PRODUCT_UNIT", order: { tenantId: "tenant", storeId: "store" } } })
      return options.missing ? null : {
        id: "line", order: { id: "order", orderNumber: "ORD-1", status: "COMPLETED", currencyCode: "NGN", ...options.clinical },
        snapshot: { balanceSourceId: "balance", inventoryUnitId: "case", variantId: "variant", unitFactor: d("12"), catalogItemName: "Product", offeringName: "Case" },
        productFulfillments: [{ id: "fulfillment", quantity: d("2") }],
        productReturns: (options.returns ?? ["0.5"]).map(quantity => ({ quantity: d(quantity) })),
      }
    } },
    stockBalanceSource: { findFirst: async (args: unknown) => {
      balanceReads++
      expect(args).toMatchObject({ where: { tenantId: "tenant", storeId: "store" } })
      return { id: "balance", variantId: options.variant ?? "variant", kind: "PACKAGED_STOCK", inventoryUnitId: "case", revision: options.revision ?? 0, inventoryUnit: { name: "Case" }, onHandQuantity: d("3"), reservedQuantity: d("1") }
    } },
  }
  return { db: db as unknown as Prisma.TransactionClient, balanceReads: () => balanceReads }
}

test("stock review preserves quantity, reserved stock and pending finance scope", async () => {
  const result = await getCommercialProductReturnStockReview(fixture().db, input)
  expect(result.quantities).toMatchObject({ returnableBefore: "1.5", returnableAfter: "1" })
  expect(result.stock).toMatchObject({ canonicalQuantity: "6", onHandBefore: "3", onHandAfter: "3.5", reservedBefore: "1", reservedAfter: "1" })
  expect(result.financialReview).toBe("PENDING")
})

test("all non-restock dispositions leave physical stock alone", async () => {
  for (const disposition of ["damaged", "quarantine", "no_restock"] as const) {
    const f = fixture()
    expect((await getCommercialProductReturnStockReview(f.db, { ...input, disposition })).stock).toBeNull()
    expect(f.balanceReads()).toBe(0)
  }
})

test("foreign or missing line and incompatible destination refuse preview", async () => {
  await expect(getCommercialProductReturnStockReview(fixture({ missing: true }).db, input)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
  await expect(getCommercialProductReturnStockReview(fixture({ variant: "other" }).db, input)).rejects.toMatchObject({ code: "INVALID_ORDER" })
})

test("balance revision and return history both change stock evidence", async () => {
  const original = await getCommercialProductReturnStockReview(fixture().db, input)
  const changedBalance = await getCommercialProductReturnStockReview(fixture({ revision: 1 }).db, input)
  const changedReturns = await getCommercialProductReturnStockReview(fixture({ returns: ["1"] }).db, input)
  expect(changedBalance.stockRevision).not.toBe(original.stockRevision)
  expect(changedReturns.stockRevision).not.toBe(original.stockRevision)
})


test("locked review evidence excludes prescription return sources", async () => {
  for (const clinical of [
    { acceptedCommerceQuoteVersion: { quote: { sourceType: "PRESCRIPTION_REQUEST" } } },
    { prescriptionPickupFulfillment: { orderId: "order" } },
    { prescriptionDeliveryAssignment: { orderId: "order" } },
  ]) {
    const f = fixture({ clinical })
    await expect(getCommercialProductReturnStockReview(f.db, input)).rejects.toMatchObject({ code: "INVALID_ORDER" })
    expect(f.balanceReads()).toBe(0)
  }
})
