import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { transitionPrescriptionDelivery } from "./prescription-fulfillment"

describe("prescription delivery failure handling", () => {
  test("records the failed outcome and queues a customer-safe notification", async () => {
    const assignmentUpdates: unknown[] = []
    const communicationCreates: unknown[] = []
    const events: unknown[] = []
    const orderUpdates: unknown[] = []
    const transaction = {
      commercialOrder: {
        findUnique: async () => ({ customerPhone: "+2348000000000" }),
        update: async (input: unknown) => {
          orderUpdates.push(input)
          return input
        },
      },
      prescriptionCommunicationIntent: {
        upsert: async (input: unknown) => {
          communicationCreates.push(input)
          return { id: "communication-1" }
        },
      },
      prescriptionDeliveryAssignment: {
        findFirst: async () => ({
          id: "assignment-1",
          orderId: "order-1",
          revision: 1,
          status: "IN_TRANSIT",
        }),
        update: async (input: unknown) => {
          assignmentUpdates.push(input)
          return { id: "assignment-1", revision: 2, status: "FAILED" }
        },
      },
      prescriptionDeliveryEvent: {
        create: async (input: unknown) => {
          events.push(input)
          return input
        },
        findFirst: async () => null,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
      prescriptionStoreSettings: {
        findFirst: async () => ({ id: "settings-1" }),
      },
    } as unknown as PrismaClient

    await expect(
      transitionPrescriptionDelivery(db, {
        actorUserId: "user-1",
        assignmentId: "assignment-1",
        clientOperationId: "delivery-failure-1",
        reason: "customer unavailable",
        status: "failed",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({ communicationIntentId: "communication-1" })
    expect(assignmentUpdates).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          failureCode: "delivery_failed",
          failureReason: "customer unavailable",
          status: "FAILED",
        }),
        where: { id: "assignment-1" },
      }),
    ])
    expect(events).toEqual([
      {
        data: {
          actorUserId: "user-1",
          assignmentId: "assignment-1",
          idempotencyKey: "delivery-failure-1",
          reason: "customer unavailable",
          type: "FAILED",
        },
      },
    ])
    expect(orderUpdates).toEqual([
      { data: { status: "FULFILLING" }, where: { id: "order-1" } },
    ])
    expect(communicationCreates).toEqual([
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: "store-1",
          tenantId: "tenant-1",
          type: "DELIVERY_FAILED",
        }),
      }),
    ])
  })
})
