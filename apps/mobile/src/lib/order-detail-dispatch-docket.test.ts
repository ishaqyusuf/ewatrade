import { describe, expect, test } from "bun:test"
import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import { getOrderDetailDispatchDocketPresentation } from "./order-detail-dispatch-docket"

function makeOrder(): CommercialOrder {
  return {
    amountPaidMinor: 48_500_00,
    balanceDueMinor: 77_500_00,
    clientOrderId: "client-2040",
    createdAt: new Date("2026-09-06T08:52:00.000Z"),
    createdBy: null,
    createdByUserId: "owner-1",
    currencyCode: "NGN",
    customerEmail: null,
    customerName: "Emeka Stores",
    customerPhone: "+2348035550142",
    deliveryDueAt: null,
    discountMinor: 0,
    id: "order-2040",
    lines: [
      {
        discountMinor: 0,
        id: "line-product",
        kind: "product",
        offeringId: "offering-product",
        productFulfillments: [],
        productReturns: [],
        quantity: "5",
        reservation: {
          balanceSourceId: "balance-1",
          id: "reservation-1",
          status: "ACTIVE",
        },
        snapshot: {
          catalogItemName: "Ofada rice",
          inventoryUnitName: "25 kg bag",
          offeringName: "Wholesale bag",
          variantName: "Premium",
        },
        taxMinor: 0,
        totalMinor: 95_000_00,
        unitPriceMinor: 19_000_00,
      },
    ],
    notes: null,
    orderNumber: "#2040",
    payments: [],
    paymentStatus: "PARTIALLY_PAID",
    serviceChargeMinor: 0,
    status: "CONFIRMED",
    storeId: "store-1",
    subtotalMinor: 126_000_00,
    taxMinor: 0,
    totalMinor: 126_000_00,
  } as CommercialOrder
}

describe("order detail dispatch docket", () => {
  test("derives truthful money, count, status, and fulfilment copy", () => {
    const presentation = getOrderDetailDispatchDocketPresentation(makeOrder())

    expect(presentation).toMatchObject({
      balanceLabel: "₦77,500",
      itemLabel: "5 items",
      lineLabel: "1 order line",
      paymentLabel: "Part paid",
      statusLabel: "Confirmed",
      totalLabel: "₦126,000",
    })
    expect(presentation.nextMovement.label).toBe("Fulfil reserved stock")
  })

  test("does not describe service-only work as packaging", () => {
    const order = makeOrder()
    order.lines = [
      {
        ...order.lines[0]!,
        id: "line-service",
        kind: "service",
        reservation: null,
        snapshot: {
          catalogItemName: "Market delivery",
          offeringName: "Same-day delivery",
        },
      },
    ] as CommercialOrder["lines"]

    const presentation = getOrderDetailDispatchDocketPresentation(order)
    expect(presentation.nextMovement).toMatchObject({
      label: "Continue service work",
      stepLabel: "Service",
    })
    expect(presentation.nextMovement.label.toLowerCase()).not.toContain("pack")
  })

  test("gates reserved stock behind a future delivery time", () => {
    const order = makeOrder()
    order.deliveryDueAt = new Date("2027-01-01T10:00:00.000Z")

    expect(
      getOrderDetailDispatchDocketPresentation(
        order,
        new Date("2026-09-06T10:00:00.000Z").getTime(),
      ).nextMovement,
    ).toMatchObject({
      label: "Wait for scheduled delivery",
      stepLabel: "Scheduled",
    })
  })
})
