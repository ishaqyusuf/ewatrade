import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  approvePrescriptionManualDeliveryFee,
  handoffPrescriptionPickup,
  listPrescriptionDeliveryQueue,
  revisePrescriptionQuoteForDelivery,
  transitionPrescriptionDelivery,
  upsertPrescriptionDeliveryZone,
} from "./prescription-fulfillment"

function policyTransaction(input: {
  channel: "STAFF" | "WEB"
  expiresAt?: Date
  notificationOutcome?: "ALLOWED" | "PROHIBITED" | "RESTRICTED"
  outcome?: "ALLOWED" | "PROHIBITED" | "RESTRICTED"
  revokedAt?: Date | null
  subject: "DELIVERY" | "PICKUP"
}) {
  return {
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 1 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => [
        {
          approvalReference: "approval-1",
          channel: input.channel,
          effectiveAt: new Date(Date.now() - 60_000),
          evidenceReference: "evidence-1",
          expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000),
          id: "policy-1",
          jurisdictionCode: "US",
          outcome: input.outcome ?? "ALLOWED",
          revision: 1,
          revokedAt: input.revokedAt ?? null,
          subject: input.subject,
          vertical: "PHARMACY",
        },
        {
          approvalReference: "approval-2",
          channel: "WHATSAPP",
          effectiveAt: new Date(Date.now() - 60_000),
          evidenceReference: "evidence-2",
          expiresAt: new Date(Date.now() + 60_000),
          id: "policy-notification",
          jurisdictionCode: "US",
          outcome: input.notificationOutcome ?? "ALLOWED",
          revision: 1,
          revokedAt: null,
          subject: "WHATSAPP",
          vertical: "PHARMACY",
        },
      ],
    },
    prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
    prescriptionStoreSettings: {
      findFirst: async () => ({ id: "settings-1" }),
    },
    store: {
      findFirst: async () => ({ countryCode: "US" }),
    },
  }
}

function acceptedPrescriptionOrder() {
  return {
    acceptedCommerceQuoteVersion: {
      fulfilmentPromise: "Delivery tomorrow",
      fulfilmentType: "DELIVERY",
      id: "version-1",
      quote: { sourceId: "request-1", sourceType: "PRESCRIPTION_REQUEST" },
      status: "ACCEPTED",
      totalMinor: 20_000_00,
    },
    currencyCode: "NGN",
    id: "order-1",
    paymentStatus: "PAID",
    status: "FULFILLING",
  }
}

describe("prescription delivery queue", () => {
  test("scopes the active queue to paid, non-terminal delivery orders", async () => {
    const findManyInputs: unknown[] = []
    const db = {
      commercialOrder: {
        findMany: async (input: unknown) => {
          findManyInputs.push(input)
          return []
        },
      },
    } as unknown as PrismaClient

    await expect(
      listPrescriptionDeliveryQueue(db, {
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual([])
    expect(findManyInputs).toEqual([
      expect.objectContaining({
        where: {
          paymentStatus: "PAID",
          prescriptionDeliveryAddress: { isNot: null },
          status: {
            in: ["CONFIRMED", "FULFILLING", "OUT_FOR_DELIVERY"],
          },
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      }),
    ])
  })
})

describe("prescription delivery failure handling", () => {
  test("records the failed outcome and queues a customer-safe notification", async () => {
    const assignmentUpdates: unknown[] = []
    const communicationCreates: unknown[] = []
    const events: unknown[] = []
    const orderUpdates: unknown[] = []
    const transaction = {
      ...policyTransaction({ channel: "STAFF", subject: "DELIVERY" }),
      $queryRaw: async () => [{ id: "assignment-1" }],
      commercialOrder: {
        findFirst: async () => acceptedPrescriptionOrder(),
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
          payload: { payloadHash: expect.any(String) },
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

  test("cancels the commercial order when an active delivery is cancelled", async () => {
    const orderUpdates: unknown[] = []
    const transaction = {
      ...policyTransaction({ channel: "STAFF", subject: "DELIVERY" }),
      $queryRaw: async () => [{ id: "assignment-1" }],
      commercialOrder: {
        findFirst: async () => acceptedPrescriptionOrder(),
        findUnique: async () => ({ customerPhone: null }),
        update: async (input: unknown) => {
          orderUpdates.push(input)
          return input
        },
      },
      prescriptionDeliveryAssignment: {
        findFirst: async (input: { select?: unknown }) =>
          input.select
            ? { id: "assignment-1" }
            : {
                id: "assignment-1",
                orderId: "order-1",
                revision: 1,
                status: "READY_FOR_ASSIGNMENT",
              },
        update: async () => ({
          id: "assignment-1",
          revision: 2,
          status: "CANCELLED",
        }),
      },
      prescriptionDeliveryEvent: {
        create: async (input: unknown) => input,
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
        clientOperationId: "delivery-cancel-1",
        status: "cancelled",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({
      assignment: { status: "CANCELLED" },
    })
    expect(orderUpdates).toEqual([
      { data: { status: "CANCELLED" }, where: { id: "order-1" } },
    ])
  })

  test("records delivery progress without persisting a blocked WhatsApp intent", async () => {
    let communicationWritten = false
    const transaction = {
      ...policyTransaction({
        channel: "STAFF",
        notificationOutcome: "RESTRICTED",
        subject: "DELIVERY",
      }),
      $queryRaw: async () => [{ id: "assignment-1" }],
      commercialOrder: {
        findFirst: async () => acceptedPrescriptionOrder(),
        findUnique: async () => ({ customerPhone: "+2348000000000" }),
        update: async () => ({ id: "order-1" }),
      },
      prescriptionCommunicationIntent: {
        upsert: async () => {
          communicationWritten = true
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
        update: async () => ({
          id: "assignment-1",
          revision: 2,
          status: "FAILED",
        }),
      },
      prescriptionDeliveryEvent: {
        create: async () => ({ id: "event-1" }),
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
        clientOperationId: "delivery-failure-policy-1",
        reason: "customer unavailable",
        status: "failed",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({ communicationIntentId: null })
    expect(communicationWritten).toBe(false)
  })
})

describe("prescription fulfilment policy enforcement", () => {
  test("blocks delivery-zone writes when staff delivery policy is unavailable", async () => {
    let zoneCreated = false
    const transaction = {
      ...policyTransaction({
        channel: "STAFF",
        outcome: "RESTRICTED",
        subject: "DELIVERY",
      }),
      prescriptionDeliveryZone: {
        create: async () => {
          zoneCreated = true
          return { id: "zone-1" }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      upsertPrescriptionDeliveryZone(db, {
        actorUserId: "user-1",
        currencyCode: "NGN",
        feePolicy: "fixed",
        fixedFeeMinor: 500,
        matchType: "locality",
        matchValues: ["Lagos"],
        name: "Lagos",
        promiseText: "Today",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
    expect(zoneCreated).toBe(false)
  })

  test("blocks a revoked policy before public delivery address selection", async () => {
    const transaction = policyTransaction({
      channel: "WEB",
      revokedAt: new Date(),
      subject: "DELIVERY",
    })
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      commerceQuoteVersion: {
        findFirst: async (input: { select?: unknown }) =>
          input.select
            ? { id: "version-1" }
            : {
                availabilityOutcome: "FULL",
                currentVersionId: "version-1",
                discountMinor: 0,
                fulfilmentFeeMinor: 0,
                fulfilmentType: "PICKUP",
                id: "version-1",
                lines: [{ outcome: "INCLUDED" }],
                optionSelection: null,
                options: [],
                status: "ISSUED",
                subtotalMinor: 2_500,
                taxMinor: 0,
                totalMinor: 2_500,
                quote: {
                  currentVersionId: "version-1",
                  sourceType: "PRESCRIPTION_REQUEST",
                  store: { prescriptionSettings: { deliveryEnabled: true } },
                  storeId: "store-1",
                  tenantId: "tenant-1",
                },
              },
      },
      prescriptionDeliveryZone: {
        findMany: async () => [
          {
            feePolicy: "MANUAL",
            id: "zone-1",
            matchType: "LOCALITY",
            matchValues: ["Lagos"],
            priority: 1,
            promiseText: "Today",
          },
        ],
      },
    } as unknown as PrismaClient

    await expect(
      revisePrescriptionQuoteForDelivery(db, {
        acceptanceToken: "quote-token",
        address: {
          addressLine1: "1 Main Street",
          locality: "Lagos",
          recipientName: "Ada",
          recipientPhone: "+2348000000000",
        },
      }),
    ).rejects.toMatchObject({
      code: "POLICY_BLOCKED",
    })
  })

  test("blocks an expired policy before manual delivery fee approval", async () => {
    const transaction = policyTransaction({
      channel: "STAFF",
      expiresAt: new Date(Date.now() - 1),
      subject: "DELIVERY",
    })
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
      prescriptionStoreSettings: {
        findFirst: async () => ({ id: "settings-1" }),
      },
    } as unknown as PrismaClient

    await expect(
      approvePrescriptionManualDeliveryFee(db, {
        actorUserId: "user-1",
        addressId: "address-1",
        clientDecisionId: "decision-1",
        feeMinor: 500,
        reason: "outside normal route",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({
      code: "POLICY_BLOCKED",
    })
  })

  test("blocks a prohibited policy before pickup handoff", async () => {
    const transaction = policyTransaction({
      channel: "STAFF",
      outcome: "PROHIBITED",
      subject: "PICKUP",
    })
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
      prescriptionStoreSettings: {
        findFirst: async () => ({ id: "settings-1" }),
      },
    } as unknown as PrismaClient

    await expect(
      handoffPrescriptionPickup(db, {
        actorUserId: "user-1",
        clientOperationId: "handoff-1",
        collectorName: "Ada",
        fulfillmentId: "pickup-1",
        pickupCode: "PICKUP-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({
      code: "POLICY_BLOCKED",
    })
  })

  test("blocks a restricted policy before staff delivery progression", async () => {
    const transaction = policyTransaction({
      channel: "STAFF",
      outcome: "RESTRICTED",
      subject: "DELIVERY",
    })
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
        clientOperationId: "delivery-1",
        status: "in_transit",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({
      code: "POLICY_BLOCKED",
    })
  })
})

describe("prescription fulfilment replay payloads", () => {
  test("rejects a changed delivery transition under the same operation id", async () => {
    const transaction = {
      ...policyTransaction({ channel: "STAFF", subject: "DELIVERY" }),
      $queryRaw: async () => [{ id: "assignment-1" }],
      commercialOrder: {
        findFirst: async () => acceptedPrescriptionOrder(),
      },
      prescriptionDeliveryAssignment: {
        findFirst: async (input: { select?: unknown }) =>
          input.select
            ? { id: "assignment-1" }
            : {
                id: "assignment-1",
                orderId: "order-1",
                revision: 2,
                status: "FAILED",
              },
      },
      prescriptionDeliveryEvent: {
        findFirst: async () => ({ payload: { payloadHash: "original" } }),
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
        clientOperationId: "transition-1",
        reason: "A changed reason",
        status: "rescheduled",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_CONFLICT" })
  })

  test("rejects changed pickup handoff facts under the same operation id", async () => {
    const transaction = {
      ...policyTransaction({ channel: "STAFF", subject: "PICKUP" }),
      $queryRaw: async () => [{ id: "pickup-1" }],
      commercialOrder: {
        findFirst: async () => acceptedPrescriptionOrder(),
      },
      prescriptionPickupEvent: {
        findFirst: async () => ({ payload: { payloadHash: "original" } }),
      },
      prescriptionPickupFulfillment: {
        findFirst: async (input: { select?: unknown }) =>
          input.select
            ? { id: "pickup-1" }
            : {
                handedOffAt: new Date(),
                id: "pickup-1",
                orderId: "order-1",
                packedAt: new Date(),
                status: "HANDED_OFF",
              },
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
      handoffPrescriptionPickup(db, {
        actorUserId: "user-1",
        clientOperationId: "handoff-1",
        collectorName: "Different collector",
        fulfillmentId: "pickup-1",
        pickupCode: "DIFFERENT",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_CONFLICT" })
  })
})
