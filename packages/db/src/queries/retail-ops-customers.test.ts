import { describe, expect, test } from "bun:test"
import {
  getRetailOpsCustomerBook,
  recordRetailOpsCustomerUpsert,
  recordRetailOpsSharedLinkCustomer,
} from "./retail-ops-customers"
import type { DbClient } from "./types"

type CustomerCall = {
  data?: unknown
  kind: string
  select?: unknown
  where?: unknown
}

function createSaleOrderRow() {
  return {
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    id: "order_sale_123",
    orderNumber: "ORD-123",
    retailOpsCustomerId: null,
    totalMinor: 12_500,
  }
}

function createSharedLinkOrderRow() {
  return {
    createdAt: new Date("2026-07-12T09:00:00.000Z"),
    id: "order_share_123",
    orderNumber: "ORD-456",
    retailOpsCustomerId: null,
    totalMinor: 7_500,
  }
}

function createMockCustomerBookDb() {
  const calls: CustomerCall[] = []

  const db = {
    order: {
      findMany: async ({
        select,
        where,
      }: { select: unknown; where: unknown }) => {
        calls.push({ kind: "order.findMany", select, where })

        return [
          {
            createdAt: new Date("2026-07-12T07:00:00.000Z"),
            customerEmail: "customer@example.com",
            customerName: "Customer Name",
            customerPhone: null,
            id: "order_old_customer",
            metadata: {
              retailOps: {
                actorUserId: "user_owner",
                source: "retail_ops_sale",
              },
            },
            orderNumber: "ORD-100",
            paymentStatus: "PAID",
            status: "COMPLETED",
            totalMinor: 3_000,
          },
          {
            createdAt: new Date("2026-07-12T08:30:00.000Z"),
            customerEmail: null,
            customerName: "Phone Customer",
            customerPhone: "0800 000 0000",
            id: "order_phone_customer",
            metadata: {
              retailOps: {
                shareLinkCreatorUserId: "user_owner",
                source: "retail_ops_share_link_order_request",
              },
            },
            orderNumber: "ORD-101",
            paymentStatus: "PENDING",
            status: "PENDING",
            totalMinor: 4_000,
          },
          {
            createdAt: new Date("2026-07-12T09:00:00.000Z"),
            customerEmail: "hidden@example.com",
            customerName: "Hidden Customer",
            customerPhone: null,
            id: "order_hidden_customer",
            metadata: {
              retailOps: {
                actorUserId: "other_user",
                source: "retail_ops_sale",
              },
            },
            orderNumber: "ORD-102",
            paymentStatus: "PAID",
            status: "COMPLETED",
            totalMinor: 9_000,
          },
        ]
      },
    },
    retailOpsCustomer: {
      findMany: async ({
        select,
        where,
      }: { select: unknown; where: unknown }) => {
        calls.push({ kind: "retailOpsCustomer.findMany", select, where })

        return [
          {
            email: "customer@example.com",
            firstSeenAt: new Date("2026-07-11T08:00:00.000Z"),
            id: "customer_durable_123",
            identities: [{ type: "EMAIL" }],
            identityKey: "email:customer@example.com",
            lastOrderId: "order_durable_latest",
            lastOrderNumber: "ORD-200",
            lastSeenAt: new Date("2026-07-12T10:00:00.000Z"),
            name: "Customer Name",
            orderCount: 2,
            orders: [
              {
                createdAt: new Date("2026-07-12T10:00:00.000Z"),
                id: "order_durable_latest",
                orderNumber: "ORD-200",
                paymentStatus: "PAID",
                status: "COMPLETED",
                totalMinor: 6_000,
              },
            ],
            phone: "08000000000",
            totalMinor: 9_000,
          },
        ]
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function createMockCustomerUpsertDb() {
  const calls: CustomerCall[] = []
  const sourceOrder = createSaleOrderRow()

  const db = {
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return sourceOrder
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return { id: sourceOrder.id }
      },
    },
    retailOpsCustomer: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "retailOpsCustomer.create" })

        return {
          email: data.email,
          id: "customer_123",
          lastSeenAt: data.lastSeenAt,
          name: data.name,
          phone: data.phone,
        }
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsCustomer.findUnique", where })

        return null
      },
    },
    retailOpsCustomerEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomerEvent.create" })

        return { id: "customer_event_123" }
      },
    },
    retailOpsCustomerIdentity: {
      createMany: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomerIdentity.createMany" })

        return { count: 3 }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function createMockSharedLinkCustomerDb() {
  const calls: CustomerCall[] = []
  const sourceOrder = createSharedLinkOrderRow()

  const db = {
    order: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return sourceOrder
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return { id: sourceOrder.id }
      },
    },
    retailOpsCustomer: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "retailOpsCustomer.create" })

        return {
          email: data.email,
          id: "customer_shared_123",
          lastSeenAt: data.lastSeenAt,
          name: data.name,
          phone: data.phone,
        }
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsCustomer.findUnique", where })

        return null
      },
    },
    retailOpsCustomerEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomerEvent.create" })

        return { id: "customer_event_shared_123" }
      },
    },
    retailOpsCustomerIdentity: {
      createMany: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomerIdentity.createMany" })

        return { count: 4 }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function getCall(calls: CustomerCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  expect(call).toBeDefined()

  return call
}

describe("retail ops customer queries", () => {
  test("merges durable customer rows with order-derived fallback customers", async () => {
    const db = createMockCustomerBookDb()

    const customers = await getRetailOpsCustomerBook(db.client, {
      actorUserId: "user_owner",
      limit: 10,
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(customers).toHaveLength(2)
    expect(customers[0]).toMatchObject({
      email: "customer@example.com",
      id: "customer_durable_123",
      identityType: "email",
      name: "Customer Name",
      orderCount: 2,
      phone: "08000000000",
      totalMinor: 9000,
    })
    expect(customers[0]).not.toHaveProperty("identityKey")
    expect(customers[1]).toMatchObject({
      email: null,
      identityType: "phone",
      lastOrder: {
        id: "order_phone_customer",
        orderNumber: "ORD-101",
      },
      name: "Phone Customer",
      orderCount: 1,
      phone: "0800 000 0000",
      totalMinor: 4000,
    })
    expect(getCall(db.calls, "retailOpsCustomer.findMany")).toMatchObject({
      where: {
        events: {
          some: {
            actorUserId: "user_owner",
          },
        },
        storeId: "store_123",
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

  test("records a checkout customer upsert from a synced sale source", async () => {
    const db = createMockCustomerUpsertDb()
    const lastSeenAt = new Date("2026-07-12T10:00:00.000Z")

    const result = await recordRetailOpsCustomerUpsert(db.client, {
      actorUserId: "user_cashier",
      email: "  CUSTOMER@EXAMPLE.COM ",
      externalId: " local_customer_123 ",
      lastSaleExternalId: " sale_external_123 ",
      lastSeenAt,
      name: "  Customer   Name ",
      phone: " 0800 000 0000 ",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      customer: {
        email: "customer@example.com",
        id: "customer_123",
        identityType: "email",
        lastSeenAt,
        name: "Customer Name",
        phone: "0800 000 0000",
      },
      externalId: "local_customer_123",
      source: {
        orderId: "order_sale_123",
        orderNumber: "ORD-123",
        saleExternalId: "sale_external_123",
      },
    })
    expect(getCall(db.calls, "order.findFirst")).toMatchObject({
      where: {
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "retailOpsCustomer.create")).toMatchObject({
      data: {
        email: "customer@example.com",
        identityKey: "email:customer@example.com",
        lastOrderId: "order_sale_123",
        lastOrderNumber: "ORD-123",
        lastSeenAt,
        name: "Customer Name",
        normalizedEmail: "customer@example.com",
        normalizedName: "customer name",
        normalizedPhone: "08000000000",
        orderCount: 1,
        phone: "0800 000 0000",
        totalMinor: 12_500,
      },
    })
    expect(
      getCall(db.calls, "retailOpsCustomerIdentity.createMany"),
    ).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          isPrimary: true,
          normalizedValue: "customer@example.com",
          type: "EMAIL",
          value: "customer@example.com",
        }),
        expect.objectContaining({
          normalizedValue: "08000000000",
          type: "PHONE",
          value: "0800 000 0000",
        }),
        expect.objectContaining({
          normalizedValue: "customer name",
          type: "NAME",
          value: "Customer Name",
        }),
      ]),
    })
    expect(getCall(db.calls, "order.update")).toMatchObject({
      data: {
        retailOpsCustomerId: "customer_123",
      },
      where: {
        id: "order_sale_123",
      },
    })
    expect(getCall(db.calls, "retailOpsCustomerEvent.create")).toMatchObject({
      data: {
        actorUserId: "user_cashier",
        customerId: "customer_123",
        metadata: {
          externalId: "local_customer_123",
          identityKey: "email:customer@example.com",
          saleExternalId: "sale_external_123",
          source: "customer_upsert",
        },
        orderId: "order_sale_123",
        type: "CREATED",
      },
    })
  })

  test("records shared-link customer identity with platform account context", async () => {
    const db = createMockSharedLinkCustomerDb()

    const result = await recordRetailOpsSharedLinkCustomer(db.client, {
      actorUserId: "user_owner",
      customerAccountId: "platform_customer_123",
      email: " buyer@example.com ",
      name: " Buyer Name ",
      orderId: "order_share_123",
      phone: " 0811 111 1111 ",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      email: "buyer@example.com",
      id: "customer_shared_123",
      identityType: "email",
      name: "Buyer Name",
      phone: "0811 111 1111",
    })
    expect(getCall(db.calls, "order.findFirst")).toMatchObject({
      where: {
        id: "order_share_123",
        metadata: {
          equals: "retail_ops_share_link_order_request",
          path: ["retailOps", "source"],
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "retailOpsCustomer.create")).toMatchObject({
      data: {
        customerAccountId: "platform_customer_123",
        email: "buyer@example.com",
        identityKey: "email:buyer@example.com",
        lastOrderId: "order_share_123",
        name: "Buyer Name",
        orderCount: 1,
        phone: "0811 111 1111",
        totalMinor: 7500,
      },
    })
    expect(
      getCall(db.calls, "retailOpsCustomerIdentity.createMany"),
    ).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          isPrimary: true,
          normalizedValue: "buyer@example.com",
          type: "EMAIL",
        }),
        expect.objectContaining({
          isPrimary: false,
          normalizedValue: "platform_customer_123",
          type: "PLATFORM_ACCOUNT",
        }),
      ]),
    })
    expect(getCall(db.calls, "retailOpsCustomerEvent.create")).toMatchObject({
      data: {
        actorUserId: "user_owner",
        customerId: "customer_shared_123",
        happenedAt: new Date("2026-07-12T09:00:00.000Z"),
        metadata: {
          customerAccountId: "platform_customer_123",
          identityKey: "email:buyer@example.com",
          orderId: "order_share_123",
          source: "shared_link_order_request",
        },
        orderId: "order_share_123",
        type: "ORDER_REQUESTED",
      },
    })
  })
})
