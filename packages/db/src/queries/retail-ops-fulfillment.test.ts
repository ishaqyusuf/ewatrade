import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  createRetailOpsDeliveryRequest,
  listRetailOpsDeliveryRequests,
  updateRetailOpsDeliveryRequestStatus,
} from "./retail-ops-fulfillment"

type FulfillmentCall = {
  data?: unknown
  kind: string
  where?: unknown
}

const BASE_ORDER_METADATA = {
  retailOps: {
    fulfillment: {
      method: "delivery",
      status: "pending",
    },
    shareLinkCreatorUserId: "user_owner",
    shareLinkId: "share_123",
    shareToken: "share-token",
    source: "retail_ops_share_link_order_request",
  },
} as const

function createOrderRow(metadata: unknown = BASE_ORDER_METADATA) {
  return {
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    currencyCode: "NGN",
    customerEmail: "customer@example.com",
    customerName: "Customer Name",
    customerPhone: "08000000000",
    id: "order_123",
    metadata,
    orderNumber: "ORD-123",
    paymentStatus: "PAID",
    status: "COMPLETED",
    totalMinor: 5000,
    updatedAt: new Date("2026-07-12T08:05:00.000Z"),
  }
}

function createDeliveryRequestRow(input?: {
  assignment?: ReturnType<typeof createAssignmentRow> | null
  completedAt?: Date | null
  order?: ReturnType<typeof createOrderRow>
  status?: string
  trackingEventCount?: number
}) {
  return {
    _count: {
      bids: 0,
      trackingEvents: input?.trackingEventCount ?? 0,
    },
    assignedAt: null,
    assignment: input?.assignment ?? null,
    completedAt: input?.completedAt ?? null,
    createdAt: new Date("2026-07-12T08:06:00.000Z"),
    dropoffAddress: "Customer street",
    dropoffName: "Customer Name",
    dropoffPhone: "08000000000",
    id: "delivery_123",
    notes: "Call before delivery",
    order: input?.order ?? createOrderRow(),
    orderId: "order_123",
    pickupAddress: "Store street",
    pickupName: "Rice Store",
    pickupPhone: "08111111111",
    requestedAt: new Date("2026-07-12T08:06:00.000Z"),
    status: input?.status ?? "OPEN",
    tenantId: "tenant_123",
    updatedAt: new Date("2026-07-12T08:07:00.000Z"),
  }
}

function createAssignmentRow() {
  return {
    assignedDriverName: "Driver Name",
    assignedDriverPhone: "09000000000",
    dispatchTenantId: "tenant_123",
    id: "assignment_123",
    providerProfile: null,
    status: "COMPLETED",
  }
}

function createMockCreateDb() {
  const calls: FulfillmentCall[] = []
  const order = createOrderRow()
  const createdRequest = createDeliveryRequestRow({ order })

  const tx = {
    deliveryRequest: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "deliveryRequest.create" })

        return createdRequest
      },
    },
    order: {
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return order
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    deliveryRequest: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "deliveryRequest.findFirst", where })

        return null
      },
    },
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return order
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockUpdateDb() {
  const calls: FulfillmentCall[] = []
  const happenedAt = new Date("2026-07-12T09:00:00.000Z")
  const order = createOrderRow({
    retailOps: {
      ...BASE_ORDER_METADATA.retailOps,
      deliveryRequest: {
        createdAt: "2026-07-12T08:06:00.000Z",
        createdByUserId: "user_owner",
        id: "delivery_123",
        requestedAt: "2026-07-12T08:06:00.000Z",
        source: "durable",
        status: "open",
        updatedAt: "2026-07-12T08:07:00.000Z",
      },
    },
  })
  const existingRequest = createDeliveryRequestRow({ order })
  const updatedRequest = {
    ...existingRequest,
    _count: {
      bids: 0,
      trackingEvents: 1,
    },
    assignedAt: happenedAt,
    assignment: createAssignmentRow(),
    completedAt: happenedAt,
    status: "DELIVERED",
    updatedAt: happenedAt,
  }

  const tx = {
    deliveryAssignment: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "deliveryAssignment.upsert",
          where,
        })

        return createAssignmentRow()
      },
    },
    deliveryRequest: {
      findUniqueOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "deliveryRequest.findUniqueOrThrow", where })

        return updatedRequest
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "deliveryRequest.update", where })

        return updatedRequest
      },
    },
    order: {
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return order
      },
    },
    trackingEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "trackingEvent.create" })

        return { id: "tracking_123" }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    deliveryRequest: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "deliveryRequest.findFirst", where })

        return existingRequest
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    happenedAt,
  }
}

function createMetadataDeliveryOrder() {
  return createOrderRow({
    retailOps: {
      ...BASE_ORDER_METADATA.retailOps,
      deliveryRequest: {
        assignedAt: null,
        completedAt: null,
        createdAt: "2026-07-12T08:12:00.000Z",
        createdByUserId: "user_owner",
        dropoffAddress: "Second customer street",
        dropoffName: "Second Customer",
        dropoffPhone: "08000000001",
        id: "metadata:order_metadata_123",
        notes: "Deliver after noon",
        pickupAddress: "Store street",
        pickupName: "Rice Store",
        pickupPhone: "08111111111",
        requestedAt: "2026-07-12T08:12:00.000Z",
        source: "metadata",
        status: "open",
        updatedAt: "2026-07-12T08:13:00.000Z",
      },
    },
  })
}

function createMockListDb() {
  const calls: FulfillmentCall[] = []
  const durableOrder = createOrderRow()
  const metadataOrder = {
    ...createMetadataDeliveryOrder(),
    customerEmail: "second@example.com",
    customerName: "Second Customer",
    id: "order_metadata_123",
    orderNumber: "ORD-456",
    updatedAt: new Date("2026-07-12T08:13:00.000Z"),
  }
  const durableRequest = createDeliveryRequestRow({
    order: durableOrder,
    status: "OPEN",
  })
  const db = {
    deliveryRequest: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "deliveryRequest.findMany", where })

        return [durableRequest]
      },
    },
    order: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findMany", where })

        return [durableOrder, metadataOrder]
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function getCall(calls: FulfillmentCall[], kind: string) {
  const call = calls.find((currentCall) => currentCall.kind === kind)
  expect(call, `Expected ${kind} to be called`).toBeTruthy()

  return call
}

describe("retail ops fulfillment queries", () => {
  test("lists delivery requests by merging durable rows with metadata fallback rows", async () => {
    const db = createMockListDb()

    const result = await listRetailOpsDeliveryRequests(db.client, {
      actorUserId: "user_owner",
      canManageAllRequests: false,
      from: new Date("2026-07-12T00:00:00.000Z"),
      limit: 10,
      status: "open",
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      customer: {
        email: "second@example.com",
        name: "Second Customer",
        phone: "08000000000",
      },
      dropoff: {
        address: "Second customer street",
        name: "Second Customer",
        phone: "08000000001",
      },
      id: "metadata:order_metadata_123",
      notes: "Deliver after noon",
      order: {
        currencyCode: "NGN",
        id: "order_metadata_123",
        orderNumber: "ORD-456",
        paymentStatus: "PAID",
        status: "COMPLETED",
        totalMinor: 5000,
      },
      requestedAt: new Date("2026-07-12T08:12:00.000Z"),
      shareLink: {
        createdByUserId: "user_owner",
        id: "share_123",
        token: "share-token",
      },
      source: "metadata",
      status: "open",
    })
    expect(result[1]).toMatchObject({
      customer: {
        email: "customer@example.com",
        name: "Customer Name",
        phone: "08000000000",
      },
      id: "delivery_123",
      order: {
        id: "order_123",
        orderNumber: "ORD-123",
      },
      shareLink: {
        createdByUserId: "user_owner",
        id: "share_123",
        token: "share-token",
      },
      source: "durable",
      status: "open",
    })
    expect(getCall(db.calls, "deliveryRequest.findMany")).toMatchObject({
      where: {
        order: {
          AND: [
            {
              metadata: {
                equals: "retail_ops_share_link_order_request",
                path: ["retailOps", "source"],
              },
            },
            {
              metadata: {
                equals: "user_owner",
                path: ["retailOps", "shareLinkCreatorUserId"],
              },
            },
          ],
          storeId: "store_123",
          tenantId: "tenant_123",
        },
        requestedAt: {
          gte: new Date("2026-07-12T00:00:00.000Z"),
          lte: new Date("2026-07-12T23:59:59.999Z"),
        },
        status: "OPEN",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "order.findMany")).toMatchObject({
      where: {
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
  })

  test("creates a durable delivery request and mirrors delivery metadata to the order", async () => {
    const db = createMockCreateDb()

    const result = await createRetailOpsDeliveryRequest(db.client, {
      actorUserId: "user_owner",
      canManageAllRequests: false,
      dropoffAddress: "Customer street",
      dropoffName: "Customer Name",
      dropoffPhone: "08000000000",
      notes: " Call before delivery ",
      orderId: "order_123",
      pickupAddress: "Store street",
      pickupName: "Rice Store",
      pickupPhone: "08111111111",
      requestedAt: new Date("2026-07-12T08:06:00.000Z"),
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      customer: {
        email: "customer@example.com",
        name: "Customer Name",
      },
      dropoff: {
        address: "Customer street",
        name: "Customer Name",
      },
      id: "delivery_123",
      notes: "Call before delivery",
      order: {
        id: "order_123",
        orderNumber: "ORD-123",
      },
      pickup: {
        address: "Store street",
        name: "Rice Store",
      },
      shareLink: {
        createdByUserId: "user_owner",
        id: "share_123",
        token: "share-token",
      },
      source: "durable",
      status: "open",
    })
    expect(getCall(db.calls, "deliveryRequest.create")).toMatchObject({
      data: {
        dropoffAddress: "Customer street",
        notes: "Call before delivery",
        orderId: "order_123",
        pickupAddress: "Store street",
        status: "OPEN",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "order.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            deliveryRequest: {
              createdByUserId: "user_owner",
              id: "delivery_123",
              source: "durable",
              status: "open",
            },
            fulfillment: {
              method: "delivery",
              status: "pending",
            },
          },
        },
      },
      where: {
        id: "order_123",
      },
    })
  })

  test("marks a durable delivery request delivered with assignment, tracking, and order metadata", async () => {
    const db = createMockUpdateDb()

    const result = await updateRetailOpsDeliveryRequestStatus(db.client, {
      actorUserId: "user_owner",
      assignedDriverName: "Driver Name",
      assignedDriverPhone: "09000000000",
      canManageAllRequests: false,
      deliveryRequestId: "delivery_123",
      happenedAt: db.happenedAt,
      note: "Delivered at front desk",
      status: "delivered",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      assignedAt: db.happenedAt,
      assignment: {
        assignedDriverName: "Driver Name",
        assignedDriverPhone: "09000000000",
        status: "completed",
      },
      completedAt: db.happenedAt,
      id: "delivery_123",
      source: "durable",
      status: "delivered",
      trackingEventCount: 1,
    })
    expect(getCall(db.calls, "deliveryRequest.update")).toMatchObject({
      data: {
        assignedAt: db.happenedAt,
        completedAt: db.happenedAt,
        status: "DELIVERED",
      },
      where: {
        id: "delivery_123",
      },
    })
    expect(getCall(db.calls, "deliveryAssignment.upsert")).toMatchObject({
      data: {
        create: {
          assignedDriverName: "Driver Name",
          assignedDriverPhone: "09000000000",
          deliveredAt: db.happenedAt,
          dispatchTenantId: "tenant_123",
          pickedUpAt: db.happenedAt,
          requestId: "delivery_123",
          status: "COMPLETED",
        },
        update: {
          assignedDriverName: "Driver Name",
          assignedDriverPhone: "09000000000",
          deliveredAt: db.happenedAt,
          pickedUpAt: db.happenedAt,
          status: "COMPLETED",
        },
      },
      where: {
        requestId: "delivery_123",
      },
    })
    expect(getCall(db.calls, "trackingEvent.create")).toMatchObject({
      data: {
        description: "Delivered at front desk",
        eventType: "delivered",
        happenedAt: db.happenedAt,
        requestId: "delivery_123",
      },
    })
    expect(getCall(db.calls, "order.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            deliveryRequest: {
              assignedAt: db.happenedAt.toISOString(),
              completedAt: db.happenedAt.toISOString(),
              deliveredAt: db.happenedAt.toISOString(),
              id: "delivery_123",
              lastStatusNote: "Delivered at front desk",
              pickedUpAt: db.happenedAt.toISOString(),
              status: "delivered",
              statusUpdatedByUserId: "user_owner",
            },
            fulfillment: {
              fulfilledAt: db.happenedAt.toISOString(),
              fulfilledByUserId: "user_owner",
              method: "delivery",
              note: "Delivered at front desk",
              status: "delivered",
            },
          },
        },
      },
      where: {
        id: "order_123",
      },
    })
  })
})
