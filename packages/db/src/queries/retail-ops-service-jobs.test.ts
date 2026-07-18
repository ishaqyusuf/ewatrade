import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  assignRetailOpsServiceJob,
  convertRetailOpsServiceRequestToSale,
  delayRetailOpsServiceJob,
  getPublicRetailOpsServiceTracking,
  getRetailOpsServiceOperationsReport,
  queueRetailOpsServiceReadyNotification,
} from "./retail-ops-service-jobs"

describe("retail ops service jobs", () => {
  test("assigns an active business member with an internal audit event", async () => {
    const calls: Array<{ data?: unknown; kind: string }> = []
    const updatedJob = {
      assignedUserId: "user_operator",
      cancelledAt: null,
      completedAt: null,
      createdAt: new Date("2026-07-17T08:00:00.000Z"),
      dueAt: null,
      events: [
        {
          actorUserId: "user_owner",
          fromStatus: null,
          happenedAt: new Date("2026-07-17T09:00:00.000Z"),
          id: "event_assignment",
          note: "Assigned to Service Operator.",
          revisedDueAt: null,
          toStatus: null,
          type: "ASSIGNED",
        },
      ],
      evidence: [],
      id: "job_123",
      lines: [],
      order: {
        currencyCode: "NGN",
        customerEmail: null,
        customerName: "Customer",
        customerPhone: null,
        id: "order_123",
        orderNumber: "SALE-123",
        paymentStatus: "PAID",
        totalMinor: 10_000,
      },
      status: "RECEIVED",
      trackingToken: "opaque-tracking-token",
      updatedAt: new Date("2026-07-17T09:00:00.000Z"),
    }
    const tx = {
      membership: {
        findFirst: async () => ({
          user: {
            displayName: "Service Operator",
            email: "operator@test.com",
            name: "Operator",
          },
          userId: "user_operator",
        }),
      },
      serviceJob: {
        findFirst: async () => ({
          assignedUserId: null,
          id: "job_123",
          status: "RECEIVED",
        }),
        findUniqueOrThrow: async () => updatedJob,
        update: async ({ data }: { data: unknown }) => {
          calls.push({ data, kind: "serviceJob.update" })
          return { id: "job_123" }
        },
      },
      serviceJobEvent: {
        create: async ({ data }: { data: unknown }) => {
          calls.push({ data, kind: "serviceJobEvent.create" })
          return { id: "event_assignment" }
        },
      },
    }
    const db = {
      $transaction: async <T>(
        callback: (transaction: typeof tx) => Promise<T>,
      ) => callback(tx),
    } as unknown as PrismaClient

    const result = await assignRetailOpsServiceJob(db, {
      actorUserId: "user_owner",
      assignedUserId: "user_operator",
      jobId: "job_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      assignedUserId: "user_operator",
      events: [
        {
          type: "assigned",
        },
      ],
      id: "job_123",
    })
    expect(calls).toContainEqual({
      data: {
        assignedUserId: "user_operator",
      },
      kind: "serviceJob.update",
    })
    expect(calls).toContainEqual({
      data: expect.objectContaining({
        actorUserId: "user_owner",
        serviceJobId: "job_123",
        type: "ASSIGNED",
      }),
      kind: "serviceJobEvent.create",
    })
  })

  test("returns a privacy-safe public tracking projection", async () => {
    const db = {
      serviceJob: {
        findUnique: async () => ({
          createdAt: new Date("2026-07-17T08:00:00.000Z"),
          dueAt: new Date("2026-07-18T08:00:00.000Z"),
          events: [
            {
              actorUserId: "private_actor",
              happenedAt: new Date("2026-07-17T08:00:00.000Z"),
              id: "private_event_id",
              note: "Private handling note",
              revisedDueAt: null,
              toStatus: "RECEIVED",
              type: "CREATED",
            },
          ],
          evidence: [
            {
              id: "private_evidence_id",
              url: "https://private.example/evidence.jpg",
            },
          ],
          lines: [
            {
              nameSnapshot: "Shirt cleaning",
              quantity: 2,
              totalPriceMinor: 1_000,
              unitPriceMinor: 500,
              variantNameSnapshot: "Standard",
            },
          ],
          order: {
            currencyCode: "NGN",
            customerEmail: "private@example.com",
            customerPhone: "+2348000000000",
            orderNumber: "SALE-100",
            paymentStatus: "PAID",
            totalMinor: 1_000,
          },
          status: "RECEIVED",
          store: {
            name: "Example Services",
            slug: "example-services",
          },
          updatedAt: new Date("2026-07-17T08:10:00.000Z"),
        }),
      },
    } as unknown as PrismaClient

    const result = await getPublicRetailOpsServiceTracking(db, {
      trackingToken: "opaque-public-token",
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      business: {
        name: "Example Services",
      },
      reference: "SALE-100",
      status: "received",
      payment: {
        currencyCode: "NGN",
        status: "PAID",
        totalMinor: 1_000,
      },
    })
    expect(serialized).not.toContain("private_actor")
    expect(serialized).not.toContain("Private handling note")
    expect(serialized).not.toContain("private_evidence_id")
    expect(serialized).not.toContain("private@example.com")
    expect(serialized).not.toContain("+2348000000000")
  })

  test("deduplicates ready notification intents by service job", async () => {
    const calls: Array<Record<string, unknown>> = []
    const db = {
      serviceJob: {
        findFirst: async () => ({
          id: "job_123",
          order: {
            customerEmail: null,
            customerName: "Ada",
            customerPhone: "+2348000000000",
            orderNumber: "SALE-123",
          },
        }),
      },
      serviceNotificationIntent: {
        upsert: async (input: Record<string, unknown>) => {
          calls.push(input)
          return {
            createdAt: new Date("2026-07-17T08:00:00.000Z"),
            id: "intent_123",
            manualCopy: "Ada, service job SALE-123 is ready.",
            status: "PENDING",
          }
        },
      },
    } as unknown as PrismaClient

    await queueRetailOpsServiceReadyNotification(db, {
      jobId: "job_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    await queueRetailOpsServiceReadyNotification(db, {
      jobId: "job_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      create: {
        dedupeKey: "service-ready:job_123",
      },
      where: {
        dedupeKey: "service-ready:job_123",
      },
    })
    expect(calls[1]).toMatchObject({
      where: {
        dedupeKey: "service-ready:job_123",
      },
    })
  })

  test("returns the original sale when a converted request is retried", async () => {
    const requestUpdates: Array<Record<string, unknown>> = []
    const existingOrder = {
      id: "order_123",
      items: [
        {
          kindSnapshot: "SERVICE",
          nameSnapshot: "Shirt cleaning",
          productId: "service_shirt",
          productVariant: {
            id: "variant_standard",
            name: "Standard",
          },
          productVariantId: "variant_standard",
          quantity: 2,
          totalPriceMinor: 1_000,
          unitPriceMinor: 500,
        },
      ],
      orderNumber: "SALE-123",
      paymentStatus: "PAID",
      receipts: [
        {
          id: "receipt_123",
          receiptNumber: "RCPT-123",
          totalMinor: 1_000,
        },
      ],
      serviceJob: {
        id: "job_123",
        status: "RECEIVED",
        trackingToken: "opaque-tracking-token",
      },
      status: "COMPLETED",
      totalMinor: 1_000,
    }
    const tx = {
      order: {
        findFirst: async () => existingOrder,
      },
    }
    const db = {
      $transaction: async <T>(
        callback: (transaction: typeof tx) => Promise<T>,
      ) => callback(tx),
      serviceRequest: {
        findFirst: async () => ({
          convertedOrderId: "order_123",
          customerEmail: null,
          customerName: "Ada",
          customerPhone: null,
          id: "request_123",
          lines: [
            {
              productVariantId: "variant_standard",
              quantity: 2,
            },
          ],
          notes: null,
          status: "CONVERTED",
        }),
        updateMany: async (input: Record<string, unknown>) => {
          requestUpdates.push(input)
          return { count: 0 }
        },
      },
    } as unknown as PrismaClient

    const result = await convertRetailOpsServiceRequestToSale(db, {
      actorUserId: "user_owner",
      paymentMethod: "cash",
      requestId: "request_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      order: {
        id: "order_123",
        totalMinor: 1_000,
      },
      serviceJob: {
        id: "job_123",
        status: "received",
      },
    })
    expect(requestUpdates).toHaveLength(1)
  })

  test("rejects delay events after a service job is terminal", async () => {
    const tx = {
      serviceJob: {
        findFirst: async () => ({
          id: "job_123",
          order: {
            customerEmail: null,
            customerName: "Ada",
            customerPhone: null,
            orderNumber: "SALE-123",
          },
          status: "COMPLETED",
        }),
      },
    }
    const db = {
      $transaction: async <T>(
        callback: (transaction: typeof tx) => Promise<T>,
      ) => callback(tx),
    } as unknown as PrismaClient

    await expect(
      delayRetailOpsServiceJob(db, {
        actorUserId: "user_owner",
        dueAt: new Date("2026-07-20T10:00:00.000Z"),
        jobId: "job_123",
        note: "Unexpected delay",
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toThrow("A completed service job cannot be delayed.")
  })

  test("reports due, delay, completion, popularity, and request conversion", async () => {
    const now = Date.now()
    const db = {
      serviceJob: {
        findMany: async () => [
          {
            assignedUserId: "user_operator",
            completedAt: new Date(now - 60 * 60 * 1_000),
            createdAt: new Date(now - 25 * 60 * 60 * 1_000),
            dueAt: new Date(now - 2 * 60 * 60 * 1_000),
            events: [
              { actorUserId: "user_operator", type: "DELAYED" },
              { actorUserId: "user_operator", type: "STATUS_CHANGED" },
            ],
            lines: [
              {
                cancelledAt: null,
                nameSnapshot: "Standard consultation",
                orderItemId: "line_consultation_1",
                productId: "service_consultation",
                quantity: 2,
                totalPriceMinor: 1_000,
              },
            ],
            order: {
              paymentEvents: [],
              paymentStatus: "PAID",
            },
            status: "COMPLETED",
          },
          {
            assignedUserId: null,
            completedAt: null,
            createdAt: new Date(now - 2 * 60 * 60 * 1_000),
            dueAt: new Date(now - 60 * 60 * 1_000),
            events: [],
            lines: [
              {
                cancelledAt: null,
                nameSnapshot: "Standard consultation",
                orderItemId: "line_consultation_2",
                productId: "service_consultation",
                quantity: 1,
                totalPriceMinor: 500,
              },
            ],
            order: {
              paymentEvents: [],
              paymentStatus: "PENDING",
            },
            status: "IN_PROGRESS",
          },
        ],
      },
      serviceRequest: {
        groupBy: async () => [
          { _count: { _all: 3 }, status: "PENDING" },
          { _count: { _all: 1 }, status: "CONVERTED" },
        ],
      },
    } as unknown as PrismaClient

    const report = await getRetailOpsServiceOperationsReport(db, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(report).toMatchObject({
      delayedJobCount: 1,
      jobCount: 2,
      overdueCount: 1,
      requestConversionRate: 0.25,
      revenueMinor: 1_500,
      serviceRequestCounts: {
        converted: 1,
        pending: 3,
      },
      statusCounts: {
        completed: 1,
        in_progress: 1,
      },
    })
    expect(report.averageCompletionHours).toBe(24)
    expect(report.popularServices[0]).toMatchObject({
      itemName: "Standard consultation",
      jobCount: 2,
      quantity: 3,
      revenueMinor: 1_500,
    })
    expect(report.staffActivity[0]).toMatchObject({
      assignedJobCount: 1,
      eventCount: 2,
      userId: "user_operator",
    })
  })

  test("derives net service revenue from line refunds and excludes cancelled work from popularity", async () => {
    const now = Date.now()
    const db = {
      serviceJob: {
        findMany: async () => [
          {
            assignedUserId: null,
            completedAt: null,
            createdAt: new Date(now - 60_000),
            dueAt: null,
            events: [],
            lines: [
              {
                cancelledAt: new Date(now),
                nameSnapshot: "Installation visit",
                orderItemId: "line_installation",
                productId: "service_installation",
                quantity: 1,
                totalPriceMinor: 2_000,
              },
              {
                cancelledAt: null,
                nameSnapshot: "Maintenance package",
                orderItemId: "line_maintenance",
                productId: "service_maintenance",
                quantity: 1,
                totalPriceMinor: 3_000,
              },
            ],
            order: {
              paymentEvents: [
                {
                  amountMinor: 2_000,
                  metadata: {
                    orderItemId: "line_installation",
                  },
                },
              ],
              paymentStatus: "PARTIALLY_REFUNDED",
            },
            status: "IN_PROGRESS",
          },
        ],
      },
      serviceRequest: {
        groupBy: async () => [],
      },
    } as unknown as PrismaClient

    const report = await getRetailOpsServiceOperationsReport(db, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(report.revenueMinor).toBe(3_000)
    expect(report.popularServices).toEqual([
      {
        itemId: "service_maintenance",
        itemName: "Maintenance package",
        jobCount: 1,
        quantity: 1,
        revenueMinor: 3_000,
      },
    ])
  })
})
