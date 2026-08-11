import { describe, expect, test } from "bun:test"

import {
  serviceCommerceDeliveryCommandInputSchema,
  serviceCommerceFulfillmentDetailSchema,
  serviceCommercePickupCommandInputSchema,
} from "./service-commerce-fulfillment"

describe("Service Commerce fulfillment API schema", () => {
  test("accepts only Store, Order and typed source input", () => {
    expect(
      serviceCommerceFulfillmentDetailSchema.parse({
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
      }),
    ).toEqual({
      orderId: "order-1",
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
    })
    expect(
      serviceCommerceFulfillmentDetailSchema.safeParse({
        orderId: "order-1",
        source: { id: "request-1", kind: "other" },
        tenantId: "tenant-from-client",
      }).success,
    ).toBe(false)
  })

  test("reuses strict shared operation contracts without accepting authority", () => {
    expect(
      serviceCommercePickupCommandInputSchema.safeParse({
        input: {
          clientOperationId: "handoff-1",
          collectorName: "Customer",
          handoffCapability: "opaque-code",
          operation: "handoff",
        },
        orderId: "order-1",
        source: { id: "request-1", kind: "prescription" },
        tenantId: "caller-tenant",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceDeliveryCommandInputSchema.safeParse({
        input: {
          clientOperationId: "delivered-1",
          operation: "transition",
          status: "delivered",
        },
        orderId: "order-1",
        source: { id: "request-1", kind: "prescription" },
      }).success,
    ).toBe(false)
  })
})
