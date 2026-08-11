import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { createPrescriptionServiceCommerceFulfillmentAdapter } from "./service-commerce-prescription-fulfillment-adapter"

function fixture(input?: { attendant?: boolean }) {
  const deliveryEvents: unknown[] = []
  let deliveryStatus = "FAILED"
  const order = {
    acceptedCommerceQuoteVersion: {
      fulfilmentPromise: "Delivery tomorrow",
      fulfilmentType: "DELIVERY",
      id: "version-1",
      quote: {
        sourceId: "request-1",
        sourceType: "PRESCRIPTION_REQUEST",
      },
      status: "ACCEPTED",
      totalMinor: 20_000,
    },
    currencyCode: "NGN",
    id: "order-1",
    paymentStatus: "PAID",
    status: "FULFILLING",
  }
  const transaction = {
    $queryRaw: async () => [{ id: "assignment-1" }],
    commercialOrder: {
      findFirst: async () => ({
        ...order,
        prescriptionDeliveryAddress: { packedAt: new Date() },
        prescriptionDeliveryAssignment: {
          events: [{ effectiveAt: new Date("2026-08-11T12:00:00.000Z") }],
          failureCode:
            deliveryStatus === "RETURNED_TO_PHARMACY"
              ? "customer_refused"
              : "delivery_failed",
          proofReference: null,
          revision: 2,
          status: deliveryStatus,
        },
        prescriptionPickupFulfillment: null,
      }),
      findUnique: async () => ({ customerPhone: null }),
      update: async () => order,
    },
    prescriptionDeliveryAssignment: {
      findFirst: async (query: { select?: unknown }) =>
        query.select
          ? { id: "assignment-1" }
          : {
              id: "assignment-1",
              orderId: "order-1",
              revision: 1,
              status: deliveryStatus,
            },
      update: async (query: { data: { status: string } }) => {
        deliveryStatus = query.data.status
        return {
          id: "assignment-1",
          orderId: "order-1",
          revision: 2,
          status: deliveryStatus,
        }
      },
    },
    prescriptionDeliveryEvent: {
      create: async (query: unknown) => {
        deliveryEvents.push(query)
        return { id: "event-1" }
      },
      findFirst: async () => null,
    },
    prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
    prescriptionStoreSettings: {
      findFirst: async () => ({ id: "settings-1" }),
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => [
        {
          approvalReference: "approval-1",
          channel: "STAFF",
          effectiveAt: new Date(Date.now() - 60_000),
          evidenceReference: "evidence-1",
          expiresAt: new Date(Date.now() + 60_000),
          id: "policy-1",
          jurisdictionCode: "US",
          outcome: "ALLOWED",
          revision: 1,
          revokedAt: null,
          subject: "DELIVERY",
          vertical: "PHARMACY",
        },
      ],
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () =>
        input?.attendant === false ? null : { id: "team-1" },
    },
    store: { findFirst: async () => ({ countryCode: "US" }) },
  }
  const db = {
    ...transaction,
    $transaction: async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
  } as unknown as PrismaClient
  return { db, deliveryEvents }
}

const returnedCommand = {
  context: {
    orderId: "order-1",
    source: { id: "request-1", kind: "prescription" as const },
    storeId: "store-1",
    tenantId: "tenant-1",
  },
  input: {
    clientOperationId: "return-1",
    operation: "transition" as const,
    reason: "Customer refused delivery",
    status: "returned_to_store" as const,
  },
}

describe("Prescription Service Commerce fulfillment adapter", () => {
  test("dispatches a generic return through the Pharmacy transition and projects the exact source", async () => {
    const { db, deliveryEvents } = fixture()
    await expect(
      createPrescriptionServiceCommerceFulfillmentAdapter(db).delivery(
        { userId: "attendant-1" },
        returnedCommand,
      ),
    ).resolves.toMatchObject({
      orderId: "order-1",
      operationalState: {
        kind: "delivery",
        latestEvent: {
          reasonCode: "customer_refused",
          status: "returned_to_store",
        },
        nextOperations: ["transition"],
        proofPresent: false,
        status: "returned_to_store",
      },
      source: { id: "request-1", kind: "prescription" },
    })
    expect(deliveryEvents).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: "return-1",
          type: "RETURNED_TO_PHARMACY",
        }),
      }),
    ])
  })

  test("retains the shared attendant gate inside the Pharmacy adapter", async () => {
    const { db } = fixture({ attendant: false })
    await expect(
      createPrescriptionServiceCommerceFulfillmentAdapter(db).delivery(
        { userId: "unassigned-user" },
        returnedCommand,
      ),
    ).rejects.toMatchObject({ code: "FULFILLMENT_CONFLICT" })
  })

  test("rejects a non-Prescription source before vertical dispatch", async () => {
    const { db } = fixture()
    await expect(
      createPrescriptionServiceCommerceFulfillmentAdapter(db).delivery(
        { userId: "attendant-1" },
        {
          ...returnedCommand,
          context: {
            ...returnedCommand.context,
            source: { id: "request-1", kind: "service" },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_MISMATCH" })
  })
})
