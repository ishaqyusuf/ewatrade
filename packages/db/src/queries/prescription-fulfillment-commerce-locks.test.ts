import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { transitionPrescriptionDelivery } from "./prescription-fulfillment"

function createTransitionFixture(input: {
  bookPresent: boolean
  changedOrderIdAfterSourceLock?: string
  customerId: string | null
}) {
  const events: string[] = []
  const orderUpdates: unknown[] = []
  const completedAt = new Date("2026-09-30T12:00:00.000Z")
  const order = {
    acceptedCommerceQuoteVersion: {
      fulfilmentPromise: "Delivery today",
      fulfilmentType: "DELIVERY",
      id: "version-1",
      quote: { sourceId: "request-1", sourceType: "PRESCRIPTION_REQUEST" },
      status: "ACCEPTED",
      totalMinor: 20_000,
    },
    completedAt,
    currencyCode: "NGN",
    customerId: input.customerId,
    id: "order-1",
    paymentStatus: "PAID",
    prescriptionDeliveryAddress: { packedAt: new Date() },
    prescriptionDeliveryAssignment: {
      events: [],
      failureCode: null,
      proofReference: null,
      revision: 1,
      status: "IN_TRANSIT",
    },
    prescriptionPickupFulfillment: null,
    status: "FULFILLING",
    storeId: "store-1",
    tenantId: "tenant-1",
    totalMinor: 20_000,
  }
  const assignment = {
    id: "assignment-1",
    orderId: "order-1",
    revision: 1,
    status: "IN_TRANSIT",
    storeId: "store-1",
    tenantId: "tenant-1",
  }
  let assignmentReads = 0
  const transaction = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("")
      if (sql.includes('FROM "FinanceBook"')) {
        events.push("book-lock")
        return input.bookPresent ? [{ id: "book-1" }] : []
      }
      if (sql.includes('FROM "CustomerLedgerAccount"')) {
        events.push("account-lock")
        return [{ id: "account-1" }]
      }
      if (sql.includes('FROM "CommercialOrder"')) {
        events.push("order-lock")
        return [{ id: "order-1" }]
      }
      if (sql.includes('FROM "PrescriptionDeliveryAssignment"')) {
        events.push("assignment-lock")
        return [{ id: "assignment-1" }]
      }
      throw new Error(`Unexpected lock query: ${sql}`)
    },
    commercialOrder: {
      findFirst: async () => order,
      findUnique: async () => ({ customerPhone: null }),
      update: async (value: unknown) => {
        orderUpdates.push(value)
        return value
      },
    },
    prescriptionDeliveryAssignment: {
      findFirst: async () => {
        assignmentReads += 1
        if (
          assignmentReads > 1 &&
          input.changedOrderIdAfterSourceLock !== undefined
        ) {
          return {
            ...assignment,
            orderId: input.changedOrderIdAfterSourceLock,
          }
        }
        return assignment
      },
      update: async () => ({ ...assignment, revision: 2, status: "DELIVERED" }),
    },
    prescriptionDeliveryEvent: {
      create: async (value: unknown) => value,
      findFirst: async () => null,
    },
    prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
    prescriptionStoreSettings: {
      findFirst: async () => ({ id: "settings-1" }),
    },
    prescriptionUsageEvent: { upsert: async () => ({ id: "usage-1" }) },
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
          jurisdictionCode: "NG",
          outcome: "ALLOWED",
          revision: 1,
          revokedAt: null,
          subject: "DELIVERY",
          vertical: "PHARMACY",
        },
        {
          approvalReference: "approval-2",
          channel: "WHATSAPP",
          effectiveAt: new Date(Date.now() - 60_000),
          evidenceReference: "evidence-2",
          expiresAt: new Date(Date.now() + 60_000),
          id: "policy-2",
          jurisdictionCode: "NG",
          outcome: "ALLOWED",
          revision: 1,
          revokedAt: null,
          subject: "WHATSAPP",
          vertical: "PHARMACY",
        },
      ],
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
  }
  const db = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    prescriptionStoreRole: { findFirst: async () => ({ id: "role-1" }) },
    prescriptionStoreSettings: {
      findFirst: async () => ({ id: "settings-1" }),
    },
  } as unknown as PrismaClient

  return { completedAt, db, events, orderUpdates }
}

async function completeDelivery(db: PrismaClient) {
  return transitionPrescriptionDelivery(db, {
    actorUserId: "user-1",
    assignmentId: "assignment-1",
    clientOperationId: "delivery-complete-1",
    proofReference: "proof-1",
    status: "delivered",
    storeId: "store-1",
    tenantId: "tenant-1",
  })
}

describe("prescription fulfillment Commerce locking", () => {
  test("locks Order before the delivery source when no FinanceBook exists", async () => {
    const fixture = createTransitionFixture({
      bookPresent: false,
      customerId: null,
    })

    await completeDelivery(fixture.db)

    expect(fixture.events).toEqual([
      "book-lock",
      "order-lock",
      "assignment-lock",
    ])
    expect(fixture.orderUpdates).toEqual([
      {
        data: { completedAt: fixture.completedAt, status: "COMPLETED" },
        where: { id: "order-1" },
      },
    ])
  })

  test("locks FinanceBook, existing customer account, Order, then assignment", async () => {
    const fixture = createTransitionFixture({
      bookPresent: true,
      customerId: "customer-1",
    })

    await completeDelivery(fixture.db)

    expect(fixture.events).toEqual([
      "book-lock",
      "account-lock",
      "order-lock",
      "assignment-lock",
    ])
    expect(fixture.orderUpdates).toEqual([
      {
        data: { completedAt: fixture.completedAt, status: "COMPLETED" },
        where: { id: "order-1" },
      },
    ])
  })

  test("rejects an assignment whose Order linkage changes after source locking", async () => {
    const fixture = createTransitionFixture({
      bookPresent: true,
      changedOrderIdAfterSourceLock: "order-2",
      customerId: "customer-1",
    })

    await expect(completeDelivery(fixture.db)).rejects.toMatchObject({
      code: "FULFILLMENT_CONFLICT",
    })
    expect(fixture.events).toEqual([
      "book-lock",
      "account-lock",
      "order-lock",
      "assignment-lock",
    ])
    expect(fixture.orderUpdates).toHaveLength(0)
  })
})
