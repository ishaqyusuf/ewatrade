import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { getCommercialProductLineReview } from "./commercial-product-line-review"
const input = { tenantId: "tenant", storeId: "store", orderLineId: "line" }
const decimal = (value: string) => new Prisma.Decimal(value)
function fixture(packaged = false) {
  const behavior = packaged ? "PACKAGED_STOCK" : "ALTERNATE_TRANSACTION"
  const balance = {
    id: "balance", tenantId: "tenant", storeId: "store", variantId: "variant",
    kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL", inventoryUnitId: "unit",
    onHandQuantity: decimal(packaged ? "10" : "120"),
    reservedQuantity: decimal(packaged ? "3" : "36"), revision: 1,
    inventoryUnit: { name: packaged ? "Crate" : "Piece" },
  }
  const line = {
    id: "line", offeringId: "offering", kind: "PRODUCT_UNIT", quantity: decimal("2"),
    snapshot: {
      offeringName: "Crate", offeringId: "offering", variantId: "variant", currencyCode: "NGN",
      balanceSourceId: "balance", inventoryUnitId: "unit", configurationVersionId: "version",
      unitFactor: decimal("12"), stockBehavior: behavior,
    },
    productFulfillments: [] as Array<{ id: string }>,
    stockReservation: {
      status: "ACTIVE", committedOperationId: null, tenantId: "tenant", storeId: "store",
      commercialOrderLineId: "line", offeringId: "offering", enteredInventoryUnitId: "unit",
      configurationVersionId: "version", unitFactorSnapshot: decimal("12"),
      enteredQuantity: decimal("2"), canonicalQuantity: decimal("24"),
      enteredInventoryUnit: { stockBehavior: behavior }, balanceSource: balance,
    },
    order: {
      id: "order", orderNumber: "ORD-1", status: "CONFIRMED", currencyCode: "NGN",
      deliveryDueAt: null as Date | null, acceptedCommerceQuoteVersion: null,
      prescriptionPickupFulfillment: null, prescriptionDeliveryAssignment: null,
    },
  }
  let missing = false
  let count = 1
  const db = {
    commercialOrderLine: { findFirst: async (query: unknown) => {
      expect(query).toMatchObject({ where: { id: "line", order: { tenantId: "tenant", storeId: "store" } } })
      return missing ? null : line
    } },
    financeBook: { findUnique: async () => ({ id: "book", startsAt: new Date("2020-01-01"), closedThrough: null }) },
    financeInventoryPool: { findUnique: async () => ({ tenantId: "tenant", bookId: "book", balanceSourceId: "balance", quantity: decimal("120"), valueMinor: 1200n, unknownReason: null, lastMovementCount: 1n, lastSequence: 1n, lastStockRevision: 1, latestEffectiveAt: new Date("2020-01-02") }) },
    stockMovement: { count: async () => count },
  } as unknown as Prisma.TransactionClient
  return { db, line, balance, hide: () => { missing = true }, missCostHistory: () => { count = 2 } }
}
for (const packaged of [false, true]) {
  test(`product review preserves ${packaged ? "packaged" : "shared"} quantities and exact weighted cost`, async () => {
    const f = fixture(packaged)
    const result = await getCommercialProductLineReview(f.db, input)
    expect(result.stock).toMatchObject({ onHandAfter: packaged ? "8" : "96", reservedAfter: packaged ? "1" : "12", canonicalQuantity: "24" })
    expect(result.cost).toMatchObject({ valueBeforeMinor: "1200", valueAfterMinor: "960", valueDeltaMinor: "-240", unknownReason: null })
    expect((await getCommercialProductLineReview(f.db, input)).revision).toBe(result.revision)
    f.missCostHistory()
    const unknown = await getCommercialProductLineReview(f.db, input)
    expect(unknown.cost).toMatchObject({ valueDeltaMinor: null, unknownReason: "UNCAPTURED_MOVEMENTS" })
    expect(unknown.revision).not.toBe(result.revision)
  })
}
test("review refuses missing scope, changed reservation, future schedule and completed lines", async () => {
  const f = fixture()
  f.line.stockReservation.unitFactorSnapshot = decimal("10")
  await expect(getCommercialProductLineReview(f.db, input)).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  f.line.stockReservation.unitFactorSnapshot = decimal("12")
  f.balance.reservedQuantity = decimal("1")
  await expect(getCommercialProductLineReview(f.db, input)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" })
  f.balance.reservedQuantity = decimal("36")
  f.line.order.deliveryDueAt = new Date("2999-01-01")
  await expect(getCommercialProductLineReview(f.db, input)).rejects.toMatchObject({ code: "INVALID_ORDER" })
  f.line.order.deliveryDueAt = null
  f.line.productFulfillments.push({ id: "done" })
  await expect(getCommercialProductLineReview(f.db, input)).rejects.toMatchObject({ code: "INVALID_ORDER" })
  f.hide()
  await expect(getCommercialProductLineReview(f.db, input)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
})
