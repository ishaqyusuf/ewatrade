import { describe, expect, test } from "bun:test"
import type { CommercialOrder } from "@/components/mobile/commerce/commerce-model"
import {
  ORDER_PAYMENT_METHODS,
  getOrderFulfilmentConfirmation,
} from "./order-action-sheet-model"

const ORDER = {
  currencyCode: "NGN",
  lines: [
    {
      id: "line-rice",
      kind: "product",
      productFulfillments: [],
      productReturns: [],
      quantity: "5",
      reservation: { id: "reservation-rice", status: "ACTIVE" },
      snapshot: {
        catalogItemName: "Ofada rice",
        inventoryUnitName: "25 kg bag",
        offeringName: "Wholesale bag",
        variantName: "Premium",
      },
    },
    {
      id: "line-oil",
      kind: "product",
      productFulfillments: [],
      productReturns: [],
      quantity: "2",
      reservation: { id: "reservation-oil", status: "ACTIVE" },
      snapshot: {
        catalogItemName: "Palm oil",
        inventoryUnitName: "5 litre keg",
        variantName: "Fresh press",
      },
    },
    {
      id: "line-service",
      kind: "service",
      productFulfillments: [],
      productReturns: [],
      quantity: "1",
      reservation: null,
      snapshot: { catalogItemName: "Market delivery" },
    },
  ],
  orderNumber: "#2040",
} as CommercialOrder

describe("Order Quiet Sheet fulfilment confirmation", () => {
  test("presents the selected Product line without executing it", () => {
    expect(
      getOrderFulfilmentConfirmation(ORDER, {
        kind: "line",
        orderLineId: "line-rice",
      }),
    ).toEqual({
      actionLabel: "Confirm fulfilment",
      detail: "Reservation active",
      detailTitle: "Ofada rice - 25 kg bag",
      kind: "line",
      orderLineId: "line-rice",
      summaryLabel: "OFADA RICE · PREMIUM",
      summaryValue: "5 × 25 kg bag",
      title: "Fulfil product line",
      warning:
        "This records the stock movement and updates the Order. Confirm only when the items are ready.",
    })
  })

  test("summarizes every ready Product line without counting Service work", () => {
    expect(getOrderFulfilmentConfirmation(ORDER, { kind: "all" })).toEqual({
      actionLabel: "Fulfil all ready",
      detail: "Commits every active Product reservation in this Order.",
      detailTitle: "2 Product lines",
      kind: "all",
      orderLineId: null,
      summaryLabel: "READY TO FULFIL",
      summaryValue: "2 lines",
      title: "Fulfil all ready lines",
      warning:
        "This records stock movement for every ready line and updates the Order. Confirm only when all items are ready.",
    })
  })

  test("rejects an unavailable or non-Product line", () => {
    expect(
      getOrderFulfilmentConfirmation(ORDER, {
        kind: "line",
        orderLineId: "line-service",
      }),
    ).toBeNull()
    expect(
      getOrderFulfilmentConfirmation(ORDER, {
        kind: "line",
        orderLineId: "missing",
      }),
    ).toBeNull()
  })
})

describe("Order Quiet Sheet payment methods", () => {
  test("matches the four owner-approved choices", () => {
    expect(ORDER_PAYMENT_METHODS).toEqual([
      ["cash", "Cash"],
      ["bank_transfer", "Transfer"],
      ["pos", "POS"],
      ["other", "Other"],
    ])
  })
})
