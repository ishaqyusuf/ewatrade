import { describe, expect, test } from "bun:test"
import type { CommercialOrder } from "./commerce-model"
import {
  buildCommercialOrderActivity,
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "./commercial-order-overview-model"

function makeOrder(): CommercialOrder {
  return {
    amountPaidMinor: 4_000,
    balanceDueMinor: 6_000,
    clientOrderId: "client-order-1",
    createdAt: new Date("2026-07-24T08:00:00.000Z"),
    createdBy: {
      email: "tola@example.com",
      id: "user-order",
      name: "Tola Admin",
      role: "ADMIN",
    },
    createdByUserId: "user-order",
    currencyCode: "NGN",
    customerEmail: "ada@example.com",
    customerName: "Ada Obi",
    customerPhone: "+2348000000000",
    discountMinor: 0,
    id: "order-1",
    lines: [
      {
        discountMinor: 0,
        id: "line-product",
        kind: "product",
        offeringId: "offering-product",
        productFulfillments: [],
        productReturns: [],
        quantity: "2",
        reservation: {
          balanceSourceId: "balance-1",
          id: "reservation-1",
          status: "ACTIVE",
        },
        snapshot: {
          balanceSourceId: "balance-1",
          barcode: null,
          catalogItemName: "Cotton shirt",
          configurationVersionId: "configuration-1",
          currencyCode: "NGN",
          inventoryUnitId: "unit-1",
          inventoryUnitName: "Piece",
          offeringKind: "product",
          offeringName: "Cotton shirt",
          optionSelections: [],
          pricingPolicy: "fixed",
          sku: null,
          stockBehavior: "TRACKED",
          transactionScale: 0,
          unitFactor: "1",
          variantName: "Blue",
        },
        taxMinor: 0,
        totalMinor: 6_000,
        unitPriceMinor: 3_000,
      },
      {
        discountMinor: 0,
        id: "line-service",
        kind: "service",
        offeringId: "offering-service",
        productFulfillments: [],
        productReturns: [],
        quantity: "1",
        reservation: null,
        snapshot: {
          balanceSourceId: null,
          barcode: null,
          catalogItemName: "Alteration",
          configurationVersionId: null,
          currencyCode: "NGN",
          inventoryUnitId: null,
          inventoryUnitName: null,
          offeringKind: "service",
          offeringName: "Standard alteration",
          optionSelections: [],
          pricingPolicy: "fixed",
          sku: null,
          stockBehavior: null,
          transactionScale: null,
          unitFactor: null,
          variantName: "Standard",
        },
        taxMinor: 0,
        totalMinor: 4_000,
        unitPriceMinor: 4_000,
      },
    ],
    notes: "Call before pickup",
    orderNumber: "EO-1001",
    payments: [
      {
        amountMinor: 2_000,
        id: "payment-late",
        method: "CASH",
        note: null,
        recordedAt: new Date("2026-07-24T10:00:00.000Z"),
        recordedBy: {
          email: "ada@example.com",
          id: "user-payment-late",
          name: "Ada Cashier",
          role: "CASHIER",
        },
        recordedByUserId: "user-payment-late",
        reference: null,
        type: "PAYMENT",
      },
      {
        amountMinor: 2_000,
        id: "payment-early",
        method: "BANK_TRANSFER",
        note: null,
        recordedAt: new Date("2026-07-24T09:00:00.000Z"),
        recordedBy: {
          email: "obi@example.com",
          id: "user-payment-early",
          name: "Obi Manager",
          role: "MANAGER",
        },
        recordedByUserId: "user-payment-early",
        reference: "TRF-1",
        type: "PAYMENT",
      },
    ],
    paymentStatus: "PARTIALLY_PAID",
    serviceChargeMinor: 0,
    status: "CONFIRMED",
    storeId: "store-1",
    subtotalMinor: 10_000,
    taxMinor: 0,
    totalMinor: 10_000,
  }
}

describe("commercial order overview model", () => {
  test("derives summary counts without blending product and service work", () => {
    const order = makeOrder()
    const [productLine, serviceLine] = order.lines
    if (!productLine || !serviceLine) {
      throw new Error("Expected Product and Service fixture lines.")
    }

    expect(getCommercialOrderOverviewSummary(order)).toEqual({
      fulfilledProductLineCount: 0,
      fulfillableProductLineCount: 1,
      itemCount: 3,
      lineCount: 2,
      productLineCount: 1,
      serviceLineCount: 1,
    })
    expect(canFulfillCommercialOrderLine(productLine)).toBe(true)
    expect(canFulfillCommercialOrderLine(serviceLine)).toBe(false)
  })

  test("orders dated activity chronologically before undated operations", () => {
    const order = makeOrder()
    const productLine = order.lines[0]
    if (!productLine) {
      throw new Error("Expected a Product fixture line.")
    }
    productLine.productFulfillments.push({
      id: "fulfilment-1",
      quantity: "2",
      stockOperationId: "operation-1",
    })

    expect(
      buildCommercialOrderActivity(order).map((event) => event.key),
    ).toEqual([
      "created:order-1",
      "payment:payment-early",
      "payment:payment-late",
      "fulfilment:fulfilment-1",
    ])
  })

  test("attributes the order and every payment to the responsible account", () => {
    const activity = buildCommercialOrderActivity(makeOrder())

    expect(activity[0]?.detail).toContain("Tola Admin")
    expect(activity[1]?.detail).toContain("Received by Obi Manager")
    expect(activity[2]?.detail).toContain("Received by Ada Cashier")
  })
})
