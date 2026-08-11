import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceFulfillmentRouter } from "./fulfillment"

const createCaller = createCallerFactory(serviceCommerceFulfillmentRouter)

function caller(overrides?: { attendant?: boolean; sourceId?: string }) {
  const calls: string[] = []
  type FakeDb = {
    $transaction: (
      callback: (tx: FakeDb) => Promise<unknown>,
    ) => Promise<unknown>
    commercialOrder: { findFirst: () => Promise<unknown> }
    serviceCommerceStoreTeamAssignment: { findFirst: () => Promise<unknown> }
  }
  const db: FakeDb = {
    $transaction: async (callback) => callback(db),
    commercialOrder: {
      findFirst: async () => {
        calls.push("order")
        return {
          acceptedCommerceQuoteVersion: {
            fulfilmentPromise: "Deliver tomorrow",
            fulfilmentType: "DELIVERY",
            id: "version-1",
            quote: {
              sourceId: overrides?.sourceId ?? "request-1",
              sourceType: "SERVICE_REQUEST",
            },
            status: "ACCEPTED",
            totalMinor: 20_000_00,
          },
          currencyCode: "NGN",
          id: "order-1",
          paymentStatus: "PAID",
          prescriptionDeliveryAddress: { packedAt: new Date() },
          prescriptionDeliveryAssignment: {
            events: [{ effectiveAt: new Date("2026-08-11T12:00:00.000Z") }],
            failureCode: "route_unavailable",
            proofReference: null,
            revision: 2,
            status: "FAILED",
          },
          prescriptionPickupFulfillment: null,
          status: "CONFIRMED",
        }
      },
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => {
        calls.push("authorize")
        return overrides?.attendant === false ? null : { id: "assignment-1" }
      },
    },
  }
  return {
    calls,
    client: createCaller({
      db,
      session: { user: { id: "attendant-1" } },
      tenantContext: {
        activeStore: { id: "store-1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store-1" }],
        tenant: { id: "tenant-1" },
      },
    } as never),
  }
}

describe("Service Commerce fulfillment router", () => {
  test("returns an authorized exact-source Order projection", async () => {
    const { calls, client } = caller()
    await expect(
      client.fulfillmentDetail({
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
        storeId: "store-1",
      }),
    ).resolves.toMatchObject({
      fulfilmentType: "delivery",
      orderId: "order-1",
      operationalState: {
        kind: "delivery",
        latestEvent: {
          reasonCode: "route_unavailable",
          status: "failed",
        },
        nextOperations: ["transition"],
        proofPresent: false,
        status: "failed",
      },
      source: { id: "request-1", kind: "service" },
    })
    expect(calls).toEqual(["authorize", "order"])
  })

  test("fails a mismatched source closed", async () => {
    const { client } = caller({ sourceId: "request-other" })
    await expect(
      client.fulfillmentDetail({
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("fails closed without an active Store attendant assignment", async () => {
    const { calls, client } = caller({ attendant: false })
    await expect(
      client.fulfillmentDetail({
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(calls).toEqual(["authorize"])
  })

  test("dispatches only to an explicitly registered vertical adapter", async () => {
    const { client } = caller()
    await expect(
      client.pickupFulfillment({
        input: {
          checks: { packed: true },
          clientOperationId: "prepare-1",
          operation: "prepare",
        },
        orderId: "order-1",
        source: { id: "request-1", kind: "service" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
