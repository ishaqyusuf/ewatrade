// @ts-expect-error Bun test runtime types are outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test"
import { buildRetailOpsSyncEventsInput } from "./retail-ops-sync"

const createdAt = "2026-07-12T08:00:00.000Z"
const businessId = "business-1"
const productId = "product-1"
const variantId = "variant-1"

function syncEvent(
  type: Parameters<
    typeof buildRetailOpsSyncEventsInput
  >[0]["syncEvents"][number]["type"],
  entityId: string,
) {
  return {
    businessId,
    createdAt,
    entityId,
    id: `event-${type}`,
    label: type,
    status: "pending" as const,
    type,
  }
}

function getPayload(
  result: ReturnType<typeof buildRetailOpsSyncEventsInput>,
  type: string,
) {
  return result.events.find((event) => event.type === type)?.payload as
    | Record<string, unknown>
    | undefined
}

describe("buildRetailOpsSyncEventsInput", () => {
  test("normalizes stale local decimal quantities before replaying production sync events", () => {
    const result = buildRetailOpsSyncEventsInput({
      activeBusinessId: businessId,
      closeouts: [
        {
          approvalStatus: "pending_review",
          attendantName: "Store Owner",
          businessId,
          cashVariance: 0,
          createdAt,
          declaredCash: 0,
          declaredTransfer: 0,
          expectedCash: 0,
          expectedTransfer: 0,
          grossSales: 0,
          id: "closeout-1",
          inventoryLines: [
            {
              declaredQuantity: 6.9,
              expectedQuantity: 7,
              productId,
              productName: "Rice",
              unitName: "Bag",
              variance: -0.1,
            },
            {
              declaredQuantity: 2.4,
              expectedQuantity: 2,
              productId,
              productName: "Rice",
              unitName: "Half bag",
              variance: 0.4,
              variantId,
            },
          ],
          repSessionId: "session-1",
          salesCount: 1,
          syncStatus: "pending",
          transferVariance: 0,
        },
      ],
      customers: [],
      deviceId: "device-1",
      products: [
        {
          businessId,
          currentStock: 15.8,
          description: "Premium long-grain rice for shared product previews.",
          id: productId,
          imageUrl: "https://cdn.example.com/products/rice.png",
          name: "Rice",
          price: 18_500,
          remoteId: "remote-product-1",
          remoteVariantId: "remote-unit-bag",
          startingStock: 12.9,
          syncStatus: "pending",
          unitName: "Bag",
          variants: [
            {
              conversionMultiplier: 0.5,
              currentStock: 5.8,
              id: variantId,
              name: "Half bag",
              price: 9_500,
              remoteId: "remote-unit-half-bag",
              startingStock: 3.9,
            },
          ],
        },
      ],
      repSessions: [
        {
          attendantName: "Store Owner",
          businessId,
          clockedInAt: createdAt,
          hasOpeningVariance: true,
          id: "session-1",
          openingInventoryLines: [
            {
              confirmedQuantity: 10.7,
              expectedQuantity: 10,
              productId,
              productName: "Rice",
              unitName: "Bag",
              variance: 0.7,
            },
            {
              confirmedQuantity: 4.2,
              expectedQuantity: 4,
              productId,
              productName: "Rice",
              unitName: "Half bag",
              variance: 0.2,
              variantId,
            },
          ],
          remoteId: "remote-session-1",
          status: "open",
          syncStatus: "pending",
        },
      ],
      sales: [
        {
          attendantName: "Store Owner",
          businessId,
          createdAt,
          customerName: "Walk-in customer",
          id: "sale-1",
          paymentMethod: "cash",
          productId,
          productName: "Rice",
          quantity: 2.8,
          repSessionId: "session-1",
          syncStatus: "pending",
          total: 37_000,
          unitName: "Bag",
          unitPrice: 18_500,
        },
      ],
      shareLinks: [],
      staff: [],
      stockMovements: [
        {
          businessId,
          createdAt,
          id: "stock-intake-1",
          productId,
          productName: "Rice",
          quantity: 8.6,
          syncStatus: "pending",
          type: "stock_intake",
          unitName: "Bag",
        },
        {
          businessId,
          createdAt,
          id: "stock-adjustment-1",
          productId,
          productName: "Rice",
          quantity: -3.7,
          stockAdjustmentReason: "loss",
          syncStatus: "pending",
          type: "stock_adjustment",
          unitName: "Bag",
        },
        {
          businessId,
          createdAt,
          id: "conversion-out-1",
          productId,
          productName: "Rice",
          quantity: -2.9,
          relatedMovementId: "conversion-in-1",
          syncGroupId: "conversion-1",
          syncStatus: "pending",
          type: "conversion_out",
          unitName: "Bag",
        },
        {
          businessId,
          createdAt,
          id: "conversion-in-1",
          productId,
          productName: "Rice",
          quantity: 5.8,
          relatedMovementId: "conversion-out-1",
          syncGroupId: "conversion-1",
          syncStatus: "pending",
          type: "conversion_in",
          unitName: "Half bag",
          variantId,
        },
      ],
      syncEvents: [
        syncEvent("product_setup", productId),
        syncEvent("rep_session_opened", "session-1"),
        syncEvent("sale_created", "sale-1"),
        syncEvent("closeout_created", "closeout-1"),
        syncEvent("stock_intake_recorded", "stock-intake-1"),
        syncEvent("stock_adjustment_recorded", "stock-adjustment-1"),
        syncEvent("unit_conversion_recorded", "conversion-1"),
      ],
    })

    expect(result.events).toHaveLength(7)

    expect(getPayload(result, "product_setup")).toMatchObject({
      description: "Premium long-grain rice for shared product previews.",
      imageUrl: "https://cdn.example.com/products/rice.png",
      openingStockQuantity: 12,
      variants: [
        {
          openingStockQuantity: 3,
        },
      ],
    })
    expect(getPayload(result, "rep_session_opened")).toMatchObject({
      inventoryLines: [
        { countedQuantity: 10, productVariantId: "remote-unit-bag" },
        { countedQuantity: 4, productVariantId: "remote-unit-half-bag" },
      ],
    })
    expect(getPayload(result, "sale_created")).toMatchObject({
      productVariantId: "remote-unit-bag",
      quantity: 2,
    })
    expect(getPayload(result, "closeout_created")).toMatchObject({
      inventoryLines: [
        { countedQuantity: 6, productVariantId: "remote-unit-bag" },
        { countedQuantity: 2, productVariantId: "remote-unit-half-bag" },
      ],
    })
    expect(getPayload(result, "stock_intake_recorded")).toMatchObject({
      productVariantId: "remote-unit-bag",
      quantity: 8,
    })
    expect(getPayload(result, "stock_adjustment_recorded")).toMatchObject({
      direction: "decrease",
      productVariantId: "remote-unit-bag",
      quantity: 3,
      reason: "loss",
    })
    expect(getPayload(result, "unit_conversion_recorded")).toMatchObject({
      sourceProductVariantId: "remote-unit-bag",
      sourceQuantity: 2,
      targetProductVariantId: "remote-unit-half-bag",
      targetQuantity: 5,
    })
  })

  test("drops replay events that would normalize to zero quantity", () => {
    const result = buildRetailOpsSyncEventsInput({
      activeBusinessId: businessId,
      closeouts: [],
      customers: [],
      products: [
        {
          businessId,
          currentStock: 1,
          id: productId,
          name: "Rice",
          price: 18_500,
          remoteId: "remote-product-1",
          remoteVariantId: "remote-unit-bag",
          startingStock: 1,
          syncStatus: "pending",
          unitName: "Bag",
          variants: [],
        },
      ],
      repSessions: [
        {
          attendantName: "Store Owner",
          businessId,
          clockedInAt: createdAt,
          hasOpeningVariance: false,
          id: "session-1",
          openingInventoryLines: [],
          remoteId: "remote-session-1",
          status: "open",
          syncStatus: "pending",
        },
      ],
      sales: [
        {
          attendantName: "Store Owner",
          businessId,
          createdAt,
          customerName: "Walk-in customer",
          id: "sale-1",
          paymentMethod: "cash",
          productId,
          productName: "Rice",
          quantity: 0.8,
          repSessionId: "session-1",
          syncStatus: "pending",
          total: 18_500,
          unitName: "Bag",
          unitPrice: 18_500,
        },
      ],
      shareLinks: [],
      staff: [],
      stockMovements: [
        {
          businessId,
          createdAt,
          id: "stock-intake-1",
          productId,
          productName: "Rice",
          quantity: 0.5,
          syncStatus: "pending",
          type: "stock_intake",
          unitName: "Bag",
        },
      ],
      syncEvents: [
        syncEvent("sale_created", "sale-1"),
        syncEvent("stock_intake_recorded", "stock-intake-1"),
      ],
    })

    expect(result.events).toEqual([])
  })
})
