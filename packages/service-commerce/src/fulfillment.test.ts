import { describe, expect, test } from "bun:test"

import {
  assertServiceCommerceDeliveryTransition,
  assertServiceCommercePickupTransition,
  deriveServiceCommerceFulfillmentGates,
  deriveServiceCommerceFulfillmentNextOperations,
  evaluateServiceCommerceDeliveryZone,
  projectServiceCommerceFulfillmentEvent,
} from "./fulfillment"
import {
  serviceCommerceDeliveryCommandSchema,
  serviceCommerceFulfillmentContextSchema,
  serviceCommercePickupCommandSchema,
} from "./schemas"

describe("Service Commerce fulfillment", () => {
  test("binds every command to exact Tenant, Store, Order and source context", () => {
    expect(
      serviceCommerceFulfillmentContextSchema.parse({
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).toEqual({
      orderId: "order-1",
      source: { id: "request-1", kind: "service" },
      storeId: "store-1",
      tenantId: "tenant-1",
    })
  })

  test("preserves pickup and delivery recovery transitions", () => {
    expect(() =>
      assertServiceCommercePickupTransition("ready", "handed_off"),
    ).not.toThrow()
    expect(() =>
      assertServiceCommerceDeliveryTransition("failed", "rescheduled"),
    ).not.toThrow()
    expect(() =>
      assertServiceCommerceDeliveryTransition(
        "returned_to_store",
        "rescheduled",
      ),
    ).not.toThrow()
    expect(() =>
      assertServiceCommerceDeliveryTransition("delivered", "in_transit"),
    ).toThrow()
    expect(
      deriveServiceCommerceFulfillmentNextOperations({
        kind: "delivery",
        status: "rescheduled",
      }),
    ).toEqual(["assign", "transition"])
    expect(
      deriveServiceCommerceFulfillmentNextOperations({
        kind: "pickup",
        status: "ready",
      }),
    ).toEqual(["handoff", "record_exception"])
  })

  test("defines strict idempotent pickup and delivery command contracts", () => {
    const context = {
      orderId: "order-1",
      source: { id: "request-1", kind: "prescription" },
      storeId: "store-1",
      tenantId: "tenant-1",
    }
    expect(
      serviceCommercePickupCommandSchema.parse({
        context,
        input: {
          checks: { packed: true },
          clientOperationId: "prepare-1",
          operation: "prepare",
        },
      }),
    ).toMatchObject({ input: { operation: "prepare" } })
    expect(
      serviceCommerceDeliveryCommandSchema.safeParse({
        context,
        input: {
          clientOperationId: "delivery-1",
          operation: "transition",
          status: "delivered",
        },
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceDeliveryCommandSchema.parse({
        context,
        input: {
          clientOperationId: "delivery-1",
          operation: "transition",
          proofReference: "proof_opaque_1",
          status: "delivered",
        },
      }),
    ).toMatchObject({ input: { status: "delivered" } })
    expect(
      serviceCommercePickupCommandSchema.safeParse({
        context,
        input: {
          clientOperationId: "exception-1",
          exceptionCode: "customer wrote private details here",
          operation: "record_exception",
          reason: "Private staff reason",
          status: "exception",
        },
      }).success,
    ).toBe(false)
  })

  test("selects fixed/manual zones deterministically and fails ambiguity closed", () => {
    const fixed = {
      currencyCode: "NGN",
      feePolicy: "fixed" as const,
      fixedFeeMinor: 2_500,
      id: "zone-fixed",
      matchType: "locality" as const,
      matchValues: ["Lekki"],
      priority: 2,
      promiseText: "Tomorrow",
    }
    expect(
      evaluateServiceCommerceDeliveryZone([fixed], { locality: " lekki " }),
    ).toMatchObject({ feeMinor: 2_500, outcome: "eligible" })
    expect(
      evaluateServiceCommerceDeliveryZone(
        [fixed, { ...fixed, id: "zone-second", promiseText: "Later" }],
        { locality: "Lekki" },
      ),
    ).toEqual({ outcome: "ambiguous" })
    expect(
      evaluateServiceCommerceDeliveryZone(
        [
          {
            ...fixed,
            feePolicy: "manual",
            fixedFeeMinor: null,
            id: "zone-manual",
          },
        ],
        { locality: "Lekki" },
      ),
    ).toMatchObject({ outcome: "manual_review" })
  })

  test("requires paid, eligible, prepared, ready, authorized and vertical release facts", () => {
    expect(
      deriveServiceCommerceFulfillmentGates({
        actorAuthorized: true,
        eligible: true,
        packed: true,
        paid: true,
        ready: true,
        verticalReleaseReady: true,
      }),
    ).toEqual({
      blockers: [],
      canAssignDelivery: true,
      canCompletePickup: true,
      canPrepare: true,
    })
    expect(
      deriveServiceCommerceFulfillmentGates({
        actorAuthorized: false,
        eligible: false,
        packed: false,
        paid: false,
        ready: false,
        verticalReleaseReady: false,
      }),
    ).toMatchObject({
      blockers: [
        "not_authorized",
        "not_paid",
        "not_eligible",
        "vertical_release_required",
        "not_packed",
        "not_ready",
      ],
      canAssignDelivery: false,
      canCompletePickup: false,
      canPrepare: false,
    })
  })

  test("projects only allowlisted customer-safe event facts", () => {
    expect(
      projectServiceCommerceFulfillmentEvent({
        effectiveAt: new Date("2026-08-11T12:00:00.000Z"),
        kind: "delivery",
        reasonCode: " delayed_route ",
        status: "rescheduled",
      }),
    ).toEqual({
      effectiveAt: new Date("2026-08-11T12:00:00.000Z"),
      kind: "delivery",
      reasonCode: "delayed_route",
      status: "rescheduled",
    })
  })
})
