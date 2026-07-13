import { describe, expect, test } from "bun:test"
import {
  type BusinessTemplateError,
  convertDryCleaningServiceRequestToOrder,
  createDryCleaningPublicServiceRequest,
  createDryCleaningServiceItem,
  createDryCleaningServiceOrder,
  createDryCleaningServiceRequestLink,
  getDryCleaningOperationalReport,
  getStoreBusinessTemplate,
  listBusinessTemplates,
  listUnsupportedBusinessDemand,
  resolveDryCleaningTrackingToken,
  updateDryCleaningServiceOrderStatus,
  updateStoreBusinessTemplate,
} from "./business-templates"
import type { DbClient } from "./types"

type StoreCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createDryCleaningMetadata() {
  return {
    retailOps: {
      businessTemplate: {
        key: "dry_cleaning_laundry",
        label: "Dry Cleaning / Laundry",
        selectedAt: "2026-07-13T08:00:00.000Z",
        source: "test",
      },
      dryCleaning: {
        notificationIntents: [],
        serviceItems: [],
        serviceOrders: [],
        serviceRequestLinks: [],
        serviceRequests: [],
      },
      onboarding: {
        businessTemplateKey: "dry_cleaning_laundry",
      },
    },
  }
}

function createMockBusinessTemplateDb(input?: {
  metadata?: unknown
  orderCount?: number
  productCount?: number
}) {
  const calls: StoreCall[] = []
  const store = {
    currencyCode: "NGN",
    id: "store_123",
    metadata: input?.metadata ?? createDryCleaningMetadata(),
    name: "Sparkle Laundry",
    slug: "sparkle-laundry",
    supportEmail: "support@sparkle.test",
    supportPhone: "08000000000",
    tenantId: "tenant_123",
  }

  const db = {
    onboardingSession: {
      findMany: async () => {
        calls.push({ kind: "onboardingSession.findMany" })

        return [
          {
            createdAt: new Date("2026-07-13T10:00:00.000Z"),
            formData: {
              onboarding: {
                businessTemplateKey: "other_generic",
                otherBusinessDescription: "Equipment rentals",
              },
            },
            id: "session_1",
          },
          {
            createdAt: new Date("2026-07-12T10:00:00.000Z"),
            formData: {
              onboarding: {
                businessTemplateKey: "other_generic",
                otherBusinessDescription: "Equipment rentals",
              },
            },
            id: "session_2",
          },
        ]
      },
    },
    order: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.count", where })

        return input?.orderCount ?? 0
      },
    },
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

        return input?.productCount ?? 0
      },
    },
    store: {
      findFirst: async ({
        where,
      }: { where: { id: string; tenantId: string } }) => {
        calls.push({ kind: "store.findFirst", where })

        return where.id === store.id && where.tenantId === store.tenantId
          ? store
          : null
      },
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findMany", where })

        return [store]
      },
      update: async ({
        data,
        where,
      }: {
        data: { metadata?: unknown }
        where: { id: string }
      }) => {
        calls.push({ data, kind: "store.update", where })
        if (data.metadata) store.metadata = data.metadata

        return store
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
    store,
  }
}

describe("business template queries", () => {
  test("lists supported templates and defaults stores without metadata to Product Sales", async () => {
    const templates = listBusinessTemplates()

    expect(templates.map((template) => template.key)).toEqual([
      "product_sales",
      "dry_cleaning_laundry",
      "other_generic",
    ])

    const db = createMockBusinessTemplateDb({ metadata: {} })
    const template = await getStoreBusinessTemplate(db.client, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(template).toMatchObject({
      key: "product_sales",
      primaryWorkflow: "inventory_sales",
      storeId: "store_123",
    })
  })

  test("creates dry-cleaning services and service orders without product inventory records", async () => {
    const db = createMockBusinessTemplateDb()

    const service = await createDryCleaningServiceItem(db.client, {
      category: "Garments",
      estimatedTurnaroundHours: 48,
      name: "Shirt wash and press",
      priceMinor: 150_00,
      storeId: "store_123",
      tenantId: "tenant_123",
      variants: [{ name: "Express", priceMinor: 250_00 }],
    })
    const order = await createDryCleaningServiceOrder(db.client, {
      actorUserId: "user_123",
      customer: {
        email: null,
        name: "Ada Customer",
        phone: "08011111111",
      },
      lines: [
        {
          quantity: 2,
          serviceItemId: service.id,
          variantId: service.variants[0]?.id,
        },
      ],
      paymentStatus: "pay_on_collection",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(order).toMatchObject({
      customer: { name: "Ada Customer" },
      lines: [
        expect.objectContaining({
          quantity: 2,
          serviceItemName: "Shirt wash and press",
          totalPriceMinor: 500_00,
          unitPriceMinor: 250_00,
          variantName: "Express",
        }),
      ],
      paymentStatus: "pay_on_collection",
      status: "received",
      totalMinor: 500_00,
    })
    expect(db.calls.some((call) => call.kind === "product.create")).toBe(false)
    expect(
      db.calls.some((call) => call.kind === "inventoryMovement.create"),
    ).toBe(false)
  })

  test("records status evidence and creates manual ready notification intents", async () => {
    const db = createMockBusinessTemplateDb()
    const service = await createDryCleaningServiceItem(db.client, {
      name: "Suit cleaning",
      priceMinor: 500_00,
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    const order = await createDryCleaningServiceOrder(db.client, {
      customer: {
        email: null,
        name: "Nora",
        phone: "08022222222",
      },
      lines: [{ quantity: 1, serviceItemId: service.id }],
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    await updateDryCleaningServiceOrderStatus(db.client, {
      actorUserId: "user_123",
      orderId: order.id,
      status: "in_progress",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    const result = await updateDryCleaningServiceOrderStatus(db.client, {
      actorUserId: "user_123",
      evidence: [{ label: "Finished garment", url: "https://img.test/1.jpg" }],
      note: "Packed and ready",
      notifyCustomer: true,
      orderId: order.id,
      status: "ready",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result.order).toMatchObject({
      evidence: [expect.objectContaining({ label: "Finished garment" })],
      notes: [expect.objectContaining({ text: "Packed and ready" })],
      status: "ready",
    })
    expect(result.notificationIntent).toMatchObject({
      customerPhone: "08022222222",
      type: "ready",
    })
    expect(result.notificationIntent?.manualCopy).toContain("NGN 500.00")
    expect(result.notificationIntent?.manualCopy).toContain("ready")
  })

  test("supports public request links, conversion, tracking, reports, and demand ranking", async () => {
    const db = createMockBusinessTemplateDb()
    const service = await createDryCleaningServiceItem(db.client, {
      name: "Dress cleaning",
      priceMinor: 300_00,
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    const link = await createDryCleaningServiceRequestLink(db.client, {
      createdByUserId: "user_123",
      label: "Public laundry intake",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    const request = await createDryCleaningPublicServiceRequest(db.client, {
      customer: {
        email: "customer@test.dev",
        name: "Public Customer",
        phone: "08033333333",
      },
      lines: [{ quantity: 3, serviceItemId: service.id }],
      token: link.token,
    })
    const conversion = await convertDryCleaningServiceRequestToOrder(
      db.client,
      {
        actorUserId: "user_123",
        paymentStatus: "unpaid",
        requestId: request.id,
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )
    await updateDryCleaningServiceOrderStatus(db.client, {
      orderId: conversion.order.id,
      status: "in_progress",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    await updateDryCleaningServiceOrderStatus(db.client, {
      orderId: conversion.order.id,
      status: "ready",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    await updateDryCleaningServiceOrderStatus(db.client, {
      orderId: conversion.order.id,
      status: "completed",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    const tracking = await resolveDryCleaningTrackingToken(db.client, {
      token: conversion.order.trackingToken,
    })
    const report = await getDryCleaningOperationalReport(db.client, {
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    const demand = await listUnsupportedBusinessDemand(db.client, { limit: 5 })

    expect(request).toMatchObject({
      status: "pending",
      totalMinor: 900_00,
    })
    expect(conversion.request).toMatchObject({
      convertedOrderId: conversion.order.id,
      status: "converted",
    })
    expect(tracking).toMatchObject({
      kind: "service_order",
      order: { status: "completed" },
      store: { name: "Sparkle Laundry" },
    })
    expect(report).toMatchObject({
      completedOrderCount: 1,
      orderCount: 1,
      requestConversionRate: 100,
      revenueMinor: 900_00,
    })
    expect(report.popularServices[0]).toMatchObject({
      quantity: 3,
      serviceItemName: "Dress cleaning",
    })
    expect(demand[0]).toMatchObject({
      count: 2,
      label: "Equipment rentals",
    })
  })

  test("blocks template changes after operational records exist", async () => {
    const db = createMockBusinessTemplateDb({ productCount: 1 })

    await expect(
      updateStoreBusinessTemplate(db.client, {
        actorUserId: "owner_123",
        nextTemplateKey: "product_sales",
        reason: "Switching after setup",
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({
      code: "TEMPLATE_CHANGE_BLOCKED",
    } satisfies Partial<BusinessTemplateError>)
  })
})
