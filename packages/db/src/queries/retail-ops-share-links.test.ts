import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../generated/prisma/client"
import {
  createRetailOpsProductShareLink,
  createRetailOpsSharedProductOrderRequest,
  deactivateRetailOpsProductShareLink,
  getRetailOpsProductShareLinkAnalytics,
  getRetailOpsSharedProduct,
  listRetailOpsProductShareLinks,
  updateRetailOpsSharedLinkOrderRequestStatus,
} from "./retail-ops-share-links"

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

type FollowUpOrderRow = Omit<
  ReturnType<typeof createOrderRow>,
  "metadata" | "receipts"
> & {
  metadata: unknown
  receipts: FollowUpReceipt[]
}

const BASE_METADATA = {
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

type SharedLinkOrderMetadata = typeof BASE_METADATA

function createOrderRow(metadata: SharedLinkOrderMetadata = BASE_METADATA) {
  return {
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    currencyCode: "NGN",
    customerEmail: "customer@example.com",
    customerName: "Customer Name",
    customerPhone: null,
    id: "order_123",
    metadata,
    notes: "Call before pickup",
    orderNumber: "ORD-123",
    paymentStatus: "PENDING",
    receipts: [] as FollowUpReceipt[],
    status: "PENDING",
    totalMinor: 5000,
    updatedAt: new Date("2026-07-12T08:05:00.000Z"),
    items: [
      {
        id: "line_123",
        metadata: {
          retailOps: {
            unitName: "Bag",
          },
        },
        nameSnapshot: "Rice",
        productId: "product_123",
        productVariantId: "variant_123",
        quantity: 2,
        skuSnapshot: null,
        totalPriceMinor: 5000,
        unitPriceMinor: 2500,
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
      },
    ],
  }
}

function createMockFollowUpDb(input?: {
  orderStatus?: string
  inventoryUpdateCount?: number
}) {
  const order: FollowUpOrderRow = createOrderRow()
  order.status = input?.orderStatus ?? "PENDING"
  const calls: FollowUpCall[] = []
  const receipts: FollowUpReceipt[] = []
  const inventoryUpdateCount = input?.inventoryUpdateCount ?? 1

  const tx = {
    inventoryItem: {
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "inventoryItem.updateMany", where })
        return { count: inventoryUpdateCount }
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
      }: { data: unknown; where: unknown }) => {
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
      }: { data: unknown; where: unknown }) => {
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
      }: { data: unknown; where: unknown }) => {
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
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    order: {
      findFirst: async () => ({
        metadata: order.metadata,
        status: order.status,
        totalMinor: order.totalMinor,
      }),
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createShareableProduct(
  metadata: unknown = {},
  tenantHostnames: Array<{
    createdAt?: Date
    hostname: string
    isCustom: boolean
    isPrimary: boolean
    verifiedAt: Date | null
  }> = [],
) {
  return {
    id: "product_123",
    metadata,
    name: "Rice",
    slug: "rice",
    store: {
      slug: "rice-store",
      tenant: {
        hostnames: tenantHostnames.map((hostname, index) => ({
          createdAt: hostname.createdAt ?? new Date(2026, 6, 12, 8, index),
          ...hostname,
        })),
        slug: "rice-store",
      },
    },
  }
}

function createDurableShareLinkRow(input?: {
  createdByUserId?: string
  id?: string
  status?: string
  token?: string
  url?: string
}) {
  return {
    createExternalId: "share-external-123",
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    createdByUserId: input?.createdByUserId ?? "user_owner",
    deactivateExternalId: null,
    deactivatedAt: null,
    deactivatedByUserId: null,
    id: input?.id ?? "share_123",
    label: "Rice link",
    lastActivityAt: new Date("2026-07-12T08:00:00.000Z"),
    orderCount: 0,
    product: {
      id: "product_123",
      name: "Rice",
      slug: "rice",
    },
    status: input?.status ?? "ACTIVE",
    token: input?.token ?? "generated-token",
    url:
      input?.url ??
      "https://shop.example.com/p/rice-store/rice-store/rice?share=generated-token",
    viewCount: 0,
  }
}

function createMockShareLinkLifecycleDb(input?: {
  durableShareLink?: ReturnType<typeof createDurableShareLinkRow> | null
  productMetadata?: unknown
  tenantHostnames?: Parameters<typeof createShareableProduct>[1]
}) {
  const calls: FollowUpCall[] = []
  const product = createShareableProduct(
    input?.productMetadata,
    input?.tenantHostnames,
  )
  const durableShareLink =
    input?.durableShareLink === undefined
      ? createDurableShareLinkRow()
      : input.durableShareLink

  const tx = {
    product: {
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "product.update", where })

        return { id: product.id }
      },
    },
    productShareLink: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "productShareLink.create" })

        return createDurableShareLinkRow({
          token:
            typeof data === "object" &&
            data !== null &&
            "token" in data &&
            typeof data.token === "string"
              ? data.token
              : undefined,
          url:
            typeof data === "object" &&
            data !== null &&
            "url" in data &&
            typeof data.url === "string"
              ? data.url
              : undefined,
        })
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "productShareLink.update", where })

        return {
          ...createDurableShareLinkRow(),
          deactivateExternalId: "deactivate-external-123",
          deactivatedAt: new Date("2026-07-12T08:10:00.000Z"),
          deactivatedByUserId: "user_owner",
          lastActivityAt: new Date("2026-07-12T08:10:00.000Z"),
          status: "INACTIVE",
        }
      },
    },
    productShareLinkEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "productShareLinkEvent.create" })

        return { id: "share_event_123" }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    product: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findFirst", where })

        return product
      },
    },
    productShareLink: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        calls.push({ kind: "productShareLink.findFirst", where })

        if ("createExternalId" in where) return null
        if ("id" in where) return durableShareLink

        return null
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createMockShareLinkReportsDb() {
  const calls: FollowUpCall[] = []
  const product = {
    id: "product_123",
    metadata: {
      retailOps: {
        shareLinks: [
          {
            active: true,
            createdAt: "2026-07-12T08:00:00.000Z",
            createdByUserId: "user_owner",
            id: "share_123",
            label: "Duplicate metadata link",
            lastActivityAt: "2026-07-12T08:30:00.000Z",
            orderCount: 99,
            token: "generated-token",
            url: "https://shop.example.com/p/rice?share=generated-token",
            viewCount: 99,
          },
          {
            active: true,
            createdAt: "2026-07-12T07:00:00.000Z",
            createdByUserId: "user_owner",
            id: "share_local",
            label: "Local market link",
            lastActivityAt: "2026-07-12T07:30:00.000Z",
            orderCount: 1,
            token: "local-token",
            url: "https://shop.example.com/p/rice?share=local-token",
            viewCount: 2,
          },
        ],
      },
    },
    name: "Rice",
    slug: "rice",
  }
  const db = {
    product: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findMany", where })

        return [product]
      },
    },
    productShareLink: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productShareLink.findMany", where })

        return [
          createDurableShareLinkRow(),
          createDurableShareLinkRow({
            createdByUserId: "user_other",
            id: "share_other",
          }),
        ]
      },
    },
    productShareLinkAnalyticsDaily: {
      findMany: async ({
        select,
        where,
      }: {
        select: Record<string, unknown>
        where: unknown
      }) => {
        calls.push({ data: { select }, kind: "analytics.findMany", where })

        if (!("day" in select)) {
          return [
            {
              orderRequestCount: 2,
              shareLinkId: "share_123",
              viewCount: 7,
            },
            {
              orderRequestCount: 3,
              shareLinkId: "share_local",
              viewCount: 5,
            },
          ]
        }

        return [
          {
            cancelledOrderCount: 1,
            completedOrderCount: 2,
            consumedQuantity: 4,
            day: new Date("2026-07-12T00:00:00.000Z"),
            orderRequestCount: 3,
            product: {
              id: "product_123",
              name: "Rice",
              slug: "rice",
            },
            releasedQuantity: 1,
            reservedQuantity: 6,
            revenueMinor: 12_500,
            shareLinkId: "share_123",
            uniqueVisitorCount: 5,
            viewCount: 8,
          },
        ]
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function createDurableSharedProductRow() {
  return {
    createExternalId: null,
    createdAt: new Date("2026-07-12T08:00:00.000Z"),
    createdByUserId: "user_owner",
    deactivateExternalId: null,
    deactivatedAt: null,
    deactivatedByUserId: null,
    id: "share_123",
    label: "Rice link",
    lastActivityAt: null,
    orderCount: 0,
    product: {
      currencyCode: "NGN",
      description: "Premium rice",
      id: "product_123",
      name: "Rice",
      slug: "rice",
      store: {
        currencyCode: "NGN",
        id: "store_123",
        name: "Rice Store",
        slug: "rice-store",
        tenant: {
          id: "tenant_123",
          name: "Rice Store",
          slug: "rice-store",
        },
      },
      variants: [
        {
          id: "variant_123",
          inventoryItem: {
            onHandQuantity: 10,
            reservedQuantity: 1,
          },
          isDefault: true,
          name: "Bag",
          priceMinor: 2500,
          sku: "RICE-BAG",
        },
      ],
    },
    status: "ACTIVE",
    token: "share-token",
    url: "https://shop.example.com/p/rice-store/rice-store/rice?share=share-token",
    viewCount: 0,
  }
}

function createMockPublicOrderDb(input?: {
  inventoryItem?: {
    id: string
    onHandQuantity: number
    reservedQuantity: number
  } | null
  reservationUpdateCount?: number
  stockReservationCount?: number
}) {
  const calls: FollowUpCall[] = []
  const shareLink = createDurableSharedProductRow()
  const sourceOrder = {
    createdAt: new Date("2026-07-12T08:10:00.000Z"),
    id: "order_123",
    orderNumber: "REQ-123",
    retailOpsCustomerId: null,
    totalMinor: 5000,
  }
  const inventoryItem = input?.inventoryItem ?? {
    id: "inventory_123",
    onHandQuantity: 10,
    reservedQuantity: 1,
  }
  const tx = {
    inventoryItem: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findFirst", where })

        return inventoryItem
      },
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "inventoryItem.updateMany", where })

        return { count: input?.stockReservationCount ?? 1 }
      },
    },
    order: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "order.create" })

        return {
          currencyCode: "NGN",
          id: sourceOrder.id,
          orderNumber: sourceOrder.orderNumber,
          paymentStatus: "PENDING",
          status: "PENDING",
          totalMinor: sourceOrder.totalMinor,
        }
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findFirst", where })

        return sourceOrder
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "order.update", where })

        return { id: sourceOrder.id }
      },
    },
    product: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.findUnique", where })

        return {
          id: shareLink.product.id,
          metadata: {
            retailOps: {
              shareLinks: [
                {
                  active: true,
                  createdAt: shareLink.createdAt.toISOString(),
                  createdByUserId: shareLink.createdByUserId,
                  id: shareLink.id,
                  label: shareLink.label,
                  orderCount: shareLink.orderCount,
                  token: shareLink.token,
                  url: shareLink.url,
                  viewCount: shareLink.viewCount,
                },
              ],
            },
          },
          name: shareLink.product.name,
          slug: shareLink.product.slug,
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "product.update", where })

        return { id: shareLink.product.id }
      },
    },
    productShareLink: {
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "productShareLink.update", where })

        return { id: shareLink.id }
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
      }: { data: unknown; where: unknown }) => {
        calls.push({
          data,
          kind: "productShareLinkAnalyticsDaily.updateMany",
          where,
        })

        return { count: 0 }
      },
    },
    productShareLinkEvent: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "productShareLinkEvent.create" })

        return { id: "event_123" }
      },
    },
    productShareLinkOrderRequest: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "productShareLinkOrderRequest.upsert",
          where,
        })

        return { id: "order_request_123" }
      },
    },
    productShareLinkReservation: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "productShareLinkReservation.create" })

        return { id: "reservation_123" }
      },
      updateMany: async ({
        data,
        where,
      }: { data: unknown; where: unknown }) => {
        calls.push({
          data,
          kind: "productShareLinkReservation.updateMany",
          where,
        })

        return { count: input?.reservationUpdateCount ?? 0 }
      },
    },
    retailOpsCustomer: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomer.create" })

        return {
          email: "customer@example.com",
          id: "customer_book_123",
          lastSeenAt: sourceOrder.createdAt,
          name: "Customer Name",
          phone: "08000000000",
        }
      },
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "retailOpsCustomer.findUnique", where })

        return null
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "retailOpsCustomer.update", where })

        return {
          email: "customer@example.com",
          id: "customer_book_123",
          lastSeenAt: sourceOrder.createdAt,
          name: "Customer Name",
          phone: "08000000000",
        }
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

        return { count: 4 }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
    membership: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.findMany", where })

        return [
          {
            user: {
              displayName: "Owner",
              email: "owner@example.com",
              name: "Owner",
            },
          },
          {
            user: {
              displayName: "Sales Rep",
              email: "rep@example.com",
              name: "Sales Rep",
            },
          },
        ]
      },
    },
    productShareLink: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productShareLink.findFirst", where })

        return shareLink
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
  }
}

function getCall(calls: FollowUpCall[], kind: string) {
  const call = calls.find((currentCall) => currentCall.kind === kind)
  expect(call, `Expected ${kind} to be called`).toBeTruthy()

  return call
}

function getRetailOpsMetadata(
  result: Awaited<
    ReturnType<typeof updateRetailOpsSharedLinkOrderRequestStatus>
  >,
) {
  return {
    fulfillment: result.fulfillment,
    paymentState: result.paymentState,
    reservation: result.reservation,
    status: result.status,
  }
}

describe("shared-link order follow-up queries", () => {
  test("creates a production product share link with durable audit and product metadata mirror", async () => {
    const db = createMockShareLinkLifecycleDb()

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: " share-external-123 ",
      label: "Rice link",
      productId: "product_123",
      publicBaseUrl: "https://ewatrade.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      active: true,
      createdByUserId: "user_owner",
      id: "share_123",
      label: "Rice link",
      product: {
        id: "product_123",
        name: "Rice",
        slug: "rice",
      },
    })
    expect(typeof result.token).toBe("string")
    expect(result.url).toBe(
      `https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=${result.token}`,
    )
    expect(getCall(db.calls, "productShareLink.create")).toMatchObject({
      data: {
        createExternalId: "share-external-123",
        createdByUserId: "user_owner",
        label: "Rice link",
        productId: "product_123",
        status: "ACTIVE",
        storeId: "store_123",
        tenantId: "tenant_123",
        url: expect.stringContaining(
          "https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=",
        ),
      },
    })
    expect(getCall(db.calls, "productShareLinkEvent.create")).toMatchObject({
      data: {
        actorUserId: "user_owner",
        eventExternalId: "share-external-123",
        shareLinkId: "share_123",
        storeId: "store_123",
        tenantId: "tenant_123",
        type: "CREATED",
      },
    })
    expect(getCall(db.calls, "product.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            shareLinks: [
              expect.objectContaining({
                active: true,
                createdByUserId: "user_owner",
                externalId: "share-external-123",
                id: "share_123",
                label: "Rice link",
                token: result.token,
              }),
            ],
          },
        },
      },
      where: {
        id: "product_123",
      },
    })
  })

  test("falls back to the tenant storefront subdomain before hostname records are provisioned", async () => {
    const db = createMockShareLinkLifecycleDb()

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: "share-external-subdomain-fallback",
      label: "Subdomain fallback link",
      productId: "product_123",
      publicBaseUrl: "https://storefront.ewatrade.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.url).toBe(
      `https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=${result.token}`,
    )
    expect(getCall(db.calls, "productShareLink.create")).toMatchObject({
      data: {
        url: result.url,
      },
    })
  })

  test("uses the tenant storefront subdomain when a generated link has one", async () => {
    const db = createMockShareLinkLifecycleDb({
      tenantHostnames: [
        {
          hostname: "fallback.ewatrade.com",
          isCustom: false,
          isPrimary: false,
          verifiedAt: null,
        },
        {
          hostname: "rice-store.ewatrade.com",
          isCustom: false,
          isPrimary: true,
          verifiedAt: null,
        },
      ],
    })

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: "share-external-tenant-host",
      label: "Tenant storefront link",
      productId: "product_123",
      publicBaseUrl: "https://shop.example.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.url).toBe(
      `https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=${result.token}`,
    )
    expect(getCall(db.calls, "productShareLink.create")).toMatchObject({
      data: {
        url: result.url,
      },
    })
  })

  test("prefers a verified custom storefront hostname over the internal subdomain", async () => {
    const db = createMockShareLinkLifecycleDb({
      tenantHostnames: [
        {
          hostname: "rice-store.ewatrade.com",
          isCustom: false,
          isPrimary: true,
          verifiedAt: null,
        },
        {
          hostname: "shop.rice.example",
          isCustom: true,
          isPrimary: false,
          verifiedAt: new Date("2026-07-12T08:00:00.000Z"),
        },
      ],
    })

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: "share-external-custom-host",
      label: "Custom storefront link",
      productId: "product_123",
      publicBaseUrl: "https://shop.example.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.url).toBe(
      `https://shop.rice.example/p/rice-store/rice-store/rice?share=${result.token}`,
    )
  })

  test("skips unsafe custom hostnames and uses the next safe business hostname", async () => {
    const db = createMockShareLinkLifecycleDb({
      tenantHostnames: [
        {
          hostname: "javascript://share-link-preview",
          isCustom: true,
          isPrimary: true,
          verifiedAt: new Date("2026-07-12T08:00:00.000Z"),
        },
        {
          hostname: "http://localhost:3000",
          isCustom: true,
          isPrimary: false,
          verifiedAt: new Date("2026-07-12T08:00:00.000Z"),
        },
        {
          hostname: "rice-store.ewatrade.com",
          isCustom: false,
          isPrimary: true,
          verifiedAt: null,
        },
      ],
    })

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: "share-external-safe-host-fallback",
      label: "Safe host fallback link",
      productId: "product_123",
      publicBaseUrl: "https://shop.example.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.url).toBe(
      `https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=${result.token}`,
    )
  })

  test("falls back to generated tenant subdomain when stored hostnames are unsafe", async () => {
    const db = createMockShareLinkLifecycleDb({
      tenantHostnames: [
        {
          hostname: "127.0.0.1",
          isCustom: false,
          isPrimary: true,
          verifiedAt: null,
        },
      ],
    })

    const result = await createRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      externalId: "share-external-generated-subdomain-after-unsafe-host",
      label: "Generated subdomain fallback link",
      productId: "product_123",
      publicBaseUrl: "https://storefront.ewatrade.com/",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.url).toBe(
      `https://rice-store.ewatrade.com/p/rice-store/rice-store/rice?share=${result.token}`,
    )
  })

  test("returns product metadata image urls for shared product previews", async () => {
    const db = {
      product: {
        findFirst: async () => ({
          currencyCode: "NGN",
          description: "Premium long grain rice",
          id: "product_123",
          metadata: {
            retailOps: {
              imageUrl: "https://cdn.example.com/products/rice.png",
              shareLinks: [
                {
                  active: true,
                  createdAt: "2026-07-12T08:00:00.000Z",
                  createdByUserId: "user_owner",
                  id: "share_123",
                  label: "Rice link",
                  token: "share-token",
                  url: "https://shop.example.com/p/rice-store/rice-store/rice?share=share-token",
                },
              ],
            },
          },
          name: "Rice",
          slug: "rice",
          store: {
            currencyCode: "NGN",
            id: "store_123",
            name: "Rice Store",
            slug: "rice-store",
            tenant: {
              id: "tenant_123",
              name: "Rice Store",
              slug: "rice-store",
            },
          },
          variants: [
            {
              id: "variant_123",
              inventoryItem: {
                onHandQuantity: 10,
                reservedQuantity: 2,
              },
              isDefault: true,
              name: "Bag",
              priceMinor: 1850000,
              sku: "RICE-BAG",
            },
          ],
        }),
      },
      productShareLink: {
        findFirst: async () => null,
      },
    }

    const result = await getRetailOpsSharedProduct(
      db as unknown as PrismaClient,
      {
        productSlug: "rice",
        recordView: false,
        storeSlug: "rice-store",
        tenantSlug: "rice-store",
        token: "share-token",
      },
    )

    expect(result.product.imageUrl).toBe(
      "https://cdn.example.com/products/rice.png",
    )
    expect(result.product.variants[0]?.availableQuantity).toBe(8)
  })

  test("rejects inactive durable shared product links before showing the public page", async () => {
    const db = {
      productShareLink: {
        findFirst: async () => ({
          ...createDurableSharedProductRow(),
          status: "INACTIVE",
        }),
      },
    }

    await expect(
      getRetailOpsSharedProduct(db as unknown as PrismaClient, {
        productSlug: "rice",
        recordView: false,
        storeSlug: "rice-store",
        tenantSlug: "rice-store",
        token: "share-token",
      }),
    ).rejects.toMatchObject({
      code: "SHARE_LINK_NOT_FOUND",
    })
  })

  test("rejects inactive metadata fallback shared product links before order requests", async () => {
    const db = {
      product: {
        findFirst: async () => ({
          currencyCode: "NGN",
          description: "Premium long grain rice",
          id: "product_123",
          metadata: {
            retailOps: {
              shareLinks: [
                {
                  active: false,
                  createdAt: "2026-07-12T08:00:00.000Z",
                  createdByUserId: "user_owner",
                  id: "share_123",
                  label: "Rice link",
                  token: "share-token",
                  url: "https://shop.example.com/p/rice-store/rice-store/rice?share=share-token",
                },
              ],
            },
          },
          name: "Rice",
          slug: "rice",
          store: {
            currencyCode: "NGN",
            id: "store_123",
            name: "Rice Store",
            slug: "rice-store",
            tenant: {
              id: "tenant_123",
              name: "Rice Store",
              slug: "rice-store",
            },
          },
          variants: [
            {
              id: "variant_123",
              inventoryItem: {
                onHandQuantity: 10,
                reservedQuantity: 2,
              },
              isDefault: true,
              name: "Bag",
              priceMinor: 1850000,
              sku: "RICE-BAG",
            },
          ],
        }),
      },
      productShareLink: {
        findFirst: async () => null,
      },
    }

    await expect(
      createRetailOpsSharedProductOrderRequest(db as unknown as PrismaClient, {
        customerEmail: "customer@example.com",
        customerName: "Customer Name",
        productSlug: "rice",
        productVariantId: "variant_123",
        quantity: 1,
        storeSlug: "rice-store",
        tenantSlug: "rice-store",
        token: "share-token",
      }),
    ).rejects.toMatchObject({
      code: "SHARE_LINK_NOT_FOUND",
    })
  })

  test("lists generated product share links with durable rows, metadata fallback rows, and rollup counters", async () => {
    const db = createMockShareLinkReportsDb()

    const links = await listRetailOpsProductShareLinks(db.client, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({
      active: true,
      createdAt: "2026-07-12T08:00:00.000Z",
      createdByUserId: "user_owner",
      deactivatedAt: null,
      id: "share_123",
      label: "Rice link",
      lastActivityAt: "2026-07-12T08:00:00.000Z",
      orderCount: 2,
      product: {
        id: "product_123",
        name: "Rice",
        slug: "rice",
      },
      token: "generated-token",
      url: "https://shop.example.com/p/rice-store/rice-store/rice?share=generated-token",
      viewCount: 7,
    })
    expect(links[1]).toMatchObject({
      active: true,
      createdAt: "2026-07-12T07:00:00.000Z",
      createdByUserId: "user_owner",
      deactivatedAt: null,
      id: "share_local",
      label: "Local market link",
      lastActivityAt: "2026-07-12T07:30:00.000Z",
      orderCount: 3,
      product: {
        id: "product_123",
        name: "Rice",
        slug: "rice",
      },
      token: "local-token",
      url: "https://shop.example.com/p/rice?share=local-token",
      viewCount: 5,
    })
    expect(getCall(db.calls, "productShareLink.findMany")).toMatchObject({
      where: {
        product: {
          status: {
            not: "ARCHIVED",
          },
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "product.findMany")).toMatchObject({
      where: {
        status: {
          not: "ARCHIVED",
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "analytics.findMany")).toMatchObject({
      where: {
        shareLinkId: {
          in: ["share_123", "share_local"],
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
  })

  test("returns daily share-link analytics filtered by creator, product, and link", async () => {
    const db = createMockShareLinkReportsDb()

    const analytics = await getRetailOpsProductShareLinkAnalytics(db.client, {
      actorUserId: "user_owner",
      canManageAllLinks: false,
      from: new Date("2026-07-12T00:00:00.000Z"),
      productId: "product_123",
      shareLinkId: "share_123",
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
    })

    expect(analytics).toEqual({
      daily: [
        {
          cancelledOrderCount: 1,
          completedOrderCount: 2,
          consumedQuantity: 4,
          day: "2026-07-12T00:00:00.000Z",
          orderRequestCount: 3,
          product: {
            id: "product_123",
            name: "Rice",
            slug: "rice",
          },
          releasedQuantity: 1,
          reservedQuantity: 6,
          revenueMinor: 12_500,
          shareLinkId: "share_123",
          uniqueVisitorCount: 5,
          viewCount: 8,
        },
      ],
      linkSummaries: [
        {
          cancelledOrderCount: 1,
          completedOrderCount: 2,
          consumedQuantity: 4,
          orderRequestCount: 3,
          releasedQuantity: 1,
          reservedQuantity: 6,
          revenueMinor: 12_500,
          shareLink: expect.objectContaining({
            createdByUserId: "user_owner",
            id: "share_123",
            product: {
              id: "product_123",
              name: "Rice",
              slug: "rice",
            },
          }),
          uniqueVisitorCount: 5,
          viewCount: 8,
        },
      ],
      range: {
        from: "2026-07-12T00:00:00.000Z",
        to: "2026-07-12T23:59:59.999Z",
      },
      source: "daily_rollup",
      summary: {
        activeLinkCount: 1,
        cancelledOrderCount: 1,
        completedOrderCount: 2,
        consumedQuantity: 4,
        linkCount: 1,
        orderRequestCount: 3,
        releasedQuantity: 1,
        reservedQuantity: 6,
        revenueMinor: 12_500,
        uniqueVisitorCount: 5,
        viewCount: 8,
      },
    })
    const dailyAnalyticsCall = db.calls
      .filter((call) => call.kind === "analytics.findMany")
      .find((call) => {
        const where = call.where as { day?: unknown }

        return Boolean(where.day)
      })

    expect(dailyAnalyticsCall).toMatchObject({
      where: {
        day: {
          gte: new Date("2026-07-12T00:00:00.000Z"),
          lte: new Date("2026-07-12T00:00:00.000Z"),
        },
        shareLinkId: {
          in: ["share_123"],
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
  })

  test("deactivates an owned production share link and mirrors inactive metadata", async () => {
    const db = createMockShareLinkLifecycleDb({
      durableShareLink: createDurableShareLinkRow(),
      productMetadata: {
        retailOps: {
          shareLinks: [
            {
              active: true,
              createdAt: "2026-07-12T08:00:00.000Z",
              createdByUserId: "user_owner",
              externalId: "share-external-123",
              id: "share_123",
              label: "Rice link",
              token: "generated-token",
              url: "https://shop.example.com/p/rice-store/rice-store/rice?share=generated-token",
            },
          ],
        },
      },
    })

    const result = await deactivateRetailOpsProductShareLink(db.client, {
      actorUserId: "user_owner",
      canManageAllLinks: false,
      externalId: " deactivate-external-123 ",
      productId: "product_123",
      shareLinkId: "share_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      active: false,
      createdByUserId: "user_owner",
      id: "share_123",
      token: "generated-token",
    })
    expect(getCall(db.calls, "productShareLink.update")).toMatchObject({
      data: {
        deactivateExternalId: "deactivate-external-123",
        deactivatedByUserId: "user_owner",
        status: "INACTIVE",
      },
      where: {
        id: "share_123",
      },
    })
    expect(getCall(db.calls, "productShareLinkEvent.create")).toMatchObject({
      data: {
        actorUserId: "user_owner",
        eventExternalId: "deactivate-external-123",
        shareLinkId: "share_123",
        type: "DEACTIVATED",
      },
    })
    expect(getCall(db.calls, "product.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            shareLinks: [
              expect.objectContaining({
                active: false,
                deactivationExternalId: "deactivate-external-123",
                deactivatedByUserId: "user_owner",
                id: "share_123",
              }),
            ],
          },
        },
      },
    })
  })

  test("creates a pending public order request with reservation, customer book, and analytics records", async () => {
    const db = createMockPublicOrderDb()

    const result = await createRetailOpsSharedProductOrderRequest(db.client, {
      customerAccount: {
        id: "platform_customer_123",
        mode: "register",
      },
      customerEmail: "customer@example.com",
      customerName: "Customer Name",
      customerPhone: "08000000000",
      notes: "Call before pickup",
      productSlug: "rice",
      productVariantId: "variant_123",
      quantity: 2,
      storeSlug: "rice-store",
      tenantSlug: "rice-store",
      token: "share-token",
    })

    expect(result).toMatchObject({
      line: {
        productId: "product_123",
        productName: "Rice",
        quantity: 2,
        totalMinor: 5000,
        unitName: "Bag",
        unitPriceMinor: 2500,
      },
      notification: {
        businessName: "Rice Store",
        customerEmail: "customer@example.com",
        customerName: "Customer Name",
        customerPhone: "08000000000",
        merchantRecipients: [
          {
            email: "owner@example.com",
          },
          {
            email: "rep@example.com",
          },
        ],
        orderId: "order_123",
        orderNumber: "REQ-123",
        productName: "Rice",
        quantity: 2,
        totalFormatted: "NGN 50.00",
        unitName: "Bag",
      },
      order: {
        id: "order_123",
        paymentStatus: "PENDING",
        status: "PENDING",
        totalMinor: 5000,
      },
      shareLink: {
        id: "share_123",
        orderCount: 1,
      },
    })
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        reservedQuantity: { increment: 2 },
        updatedByUserId: "user_owner",
      },
      where: {
        id: "inventory_123",
        onHandQuantity: { gte: 3 },
        reservedQuantity: 1,
      },
    })
    expect(getCall(db.calls, "order.create")).toMatchObject({
      data: {
        customerEmail: "customer@example.com",
        customerName: "Customer Name",
        metadata: {
          retailOps: {
            customerAccountId: "platform_customer_123",
            customerAuthMode: "register",
            paymentState: "pending_follow_up",
            shareLinkCreatorUserId: "user_owner",
            shareLinkId: "share_123",
            source: "retail_ops_share_link_order_request",
            stockReservation: {
              inventoryItemId: "inventory_123",
              productVariantId: "variant_123",
              quantity: 2,
              status: "reserved",
            },
          },
        },
        paymentStatus: "PENDING",
        status: "PENDING",
        totalMinor: 5000,
      },
    })
    expect(getCall(db.calls, "retailOpsCustomer.create")).toMatchObject({
      data: {
        customerAccountId: "platform_customer_123",
        email: "customer@example.com",
        identityKey: "email:customer@example.com",
        lastOrderId: "order_123",
        name: "Customer Name",
        orderCount: 1,
        phone: "08000000000",
        totalMinor: 5000,
      },
    })
    expect(
      getCall(db.calls, "retailOpsCustomerIdentity.createMany"),
    ).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          customerId: "customer_book_123",
          isPrimary: true,
          normalizedValue: "customer@example.com",
          type: "EMAIL",
        }),
        expect.objectContaining({
          customerId: "customer_book_123",
          normalizedValue: "platform_customer_123",
          type: "PLATFORM_ACCOUNT",
        }),
      ]),
    })
    expect(
      getCall(db.calls, "productShareLinkOrderRequest.upsert"),
    ).toMatchObject({
      data: {
        create: {
          customerAccountId: "platform_customer_123",
          customerAuthMode: "register",
          orderId: "order_123",
          productId: "product_123",
          quantity: 2,
          shareLinkId: "share_123",
          status: "PENDING",
          totalMinor: 5000,
        },
        update: {
          customerAccountId: "platform_customer_123",
          customerAuthMode: "register",
          productId: "product_123",
          quantity: 2,
          status: "PENDING",
          totalMinor: 5000,
        },
      },
      where: {
        orderId: "order_123",
      },
    })
    expect(
      getCall(db.calls, "productShareLinkReservation.create"),
    ).toMatchObject({
      data: {
        externalId: "order_123",
        orderId: "order_123",
        orderRequestId: "order_request_123",
        productVariantId: "variant_123",
        quantity: 2,
        reservedByUserId: "user_owner",
        shareLinkId: "share_123",
        status: "RESERVED",
      },
    })
    expect(
      getCall(db.calls, "productShareLinkAnalyticsDaily.create"),
    ).toMatchObject({
      data: {
        orderRequestCount: 1,
        productId: "product_123",
        reservedQuantity: 2,
        shareLinkId: "share_123",
      },
    })
    expect(getCall(db.calls, "product.update")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            shareLinks: [
              expect.objectContaining({
                id: "share_123",
                orderCount: 1,
              }),
            ],
          },
        },
      },
      where: {
        id: "product_123",
      },
    })
  })

  test("rejects public order requests when reservable inventory is no longer available", async () => {
    const db = createMockPublicOrderDb({
      inventoryItem: {
        id: "inventory_123",
        onHandQuantity: 2,
        reservedQuantity: 2,
      },
    })

    await expect(
      createRetailOpsSharedProductOrderRequest(db.client, {
        customerEmail: "customer@example.com",
        customerName: "Customer Name",
        productSlug: "rice",
        productVariantId: "variant_123",
        quantity: 2,
        storeSlug: "rice-store",
        tenantSlug: "rice-store",
        token: "share-token",
      }),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    })
    expect(
      db.calls.some((call) => call.kind === "order.create"),
      "Order should not be created when stock cannot be reserved",
    ).toBe(false)
    expect(
      db.calls.some(
        (call) => call.kind === "productShareLinkOrderRequest.upsert",
      ),
      "Durable order request should not be recorded when stock cannot be reserved",
    ).toBe(false)
  })

  test("completes a pending request by consuming reservation, recording payment, and rolling up analytics", async () => {
    const db = createMockFollowUpDb()

    const result = await updateRetailOpsSharedLinkOrderRequestStatus(
      db.client,
      {
        actorUserId: "user_owner",
        canManageAllRequests: false,
        fulfillmentMethod: "pickup",
        fulfillmentStatus: "picked_up",
        orderId: "order_123",
        paidAt: new Date("2026-07-12T08:09:00.000Z"),
        paymentMethod: "cash",
        status: "completed",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )

    expect(getRetailOpsMetadata(result)).toMatchObject({
      fulfillment: {
        fulfilledByUserId: "user_owner",
        method: "pickup",
        status: "picked_up",
      },
      paymentState: "paid_at_follow_up",
      reservation: {
        inventoryItemId: "inventory_123",
        quantity: 2,
        status: "consumed",
      },
      status: "COMPLETED",
    })
    expect(result.paymentStatus).toBe("PAID")
    expect(result.receipt).toMatchObject({
      id: "receipt_123",
      paymentMethod: "cash",
      totalMinor: 5000,
    })
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        onHandQuantity: { decrement: 2 },
        reservedQuantity: { decrement: 2 },
        updatedByUserId: "user_owner",
      },
      where: {
        id: "inventory_123",
        onHandQuantity: { gte: 2 },
        reservedQuantity: { gte: 2 },
      },
    })
    expect(
      getCall(db.calls, "productShareLinkReservation.updateMany"),
    ).toMatchObject({
      data: {
        status: "CONSUMED",
      },
      where: {
        orderId: "order_123",
        status: "RESERVED",
      },
    })
    expect(
      getCall(db.calls, "productShareLinkAnalyticsDaily.create"),
    ).toMatchObject({
      data: {
        completedOrderCount: 1,
        consumedQuantity: 2,
        revenueMinor: 5000,
      },
    })
  })

  test("cancels a pending request by releasing reservation and rolling up cancellation analytics", async () => {
    const db = createMockFollowUpDb()

    const result = await updateRetailOpsSharedLinkOrderRequestStatus(
      db.client,
      {
        actorUserId: "user_owner",
        canManageAllRequests: false,
        fulfillmentNote: "Customer cancelled",
        orderId: "order_123",
        status: "cancelled",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )

    expect(getRetailOpsMetadata(result)).toMatchObject({
      fulfillment: {
        fulfilledByUserId: "user_owner",
        note: "Customer cancelled",
        status: "cancelled",
      },
      paymentState: "follow_up_cancelled",
      reservation: {
        inventoryItemId: "inventory_123",
        quantity: 2,
        status: "released",
      },
      status: "CANCELLED",
    })
    expect(result.paymentStatus).toBe("PENDING")
    expect(result.receipt).toBeNull()
    expect(getCall(db.calls, "inventoryItem.updateMany")).toMatchObject({
      data: {
        reservedQuantity: { decrement: 2 },
        updatedByUserId: "user_owner",
      },
      where: {
        id: "inventory_123",
        reservedQuantity: { gte: 2 },
      },
    })
    expect(
      getCall(db.calls, "productShareLinkReservation.updateMany"),
    ).toMatchObject({
      data: {
        status: "RELEASED",
      },
      where: {
        orderId: "order_123",
        status: "RESERVED",
      },
    })
    expect(
      getCall(db.calls, "productShareLinkAnalyticsDaily.create"),
    ).toMatchObject({
      data: {
        cancelledOrderCount: 1,
        releasedQuantity: 2,
      },
    })
  })
})
