import { describe, expect, test } from "bun:test"
import { type TRPCContext, createCallerFactory } from "../init"
import { retailOpsRouter } from "./retail-ops"

type FollowUpCall = {
  data?: unknown
  kind: string
  where?: unknown
}

type FollowUpReceipt = {
  id: string
  issuedAt: Date
  paymentMethod: string | null
  receiptNumber: string
  totalMinor: number
}

const BASE_ORDER_METADATA = {
  retailOps: {
    shareLinkCreatorUserId: "user_owner",
    shareLinkId: "share_123",
    shareToken: "share-token",
    source: "retail_ops_share_link_order_request",
    stockReservation: {
      inventoryItemId: "inventory_123",
      productVariantId: "variant_123",
      quantity: 2,
      reservedAt: "2026-07-12T08:00:00.000Z",
      status: "reserved",
    },
  },
} as const

function createOrderRow(metadata: unknown = BASE_ORDER_METADATA) {
  return {
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    currencyCode: "NGN",
    customerEmail: "customer@example.com",
    customerName: "Customer Name",
    customerPhone: null,
    id: "order_123",
    items: [
      {
        id: "line_123",
        metadata: {
          retailOps: {
            unitName: "Bag",
          },
        },
        nameSnapshot: "Rice",
        product: {
          metadata: {
            retailOps: {
              shareLinks: [
                {
                  active: true,
                  createdAt: "2026-07-12T08:00:00.000Z",
                  createdByUserId: "user_owner",
                  id: "share_123",
                  label: "Rice link",
                  token: "share-token",
                  url: "https://shop.example.com/p/rice?share=share-token",
                },
              ],
            },
          },
        },
        productId: "product_123",
        productVariantId: "variant_123",
        quantity: 2,
        skuSnapshot: null,
        totalPriceMinor: 5000,
        unitPriceMinor: 2500,
      },
    ],
    metadata,
    notes: "Call before pickup",
    orderNumber: "ORD-123",
    paymentStatus: "PENDING",
    receipts: [] as FollowUpReceipt[],
    status: "PENDING",
    totalMinor: 5000,
    updatedAt: new Date("2026-07-12T08:05:00.000Z"),
  }
}

function createMockFollowUpDb() {
  const calls: FollowUpCall[] = []
  const order = createOrderRow()
  const receipts: FollowUpReceipt[] = []

  const tx = {
    inventoryItem: {
      updateMany: async ({
        data,
        where,
      }: {
        data: unknown
        where: unknown
      }) => {
        calls.push({ data, kind: "inventoryItem.updateMany", where })
        return { count: 1 }
      },
    },
    order: {
      update: async ({
        data,
      }: {
        data: { metadata: unknown; paymentStatus?: string; status: string }
      }) => {
        calls.push({ data, kind: "order.update" })
        order.metadata = data.metadata
        order.paymentStatus = data.paymentStatus ?? order.paymentStatus
        order.status = data.status
        order.updatedAt = new Date("2026-07-12T08:10:00.000Z")
        order.receipts = receipts

        return order
      },
    },
    productShareLinkAnalyticsDaily: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "productShareLinkAnalyticsDaily.create" })
        return { id: "analytics_123" }
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: unknown
        where: unknown
      }) => {
        calls.push({
          data,
          kind: "productShareLinkAnalyticsDaily.updateMany",
          where,
        })
        return { count: 0 }
      },
    },
    productShareLinkOrderRequest: {
      findFirst: async () => ({
        productId: "product_123",
        quantity: 2,
        shareLinkId: "share_123",
        totalMinor: 5000,
      }),
      updateMany: async ({
        data,
        where,
      }: {
        data: unknown
        where: unknown
      }) => {
        calls.push({
          data,
          kind: "productShareLinkOrderRequest.updateMany",
          where,
        })
        return { count: 1 }
      },
    },
    productShareLinkReservation: {
      updateMany: async ({
        data,
        where,
      }: {
        data: unknown
        where: unknown
      }) => {
        calls.push({
          data,
          kind: "productShareLinkReservation.updateMany",
          where,
        })
        return { count: 1 }
      },
    },
    receipt: {
      create: async ({
        data,
      }: {
        data: { issuedAt: Date; paymentMethod: string; totalMinor: number }
      }) => {
        calls.push({ data, kind: "receipt.create" })
        const receipt = {
          id: "receipt_123",
          issuedAt: data.issuedAt,
          paymentMethod: data.paymentMethod,
          receiptNumber: "RCPT-123",
          totalMinor: data.totalMinor,
        }
        receipts.push(receipt)

        return receipt
      },
    },
  }

  const client = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return {
          metadata: order.metadata,
          status: order.status,
          totalMinor: order.totalMinor,
        }
      },
    },
  }

  return {
    calls,
    client,
  }
}

const BASE_DELIVERY_ORDER_METADATA = {
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

function createDeliveryOrderRow(
  metadata: unknown = BASE_DELIVERY_ORDER_METADATA,
) {
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

function createDeliveryAssignmentRow() {
  return {
    assignedDriverName: "Driver Name",
    assignedDriverPhone: "09000000000",
    dispatchTenantId: "tenant_123",
    id: "assignment_123",
    providerProfile: null,
    status: "COMPLETED",
  }
}

function createDeliveryRequestRow(input?: {
  assignment?: ReturnType<typeof createDeliveryAssignmentRow> | null
  completedAt?: Date | null
  order?: ReturnType<typeof createDeliveryOrderRow>
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
    order: input?.order ?? createDeliveryOrderRow(),
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

function createMockDeliveryCreateDb() {
  const calls: FollowUpCall[] = []
  const order = createDeliveryOrderRow()
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
  const client = {
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
    client,
  }
}

function createMockDeliveryUpdateDb() {
  const calls: FollowUpCall[] = []
  const happenedAt = new Date("2026-07-12T09:00:00.000Z")
  const order = createDeliveryOrderRow({
    retailOps: {
      ...BASE_DELIVERY_ORDER_METADATA.retailOps,
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
    assignment: createDeliveryAssignmentRow(),
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

        return createDeliveryAssignmentRow()
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
  const client = {
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
    client,
    happenedAt,
  }
}

function createContext(db: unknown, role: "MEMBER" | "OWNER" = "OWNER") {
  return {
    cfRay: null,
    db: db as TRPCContext["db"],
    forcePrimary: false,
    isInternalRequest: false,
    requestId: "req_test",
    session: {
      session: {
        createdAt: new Date("2026-07-12T07:00:00.000Z"),
        expiresAt: new Date("2026-07-13T07:00:00.000Z"),
        id: "session_123",
        ipAddress: null,
        token: "session-token",
        updatedAt: new Date("2026-07-12T07:00:00.000Z"),
        userId: "user_owner",
        userAgent: null,
      },
      user: {
        avatarUrl: null,
        createdAt: new Date("2026-07-12T07:00:00.000Z"),
        displayName: "Store Owner",
        email: "owner@business.test",
        emailVerified: true,
        firstName: "Store",
        id: "user_owner",
        image: null,
        isPlatformAdmin: false,
        lastName: "Owner",
        name: "Store Owner",
        updatedAt: new Date("2026-07-12T07:00:00.000Z"),
      },
    },
    tenantContext: {
      activeStore: {
        currencyCode: "NGN",
        id: "store_123",
        name: "Rice Store",
        slug: "rice-store",
        status: "ACTIVE",
      },
      membership: {
        id: "membership_123",
        role,
        tenantId: "tenant_123",
      },
      stores: [
        {
          currencyCode: "NGN",
          id: "store_123",
          name: "Rice Store",
          slug: "rice-store",
          status: "ACTIVE",
        },
      ],
      tenant: {
        currencyCode: "NGN",
        enabledModes: ["STORE"],
        id: "tenant_123",
        name: "Rice Store",
        slug: "rice-store",
        timezone: "Africa/Lagos",
        type: "MERCHANT",
      },
    },
    tenantId: "tenant_123",
    tenantSlug: null,
  } satisfies TRPCContext
}

function getCall(calls: FollowUpCall[], kind: string) {
  const call = calls.find((currentCall) => currentCall.kind === kind)
  expect(call, `Expected ${kind} to be called`).toBeTruthy()

  return call
}

describe("retail ops follow-up router", () => {
  test("completes an authenticated shared-link order request through the protected tenant scope", async () => {
    const db = createMockFollowUpDb()
    const caller = createCallerFactory(retailOpsRouter)(
      createContext(db.client),
    )
    const paidAt = new Date("2026-07-12T09:00:00.000Z")

    const result = await caller.updateSharedLinkOrderRequestStatus({
      cashierSessionId: "session_cashier_123",
      fulfilledAt: "2026-07-12T09:10:00.000Z",
      fulfillmentMethod: "pickup",
      fulfillmentNote: "Customer picked up at the shop",
      fulfillmentStatus: "picked_up",
      orderId: " order_123 ",
      paidAt,
      paymentMethod: "cash",
      status: "completed",
    })

    expect(result).toMatchObject({
      customer: {
        email: "customer@example.com",
        name: "Customer Name",
      },
      id: "order_123",
      orderNumber: "ORD-123",
      status: "COMPLETED",
    })
    expect(getCall(db.calls, "order.findFirst")).toMatchObject({
      where: {
        id: "order_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "receipt.create")).toMatchObject({
      data: {
        cashierSessionId: "session_cashier_123",
        issuedAt: paidAt,
        issuedByUserId: "user_owner",
        orderId: "order_123",
        paymentMethod: "cash",
        storeId: "store_123",
        tenantId: "tenant_123",
        totalMinor: 5000,
      },
    })
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        onHandQuantity: {
          decrement: 2,
        },
        reservedQuantity: {
          decrement: 2,
        },
        updatedByUserId: "user_owner",
      },
      where: {
        id: "inventory_123",
        onHandQuantity: {
          gte: 2,
        },
        reservedQuantity: {
          gte: 2,
        },
      },
    })
    expect(getCall(db.calls, "order.update")).toMatchObject({
      data: {
        paymentStatus: "PAID",
        status: "COMPLETED",
      },
    })
  })

  test("rejects shared-link order follow-up for roles without Retail Ops POS access", async () => {
    const db = createMockFollowUpDb()
    const caller = createCallerFactory(retailOpsRouter)(
      createContext(db.client, "MEMBER"),
    )

    await expect(
      caller.updateSharedLinkOrderRequestStatus({
        orderId: "order_123",
        status: "cancelled",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  test("creates an authenticated delivery request for a shared-link order", async () => {
    const db = createMockDeliveryCreateDb()
    const caller = createCallerFactory(retailOpsRouter)(
      createContext(db.client),
    )

    const result = await caller.createDeliveryRequest({
      dropoffAddress: " Customer street ",
      dropoffName: " Customer Name ",
      dropoffPhone: " 08000000000 ",
      notes: " Call before delivery ",
      orderId: " order_123 ",
      pickupAddress: " Store street ",
      pickupName: " Rice Store ",
      pickupPhone: " 08111111111 ",
      requestedAt: "2026-07-12T08:06:00.000Z",
    })

    expect(result).toMatchObject({
      customer: {
        email: "customer@example.com",
        name: "Customer Name",
      },
      id: "delivery_123",
      order: {
        id: "order_123",
        orderNumber: "ORD-123",
      },
      source: "durable",
      status: "open",
    })
    expect(getCall(db.calls, "order.findFirst")).toMatchObject({
      where: {
        id: "order_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "deliveryRequest.create")).toMatchObject({
      data: {
        dropoffAddress: "Customer street",
        dropoffName: "Customer Name",
        dropoffPhone: "08000000000",
        notes: "Call before delivery",
        orderId: "order_123",
        pickupAddress: "Store street",
        pickupName: "Rice Store",
        pickupPhone: "08111111111",
        requestedAt: new Date("2026-07-12T08:06:00.000Z"),
        status: "OPEN",
        tenantId: "tenant_123",
      },
    })
  })

  test("updates an authenticated delivery request status through the protected tenant scope", async () => {
    const db = createMockDeliveryUpdateDb()
    const caller = createCallerFactory(retailOpsRouter)(
      createContext(db.client),
    )

    const result = await caller.updateDeliveryRequestStatus({
      assignedDriverName: " Driver Name ",
      assignedDriverPhone: " 09000000000 ",
      deliveryRequestId: " delivery_123 ",
      happenedAt: db.happenedAt,
      note: " Delivered at front desk ",
      status: "delivered",
    })

    expect(result).toMatchObject({
      assignment: {
        assignedDriverName: "Driver Name",
        assignedDriverPhone: "09000000000",
        status: "completed",
      },
      id: "delivery_123",
      source: "durable",
      status: "delivered",
      trackingEventCount: 1,
    })
    expect(getCall(db.calls, "deliveryRequest.findFirst")).toMatchObject({
      where: {
        id: "delivery_123",
        order: {
          storeId: "store_123",
          tenantId: "tenant_123",
        },
        tenantId: "tenant_123",
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
  })
})
