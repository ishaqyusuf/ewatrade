import { describe, expect, test } from "bun:test"
import {
  retailOpsCloseSessionSchema,
  retailOpsCreateDeliveryRequestSchema,
  retailOpsCreateProductSchema,
  retailOpsCreateProductShareLinkSchema,
  retailOpsCreateSaleSchema,
  retailOpsCreateSharedProductOrderRequestSchema,
  retailOpsCustomerUpsertSchema,
  retailOpsDeliveryRequestsSchema,
  retailOpsInviteStaffSchema,
  retailOpsOpenSessionSchema,
  retailOpsProductShareLinkAnalyticsSchema,
  retailOpsProductUnitEffectivePriceSchema,
  retailOpsProductUnitPriceHistorySchema,
  retailOpsRecordStockAdjustmentSchema,
  retailOpsRecordStockIntakeSchema,
  retailOpsRecordUnitConversionSchema,
  retailOpsSharedLinkOrderRequestsSchema,
  retailOpsSharedProductLookupSchema,
  retailOpsUpdateDeliveryRequestStatusSchema,
  retailOpsUpdateProductUnitPriceSchema,
  retailOpsUpdateSharedLinkOrderRequestStatusSchema,
} from "./retail-ops"

const storeScope = {
  storeId: "store-1",
}

function expectQuantityRejected(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) {
  expect(schema.safeParse(value).success).toBe(false)
}

describe("retail ops quantity schemas", () => {
  test("accepts whole-number strings for mobile quantity payloads", () => {
    expect(
      retailOpsCreateSaleSchema.safeParse({
        ...storeScope,
        productVariantId: "unit-1",
        quantity: "3",
      }).success,
    ).toBe(true)

    expect(
      retailOpsRecordUnitConversionSchema.safeParse({
        ...storeScope,
        sourceProductVariantId: "unit-1",
        sourceQuantity: "2",
        targetProductVariantId: "unit-2",
        targetQuantity: "4",
      }).success,
    ).toBe(true)

    expect(
      retailOpsOpenSessionSchema.safeParse({
        ...storeScope,
        inventoryLines: [
          {
            countedQuantity: "7",
            productVariantId: "unit-1",
          },
        ],
      }).success,
    ).toBe(true)
  })

  test("rejects decimal quantities for production inventory mutations", () => {
    expectQuantityRejected(retailOpsCreateSaleSchema, {
      ...storeScope,
      productVariantId: "unit-1",
      quantity: 1.5,
    })
    expectQuantityRejected(retailOpsRecordStockIntakeSchema, {
      ...storeScope,
      productVariantId: "unit-1",
      quantity: 2.25,
    })
    expectQuantityRejected(retailOpsRecordStockAdjustmentSchema, {
      ...storeScope,
      direction: "decrease",
      productVariantId: "unit-1",
      quantity: 3.75,
    })
    expectQuantityRejected(retailOpsRecordUnitConversionSchema, {
      ...storeScope,
      sourceProductVariantId: "unit-1",
      sourceQuantity: 1.2,
      targetProductVariantId: "unit-2",
      targetQuantity: 2,
    })
    expectQuantityRejected(retailOpsRecordUnitConversionSchema, {
      ...storeScope,
      sourceProductVariantId: "unit-1",
      sourceQuantity: 1,
      targetProductVariantId: "unit-2",
      targetQuantity: 2.8,
    })
  })

  test("rejects decimal opening and counted inventory quantities", () => {
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      name: "Rice",
      openingStockQuantity: 5.5,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
      variants: [
        {
          name: "Half bag",
          openingStockQuantity: 2,
          priceMinor: 9_500,
        },
      ],
    })
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      name: "Rice",
      openingStockQuantity: 5,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
      variants: [
        {
          name: "Half bag",
          openingStockQuantity: 2.5,
          priceMinor: 9_500,
        },
      ],
    })
    expectQuantityRejected(retailOpsOpenSessionSchema, {
      ...storeScope,
      inventoryLines: [
        {
          countedQuantity: 4.5,
          productVariantId: "unit-1",
        },
      ],
    })
    expectQuantityRejected(retailOpsCloseSessionSchema, {
      ...storeScope,
      cashierSessionId: "session-1",
      closingFloatMinor: 0,
      inventoryLines: [
        {
          countedQuantity: 6.25,
          productVariantId: "unit-1",
        },
      ],
    })
  })
})

describe("retail ops product setup schemas", () => {
  test("accepts optional product description and public image urls", () => {
    const parsed = retailOpsCreateProductSchema.parse({
      ...storeScope,
      description: " Premium long-grain rice for customer previews. ",
      imageUrl: " https://cdn.example.com/products/rice.png ",
      imageLinks: [
        " https://cdn.example.com/products/rice-side.png ",
        "https://cdn.example.com/products/rice-stack.png",
      ],
      name: "Rice",
      openingStockQuantity: "10",
      priceMinor: "18500",
      primaryUnitName: "Bag",
      variants: [
        {
          enabled: true,
          imageLinks: [" https://cdn.example.com/products/rice-half.png "],
          imageUrl: " https://cdn.example.com/products/rice-half-main.png ",
          name: "Half bag",
          openingStockQuantity: "4",
          priceMinor: "9500",
          variantLabel: " Size ",
        },
      ],
    })

    expect(parsed).toMatchObject({
      description: "Premium long-grain rice for customer previews.",
      imageUrl: "https://cdn.example.com/products/rice.png",
      imageLinks: [
        "https://cdn.example.com/products/rice-side.png",
        "https://cdn.example.com/products/rice-stack.png",
      ],
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
      variants: [
        {
          enabled: true,
          imageLinks: ["https://cdn.example.com/products/rice-half.png"],
          imageUrl: "https://cdn.example.com/products/rice-half-main.png",
          name: "Half bag",
          openingStockQuantity: 4,
          priceMinor: 9_500,
          variantLabel: "Size",
        },
      ],
    })
  })

  test("rejects malformed product image urls", () => {
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      imageUrl: "not a url",
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
    })
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      imageUrl: "ftp://cdn.example.com/products/rice.png",
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
    })
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      imageLinks: ["https://cdn.example.com/products/rice.png", "notaurl"],
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
    })
    expectQuantityRejected(retailOpsCreateProductSchema, {
      ...storeScope,
      name: "Rice",
      openingStockQuantity: 10,
      priceMinor: 18_500,
      primaryUnitName: "Bag",
      variants: [
        {
          imageUrl: "file:///local-only.png",
          name: "Half bag",
          priceMinor: 9_500,
        },
      ],
    })
  })
})

describe("retail ops product price schemas", () => {
  test("normalizes product unit price reads and updates", () => {
    const effectivePrice = retailOpsProductUnitEffectivePriceSchema.parse({
      ...storeScope,
      effectiveAt: "2026-07-12T08:30:00.000Z",
      productVariantId: " unit-1 ",
    })

    expect(effectivePrice).toMatchObject({
      productVariantId: "unit-1",
      storeId: "store-1",
    })
    expect(effectivePrice.effectiveAt).toEqual(
      new Date("2026-07-12T08:30:00.000Z"),
    )

    const priceHistory = retailOpsProductUnitPriceHistorySchema.parse({
      ...storeScope,
      from: "2026-07-01",
      productVariantId: " unit-1 ",
      to: "2026-07-31",
    })

    expect(priceHistory).toMatchObject({
      limit: 50,
      productVariantId: "unit-1",
      storeId: "store-1",
    })
    expect(priceHistory.from).toEqual(new Date("2026-07-01T00:00:00.000Z"))
    expect(priceHistory.to).toEqual(new Date("2026-07-31T00:00:00.000Z"))

    const update = retailOpsUpdateProductUnitPriceSchema.parse({
      ...storeScope,
      priceMinor: "19000",
      productVariantId: " unit-1 ",
      reason: " Market price update ",
    })

    expect(update).toMatchObject({
      priceMinor: 19_000,
      productVariantId: "unit-1",
      reason: "Market price update",
      storeId: "store-1",
    })
  })

  test("rejects unsafe product unit price inputs", () => {
    expectQuantityRejected(retailOpsProductUnitEffectivePriceSchema, {
      ...storeScope,
      productVariantId: "",
    })
    expectQuantityRejected(retailOpsProductUnitPriceHistorySchema, {
      ...storeScope,
      limit: 101,
    })
    expectQuantityRejected(retailOpsProductUnitPriceHistorySchema, {
      ...storeScope,
      limit: 0,
    })
    expectQuantityRejected(retailOpsUpdateProductUnitPriceSchema, {
      ...storeScope,
      priceMinor: 0,
      productVariantId: "unit-1",
    })
    expectQuantityRejected(retailOpsUpdateProductUnitPriceSchema, {
      ...storeScope,
      priceMinor: 19_000,
      productVariantId: "",
    })
  })
})

describe("retail ops contact email schemas", () => {
  test("normalizes mobile-entered contact emails before validation", () => {
    expect(
      retailOpsCreateSaleSchema.parse({
        ...storeScope,
        customerEmail: " CUSTOMER@RETAIL.TEST ",
        customerName: " Customer Name ",
        productVariantId: "unit-1",
        quantity: "3",
      }),
    ).toMatchObject({
      customerEmail: "customer@retail.test",
      customerName: "Customer Name",
    })

    expect(
      retailOpsCustomerUpsertSchema.parse({
        ...storeScope,
        email: " CUSTOMER@RETAIL.TEST ",
        lastSaleExternalId: "sale-1",
        name: " Customer Name ",
      }),
    ).toMatchObject({
      email: "customer@retail.test",
      name: "Customer Name",
    })

    expect(
      retailOpsInviteStaffSchema.parse({
        ...storeScope,
        email: " ATTENDANT@BUSINESS.TEST ",
        name: " Sales Attendant ",
      }),
    ).toMatchObject({
      email: "attendant@business.test",
      name: "Sales Attendant",
      role: "cashier",
    })
  })

  test("rejects invalid contact email formats after trimming", () => {
    expectQuantityRejected(retailOpsCreateSaleSchema, {
      ...storeScope,
      customerEmail: "not-an-email",
      productVariantId: "unit-1",
      quantity: 1,
    })
    expectQuantityRejected(retailOpsCustomerUpsertSchema, {
      ...storeScope,
      email: "customer@",
      lastSaleExternalId: "sale-1",
      name: "Customer Name",
    })
    expectQuantityRejected(retailOpsInviteStaffSchema, {
      ...storeScope,
      email: "attendant@",
    })
  })
})

describe("retail ops optional phone schemas", () => {
  test("trims optional phone fields and treats blank phones as absent", () => {
    expect(
      retailOpsCreateSaleSchema.parse({
        ...storeScope,
        customerPhone: "   ",
        productVariantId: "unit-1",
        quantity: "3",
      }),
    ).toMatchObject({
      customerPhone: undefined,
    })

    expect(
      retailOpsCustomerUpsertSchema.parse({
        ...storeScope,
        lastSaleExternalId: "sale-1",
        name: "Customer Name",
        phone: " 08000000000 ",
      }),
    ).toMatchObject({
      phone: "08000000000",
    })

    expect(
      retailOpsCreateSharedProductOrderRequestSchema.parse({
        customerEmail: "customer@retail.test",
        customerName: "Customer Name",
        customerPhone: "   ",
        productSlug: "rice-bag",
        productVariantId: "unit-1",
        quantity: "2",
        storeSlug: "main-store",
        tenantSlug: "tenant-one",
        token: "public-token-1",
      }),
    ).toMatchObject({
      customerPhone: undefined,
    })

    expect(
      retailOpsCreateDeliveryRequestSchema.parse({
        ...storeScope,
        dropoffAddress: "Customer address",
        dropoffName: "Customer",
        dropoffPhone: " 08000000000 ",
        orderId: "order-1",
        pickupAddress: "Store address",
        pickupName: "Store counter",
        pickupPhone: "   ",
      }),
    ).toMatchObject({
      dropoffPhone: "08000000000",
      pickupPhone: undefined,
    })

    expect(
      retailOpsUpdateDeliveryRequestStatusSchema.parse({
        ...storeScope,
        assignedDriverPhone: "   ",
        deliveryRequestId: "delivery-1",
        status: "assigned",
      }),
    ).toMatchObject({
      assignedDriverPhone: undefined,
    })
  })

  test("rejects oversized optional phone fields", () => {
    expectQuantityRejected(retailOpsCreateSaleSchema, {
      ...storeScope,
      customerPhone: "1".repeat(41),
      productVariantId: "unit-1",
      quantity: 1,
    })
    expectQuantityRejected(retailOpsCreateSharedProductOrderRequestSchema, {
      customerEmail: "customer@retail.test",
      customerName: "Customer Name",
      customerPhone: "1".repeat(41),
      productSlug: "rice-bag",
      productVariantId: "unit-1",
      quantity: 1,
      storeSlug: "main-store",
      tenantSlug: "tenant-one",
      token: "public-token-1",
    })
  })
})

describe("retail ops shared product link schemas", () => {
  test("accepts shared product lookup and order request payloads", () => {
    const lookup = retailOpsSharedProductLookupSchema.parse({
      productSlug: " rice-bag ",
      storeSlug: " main-store ",
      tenantSlug: " tenant-one ",
      token: " public-token-1 ",
    })

    expect(lookup).toEqual({
      productSlug: "rice-bag",
      storeSlug: "main-store",
      tenantSlug: "tenant-one",
      token: "public-token-1",
    })

    const orderRequest = retailOpsCreateSharedProductOrderRequestSchema.parse({
      ...lookup,
      customerEmail: " CUSTOMER@RETAIL.TEST ",
      customerName: " New Customer ",
      customerPhone: " 08000000000 ",
      notes: " Keep one aside ",
      productVariantId: "unit-1",
      quantity: "3",
    })

    expect(orderRequest).toMatchObject({
      customerEmail: "customer@retail.test",
      customerName: "New Customer",
      customerPhone: "08000000000",
      notes: "Keep one aside",
      quantity: 3,
    })
  })

  test("rejects unsafe shared product order request quantities and tokens", () => {
    expectQuantityRejected(retailOpsCreateSharedProductOrderRequestSchema, {
      customerEmail: "customer@retail.test",
      customerName: "Customer",
      productSlug: "rice-bag",
      productVariantId: "unit-1",
      quantity: 1.5,
      storeSlug: "main-store",
      tenantSlug: "tenant-one",
      token: "public-token-1",
    })

    expectQuantityRejected(retailOpsCreateSharedProductOrderRequestSchema, {
      customerEmail: "customer@retail.test",
      customerName: "Customer",
      productSlug: "rice-bag",
      productVariantId: "unit-1",
      quantity: 0,
      storeSlug: "main-store",
      tenantSlug: "tenant-one",
      token: "public-token-1",
    })

    expectQuantityRejected(retailOpsCreateSharedProductOrderRequestSchema, {
      customerEmail: "customer@retail.test",
      customerName: "Customer",
      productSlug: "rice-bag",
      productVariantId: "unit-1",
      quantity: 1,
      storeSlug: "main-store",
      tenantSlug: "tenant-one",
      token: "short",
    })
  })

  test("keeps generated-link management filters bounded", () => {
    expect(
      retailOpsCreateProductShareLinkSchema.parse({
        ...storeScope,
        label: " WhatsApp buyers ",
        productId: "product-1",
      }),
    ).toMatchObject({
      label: "WhatsApp buyers",
      productId: "product-1",
    })

    expect(
      retailOpsProductShareLinkAnalyticsSchema.safeParse({
        ...storeScope,
        from: "2026-07-01",
        productId: "product-1",
        to: "2026-07-31",
      }).success,
    ).toBe(true)

    expect(
      retailOpsSharedLinkOrderRequestsSchema.parse({
        ...storeScope,
      }),
    ).toMatchObject({
      limit: 25,
      status: "pending",
    })

    expect(
      retailOpsDeliveryRequestsSchema.parse({
        ...storeScope,
      }),
    ).toMatchObject({
      limit: 25,
      status: "all",
    })

    expectQuantityRejected(retailOpsSharedLinkOrderRequestsSchema, {
      ...storeScope,
      limit: 101,
    })
    expectQuantityRejected(retailOpsDeliveryRequestsSchema, {
      ...storeScope,
      status: "waiting",
    })
  })

  test("accepts order follow-up payment, fulfillment, and delivery updates", () => {
    expect(
      retailOpsUpdateSharedLinkOrderRequestStatusSchema.safeParse({
        ...storeScope,
        fulfilledAt: "2026-07-12T08:30:00.000Z",
        fulfillmentMethod: "pickup",
        fulfillmentNote: "Ready at the counter",
        fulfillmentStatus: "ready_for_pickup",
        orderId: "order-1",
        paidAt: "2026-07-12T08:00:00.000Z",
        paymentMethod: "transfer",
        status: "completed",
      }).success,
    ).toBe(true)

    expect(
      retailOpsCreateDeliveryRequestSchema.safeParse({
        ...storeScope,
        dropoffAddress: "Customer address",
        dropoffName: "Customer",
        orderId: "order-1",
        pickupAddress: "Store address",
        pickupName: "Store counter",
        requestedAt: "2026-07-12T09:00:00.000Z",
      }).success,
    ).toBe(true)

    expect(
      retailOpsUpdateDeliveryRequestStatusSchema.safeParse({
        ...storeScope,
        assignedDriverName: "Assigned driver",
        assignedDriverPhone: "08000000000",
        deliveryRequestId: "delivery-1",
        happenedAt: "2026-07-12T09:30:00.000Z",
        note: "Package assigned",
        status: "assigned",
      }).success,
    ).toBe(true)
  })

  test("rejects unsupported shared-link follow-up outcomes", () => {
    expectQuantityRejected(retailOpsUpdateSharedLinkOrderRequestStatusSchema, {
      ...storeScope,
      fulfillmentStatus: "returned",
      orderId: "order-1",
      paymentMethod: "credit",
      status: "completed",
    })

    expectQuantityRejected(retailOpsCreateDeliveryRequestSchema, {
      ...storeScope,
      dropoffAddress: "",
      dropoffName: "Customer",
      orderId: "order-1",
      pickupAddress: "Store address",
      pickupName: "Store counter",
    })

    expectQuantityRejected(retailOpsUpdateDeliveryRequestStatusSchema, {
      ...storeScope,
      deliveryRequestId: "delivery-1",
      status: "draft",
    })
  })
})
