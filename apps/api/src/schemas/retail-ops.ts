import { z } from "zod"

const retailOpsEmailSchema = z.string().trim().toLowerCase().pipe(z.email())
const retailOpsOptionalPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value || undefined)
  .optional()
const retailOpsProductImageUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, "Product image URL must use http or https.")
  .optional()
const retailOpsProductImageLinksSchema = z
  .array(retailOpsProductImageUrlSchema.unwrap())
  .max(8)
  .default([])

export const retailOpsStoreScopeSchema = z.object({
  storeId: z.string().trim().min(1).optional(),
})

export const retailOpsOfflineDevicePlatformSchema = z
  .enum(["android", "ios", "unknown", "web"])
  .default("unknown")

export const retailOpsSubscriptionPlanIdSchema = z.enum([
  "growth",
  "pro",
  "starter",
])

export const retailOpsSubscriptionCheckoutSurfaceSchema = z
  .enum(["dashboard", "mobile", "unknown"])
  .default("unknown")

export const retailOpsCreateSubscriptionCheckoutIntentSchema = z.object({
  planId: retailOpsSubscriptionPlanIdSchema,
  surface: retailOpsSubscriptionCheckoutSurfaceSchema,
})

export const retailOpsRegisterOfflineDeviceSchema =
  retailOpsStoreScopeSchema.extend({
    appVersion: z.string().trim().min(1).max(80).optional(),
    deviceId: z.string().trim().min(3).max(160),
    deviceName: z.string().trim().min(1).max(120).optional(),
    platform: retailOpsOfflineDevicePlatformSchema,
  })

export const retailOpsRevokeOfflineDeviceSchema = z.object({
  deviceId: z.string().trim().min(3).max(160),
})

export const retailOpsRestoreOfflineDeviceSchema = z.object({
  deviceId: z.string().trim().min(3).max(160),
})

export const retailOpsReportRangeSchema = retailOpsStoreScopeSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const retailOpsCustomerBookSchema = retailOpsStoreScopeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(1).max(120).optional(),
})

export const retailOpsCustomerUpsertSchema = retailOpsStoreScopeSchema.extend({
  email: retailOpsEmailSchema.optional(),
  externalId: z.string().trim().min(1).max(120).optional(),
  lastSaleExternalId: z.string().trim().min(1).max(120),
  lastSeenAt: z.coerce.date().optional(),
  name: z.string().trim().min(1).max(160),
  phone: retailOpsOptionalPhoneSchema,
})

export const retailOpsRecentSalesSchema = retailOpsStoreScopeSchema.extend({
  from: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  to: z.coerce.date().optional(),
})

export const retailOpsCreditSalesSchema = retailOpsStoreScopeSchema.extend({
  from: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  to: z.coerce.date().optional(),
})

export const retailOpsSessionStatusFilterSchema = z.enum([
  "all",
  "closed",
  "open",
])

export const retailOpsSessionsSchema = retailOpsStoreScopeSchema.extend({
  from: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: retailOpsSessionStatusFilterSchema.default("all"),
  to: z.coerce.date().optional(),
})

export const retailOpsPaymentMethodSchema = z.enum([
  "cash",
  "transfer",
  "card",
  "credit",
])

export const retailOpsCreditPaymentMethodSchema = z.enum([
  "cash",
  "transfer",
  "card",
])

export const retailOpsStaffRoleSchema = z.enum([
  "cashier",
  "operator",
  "manager",
])

export const retailOpsStaffListRoleFilterSchema = z.enum([
  "admin",
  "all",
  "cashier",
  "manager",
  "operator",
  "owner",
])

export const retailOpsStaffListStatusFilterSchema = z.enum([
  "active",
  "all",
  "invited",
  "suspended",
])

export const retailOpsStaffListSchema = retailOpsStoreScopeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: retailOpsStaffListRoleFilterSchema.default("all"),
  search: z.string().trim().min(1).max(120).optional(),
  status: retailOpsStaffListStatusFilterSchema.default("all"),
})

export const retailOpsUpdateStaffStatusSchema =
  retailOpsStoreScopeSchema.extend({
    staffUserId: z.string().trim().min(1),
    status: z.enum(["active", "suspended"]),
  })

export const retailOpsCompleteStaffOnboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  tenantSlug: z.string().trim().min(1).max(120).optional(),
})

export const retailOpsResolveStaffInviteTokenSchema = z.object({
  token: z.string().trim().min(20).max(256),
})

export const retailOpsStaffStockWalletsSchema =
  retailOpsStoreScopeSchema.extend({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    staffUserId: z.string().trim().min(1).optional(),
  })

export const retailOpsAssignStaffStockSchema = retailOpsStoreScopeSchema.extend(
  {
    assignedAt: z.coerce.date().optional(),
    externalId: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    staffUserId: z.string().trim().min(1),
  },
)

export const retailOpsReturnStaffStockSchema = retailOpsStoreScopeSchema.extend(
  {
    externalId: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    returnedAt: z.coerce.date().optional(),
    staffUserId: z.string().trim().min(1),
  },
)

export const retailOpsCreateSaleSchema = retailOpsStoreScopeSchema
  .extend({
    cashierSessionId: z.string().trim().min(1).optional(),
    creditDueAt: z.coerce.date().optional(),
    creditTermsNote: z.string().trim().max(500).optional(),
    customerEmail: retailOpsEmailSchema.optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    customerPhone: retailOpsOptionalPhoneSchema,
    externalId: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    paymentMethod: retailOpsPaymentMethodSchema.default("cash"),
    lines: z
      .array(
        z.object({
          catalogItemVariantId: z.string().trim().min(1),
          quantity: z.coerce.number().int().positive().max(100_000),
        }),
      )
      .min(1)
      .max(100)
      .optional(),
    productVariantId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().positive().max(100_000).optional(),
    serviceDueAt: z.coerce.date().optional(),
    soldAt: z.coerce.date().optional(),
  })
  .superRefine((input, ctx) => {
    if (
      !input.lines?.length &&
      (!input.productVariantId || input.quantity === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one catalog item to the sale.",
        path: ["lines"],
      })
    }
  })

export const retailOpsOfflineCreateSaleSchema = retailOpsCreateSaleSchema.and(
  z.object({
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(100_000),
  }),
)

export const retailOpsRecordCreditPaymentSchema =
  retailOpsStoreScopeSchema.extend({
    amountMinor: z.coerce.number().int().positive().max(100_000_000),
    cashierSessionId: z.string().trim().min(1).optional(),
    externalId: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
    orderId: z.string().trim().min(1),
    paidAt: z.coerce.date().optional(),
    paymentMethod: retailOpsCreditPaymentMethodSchema.default("cash"),
  })

export const retailOpsCancelOrderLineSchema = retailOpsStoreScopeSchema.extend({
  externalId: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(1_000).optional(),
  orderItemId: z.string().trim().min(1),
  refundAmountMinor: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000_000)
    .optional(),
  refundMethod: retailOpsCreditPaymentMethodSchema.optional(),
})

export const retailOpsCreateProductUnitSchema = z.object({
  conversionMultiplier: z.coerce.number().positive().optional(),
  enabled: z.boolean().default(true),
  imageLinks: retailOpsProductImageLinksSchema,
  imageUrl: retailOpsProductImageUrlSchema,
  name: z.string().trim().min(1).max(80),
  openingStockQuantity: z.coerce.number().int().min(0).default(0),
  priceMinor: z.coerce.number().int().positive(),
  variantLabel: z.string().trim().min(1).max(80).optional(),
})

export const retailOpsCreateProductSchema = retailOpsStoreScopeSchema.extend({
  description: z.string().trim().max(1_000).optional(),
  externalId: z.string().trim().min(1).max(120).optional(),
  imageLinks: retailOpsProductImageLinksSchema,
  imageUrl: retailOpsProductImageUrlSchema,
  name: z.string().trim().min(1).max(160),
  openingStockQuantity: z.coerce.number().int().min(0).default(0),
  primaryUnitName: z.string().trim().min(1).max(80),
  priceMinor: z.coerce.number().int().positive(),
  unitTemplateKey: z.string().trim().min(1).max(120).optional(),
  variants: z.array(retailOpsCreateProductUnitSchema).max(24).default([]),
})

export const retailOpsCatalogItemKindSchema = z.enum(["product", "service"])

export const retailOpsCatalogItemsSchema = retailOpsStoreScopeSchema.extend({
  kind: retailOpsCatalogItemKindSchema.optional(),
})

export const retailOpsCreateCatalogItemSchema = retailOpsStoreScopeSchema
  .extend({
    category: z.string().trim().max(120).optional(),
    description: z.string().trim().max(1_000).optional(),
    externalId: z.string().trim().min(1).max(120).optional(),
    imageLinks: retailOpsProductImageLinksSchema,
    imageUrl: retailOpsProductImageUrlSchema,
    kind: retailOpsCatalogItemKindSchema,
    name: z.string().trim().min(1).max(160),
    openingStockQuantity: z.coerce.number().int().min(0).optional(),
    priceMinor: z.coerce.number().int().min(0).max(100_000_000),
    primaryUnitName: z.string().trim().min(1).max(80).optional(),
    service: z
      .object({
        estimatedTurnaroundHours: z.coerce
          .number()
          .int()
          .min(1)
          .max(8_760)
          .optional(),
        fulfillmentMode: z.enum(["immediate", "tracked"]).default("tracked"),
        instructions: z.string().trim().max(2_000).optional(),
      })
      .optional(),
    unitTemplateKey: z.string().trim().min(1).max(120).optional(),
    variants: z
      .array(
        retailOpsCreateProductUnitSchema.extend({
          openingStockQuantity: z.coerce.number().int().min(0).optional(),
        }),
      )
      .max(24)
      .default([]),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "product" && !input.primaryUnitName) {
      ctx.addIssue({
        code: "custom",
        message: "A primary unit is required for a Product.",
        path: ["primaryUnitName"],
      })
    }
    if (
      input.kind === "service" &&
      ((input.openingStockQuantity ?? 0) > 0 ||
        input.variants.some(
          (variant) => (variant.openingStockQuantity ?? 0) > 0,
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Service items do not have stock.",
        path: ["openingStockQuantity"],
      })
    }
  })

export const retailOpsUpdateCatalogItemSchema =
  retailOpsStoreScopeSchema.extend({
    category: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    imageLinks: retailOpsProductImageLinksSchema,
    imageUrl: retailOpsProductImageUrlSchema.nullable().optional(),
    itemId: z.string().trim().min(1),
    kind: retailOpsCatalogItemKindSchema,
    name: z.string().trim().min(1).max(160).optional(),
    priceMinor: z.coerce.number().int().min(0).max(100_000_000).optional(),
    service: z
      .object({
        estimatedTurnaroundHours: z.coerce
          .number()
          .int()
          .min(1)
          .max(8_760)
          .nullable()
          .optional(),
        fulfillmentMode: z.enum(["immediate", "tracked"]).optional(),
        instructions: z.string().trim().max(2_000).nullable().optional(),
      })
      .optional(),
    status: z.enum(["active", "archived"]).optional(),
  })

export const retailOpsServiceJobStatusSchema = z.enum([
  "received",
  "in_progress",
  "ready",
  "completed",
  "cancelled",
])

export const retailOpsServiceJobsSchema = retailOpsStoreScopeSchema.extend({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  status: retailOpsServiceJobStatusSchema.optional(),
})

export const retailOpsUpdateServiceJobStatusSchema =
  retailOpsStoreScopeSchema.extend({
    jobId: z.string().trim().min(1),
    note: z.string().trim().max(1_000).optional(),
    status: retailOpsServiceJobStatusSchema,
  })

export const retailOpsAssignServiceJobSchema = retailOpsStoreScopeSchema.extend(
  {
    assignedUserId: z.string().trim().min(1).nullable().optional(),
    jobId: z.string().trim().min(1),
    note: z.string().trim().max(1_000).optional(),
  },
)

export const retailOpsDelayServiceJobSchema = retailOpsStoreScopeSchema.extend({
  dueAt: z.coerce.date(),
  jobId: z.string().trim().min(1),
  note: z.string().trim().min(1).max(1_000),
})

export const retailOpsAddServiceJobEvidenceSchema =
  retailOpsStoreScopeSchema.extend({
    jobId: z.string().trim().min(1),
    label: z.string().trim().max(160).optional(),
    mediaType: z.string().trim().max(120).optional(),
    url: z.string().trim().url().max(2_000),
  })

export const retailOpsServiceJobIdSchema = retailOpsStoreScopeSchema.extend({
  jobId: z.string().trim().min(1),
})

export const retailOpsServiceTrackingSchema = z.object({
  trackingToken: z.string().trim().min(12).max(256),
})

export const retailOpsCreateServiceRequestLinkSchema =
  retailOpsStoreScopeSchema.extend({
    label: z.string().trim().min(1).max(160),
  })

export const retailOpsServiceRequestLinkIdSchema =
  retailOpsStoreScopeSchema.extend({
    linkId: z.string().trim().min(1),
  })

export const retailOpsPublicServiceRequestLinkSchema = z.object({
  token: z.string().trim().min(12).max(256),
})

export const retailOpsCreatePublicServiceRequestSchema =
  retailOpsPublicServiceRequestLinkSchema.extend({
    customerEmail: retailOpsEmailSchema.optional(),
    customerName: z.string().trim().min(1).max(160),
    customerPhone: retailOpsOptionalPhoneSchema,
    lines: z
      .array(
        z.object({
          catalogItemVariantId: z.string().trim().min(1),
          quantity: z.coerce.number().int().positive().max(100_000),
        }),
      )
      .min(1)
      .max(100),
    notes: z.string().trim().max(1_000).optional(),
  })

export const retailOpsServiceRequestStatusSchema = z.enum([
  "pending",
  "confirmed",
  "converted",
  "rejected",
  "cancelled",
])

export const retailOpsServiceRequestsSchema = retailOpsStoreScopeSchema.extend({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  status: retailOpsServiceRequestStatusSchema.optional(),
})

export const retailOpsUpdateServiceRequestStatusSchema =
  retailOpsStoreScopeSchema.extend({
    requestId: z.string().trim().min(1),
    status: z.enum(["pending", "confirmed", "rejected", "cancelled"]),
  })

export const retailOpsConvertServiceRequestSchema =
  retailOpsStoreScopeSchema.extend({
    paymentMethod: retailOpsPaymentMethodSchema.default("cash"),
    requestId: z.string().trim().min(1),
    serviceDueAt: z.coerce.date().optional(),
  })

export const retailOpsUpdateProductUnitPriceSchema =
  retailOpsStoreScopeSchema.extend({
    effectiveAt: z.coerce.date().optional(),
    priceMinor: z.coerce.number().int().positive(),
    productVariantId: z.string().trim().min(1),
    reason: z.string().trim().max(500).optional(),
  })

export const retailOpsProductUnitEffectivePriceSchema =
  retailOpsStoreScopeSchema.extend({
    effectiveAt: z.coerce.date().optional(),
    productVariantId: z.string().trim().min(1),
  })

export const retailOpsProductUnitPriceHistorySchema =
  retailOpsStoreScopeSchema.extend({
    from: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    productVariantId: z.string().trim().min(1).optional(),
    to: z.coerce.date().optional(),
  })

export const retailOpsStockMovementsSchema = retailOpsStoreScopeSchema.extend({
  from: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  productVariantId: z.string().trim().min(1).optional(),
  to: z.coerce.date().optional(),
})

export const retailOpsRecordStockIntakeSchema =
  retailOpsStoreScopeSchema.extend({
    externalId: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    receivedAt: z.coerce.date().optional(),
    sourceName: z.string().trim().min(1).max(160).optional(),
  })

export const retailOpsStockAdjustmentReasonSchema = z.enum([
  "correction",
  "damage",
  "found_stock",
  "loss",
])

export const retailOpsRecordStockAdjustmentSchema =
  retailOpsStoreScopeSchema.extend({
    adjustedAt: z.coerce.date().optional(),
    direction: z.enum(["decrease", "increase"]),
    externalId: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    reason: retailOpsStockAdjustmentReasonSchema.default("correction"),
    sourceName: z.string().trim().min(1).max(160).optional(),
  })

export const retailOpsRecordUnitConversionSchema =
  retailOpsStoreScopeSchema.extend({
    convertedAt: z.coerce.date().optional(),
    externalId: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
    sourceProductVariantId: z.string().trim().min(1),
    sourceQuantity: z.coerce.number().int().positive().max(1_000_000),
    targetProductVariantId: z.string().trim().min(1),
    targetQuantity: z.coerce
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .optional(),
  })

export const retailOpsOpenSessionSchema = retailOpsStoreScopeSchema.extend({
  externalId: z.string().trim().min(1).max(120).optional(),
  inventoryLines: z
    .array(
      z.object({
        countedQuantity: z.coerce.number().int().min(0).max(1_000_000),
        note: z.string().trim().max(240).optional(),
        productVariantId: z.string().trim().min(1),
      }),
    )
    .max(100)
    .default([]),
  notes: z.string().trim().max(500).optional(),
  openedAt: z.coerce.date().optional(),
  openingFloatMinor: z.coerce.number().int().min(0).default(0),
})

export const retailOpsCloseSessionSchema = retailOpsStoreScopeSchema.extend({
  cashierSessionId: z.string().trim().min(1),
  closedAt: z.coerce.date().optional(),
  closingFloatMinor: z.coerce.number().int().min(0),
  inventoryLines: z
    .array(
      z.object({
        countedQuantity: z.coerce.number().int().min(0).max(1_000_000),
        note: z.string().trim().max(240).optional(),
        productVariantId: z.string().trim().min(1),
      }),
    )
    .max(100)
    .default([]),
  declaredCardMinor: z.coerce.number().int().min(0).default(0),
  declaredCreditMinor: z.coerce.number().int().min(0).default(0),
  declaredTransferMinor: z.coerce.number().int().min(0).default(0),
  externalId: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(500).optional(),
})

export const retailOpsReviewCloseoutSessionSchema =
  retailOpsStoreScopeSchema.extend({
    cashierSessionId: z.string().trim().min(1),
    note: z.string().trim().max(500).optional(),
    status: z.enum(["approved", "rejected"]),
  })

export const retailOpsInviteStaffSchema = retailOpsStoreScopeSchema.extend({
  email: retailOpsEmailSchema,
  externalId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  role: retailOpsStaffRoleSchema.default("cashier"),
})

export const retailOpsCreateProductShareLinkSchema =
  retailOpsStoreScopeSchema.extend({
    externalId: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    productId: z.string().trim().min(1),
  })

export const retailOpsDeactivateProductShareLinkSchema =
  retailOpsStoreScopeSchema.extend({
    externalId: z.string().trim().min(1).max(120).optional(),
    productId: z.string().trim().min(1),
    shareLinkId: z.string().trim().min(1),
  })

export const retailOpsProductShareLinkAnalyticsSchema =
  retailOpsStoreScopeSchema.extend({
    from: z.coerce.date().optional(),
    productId: z.string().trim().min(1).optional(),
    shareLinkId: z.string().trim().min(1).optional(),
    to: z.coerce.date().optional(),
  })

export const retailOpsSharedLinkOrderRequestStatusFilterSchema = z.enum([
  "all",
  "cancelled",
  "completed",
  "pending",
])

export const retailOpsSharedLinkOrderRequestsSchema =
  retailOpsStoreScopeSchema.extend({
    from: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status:
      retailOpsSharedLinkOrderRequestStatusFilterSchema.default("pending"),
    to: z.coerce.date().optional(),
  })

export const retailOpsUpdateSharedLinkOrderRequestStatusSchema =
  retailOpsStoreScopeSchema.extend({
    cashierSessionId: z.string().trim().min(1).optional(),
    fulfilledAt: z.coerce.date().optional(),
    fulfillmentMethod: z.enum(["delivery", "other", "pickup"]).optional(),
    fulfillmentNote: z.string().trim().max(500).optional(),
    fulfillmentStatus: z
      .enum(["delivered", "pending", "picked_up", "ready_for_pickup"])
      .optional(),
    orderId: z.string().trim().min(1),
    paidAt: z.coerce.date().optional(),
    paymentMethod: retailOpsCreditPaymentMethodSchema.optional(),
    status: z.enum(["cancelled", "completed"]),
  })

export const retailOpsDeliveryRequestStatusFilterSchema = z.enum([
  "all",
  "assigned",
  "cancelled",
  "delivered",
  "draft",
  "open",
  "picked_up",
])

export const retailOpsDeliveryRequestsSchema = retailOpsStoreScopeSchema.extend(
  {
    from: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: retailOpsDeliveryRequestStatusFilterSchema.default("all"),
    to: z.coerce.date().optional(),
  },
)

export const retailOpsCreateDeliveryRequestSchema =
  retailOpsStoreScopeSchema.extend({
    dropoffAddress: z.string().trim().min(1).max(240),
    dropoffName: z.string().trim().min(1).max(160),
    dropoffPhone: retailOpsOptionalPhoneSchema,
    notes: z.string().trim().max(500).optional(),
    orderId: z.string().trim().min(1),
    pickupAddress: z.string().trim().min(1).max(240),
    pickupName: z.string().trim().min(1).max(160),
    pickupPhone: retailOpsOptionalPhoneSchema,
    requestedAt: z.coerce.date().optional(),
  })

export const retailOpsUpdateDeliveryRequestStatusSchema =
  retailOpsStoreScopeSchema.extend({
    assignedDriverName: z.string().trim().min(1).max(120).optional(),
    assignedDriverPhone: retailOpsOptionalPhoneSchema,
    deliveryRequestId: z.string().trim().min(1),
    happenedAt: z.coerce.date().optional(),
    note: z.string().trim().max(500).optional(),
    status: z.enum(["assigned", "cancelled", "delivered", "picked_up"]),
  })

const retailOpsPublicSlugSchema = z.string().trim().min(1).max(120)

export const retailOpsSharedProductLookupSchema = z.object({
  productSlug: retailOpsPublicSlugSchema,
  storeSlug: retailOpsPublicSlugSchema,
  tenantSlug: retailOpsPublicSlugSchema,
  token: z.string().trim().min(8).max(120),
})

export const retailOpsCreateSharedProductOrderRequestSchema =
  retailOpsSharedProductLookupSchema.extend({
    customerEmail: retailOpsEmailSchema,
    customerName: z.string().trim().min(1).max(160),
    customerPhone: retailOpsOptionalPhoneSchema,
    notes: z.string().trim().max(500).optional(),
    productVariantId: z.string().trim().min(1),
    quantity: z.coerce.number().int().positive().max(100_000),
  })

const retailOpsSyncEventBaseSchema = z.object({
  createdAt: z.coerce.date().optional(),
  eventId: z.string().trim().min(1).max(120),
})

export const retailOpsSyncEventTypeSchema = z.enum([
  "closeout_created",
  "credit_payment_recorded",
  "customer_upsert",
  "product_setup",
  "rep_session_opened",
  "sale_created",
  "share_link_created",
  "share_link_deactivated",
  "staff_invited",
  "stock_adjustment_recorded",
  "stock_intake_recorded",
  "unit_conversion_recorded",
])

export const retailOpsSyncEventSchema = z.discriminatedUnion("type", [
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsCreateProductSchema,
    type: z.literal("product_setup"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsOfflineCreateSaleSchema,
    type: z.literal("sale_created"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsRecordCreditPaymentSchema,
    type: z.literal("credit_payment_recorded"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsRecordStockIntakeSchema,
    type: z.literal("stock_intake_recorded"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsRecordStockAdjustmentSchema,
    type: z.literal("stock_adjustment_recorded"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsRecordUnitConversionSchema,
    type: z.literal("unit_conversion_recorded"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsCloseSessionSchema,
    type: z.literal("closeout_created"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsCustomerUpsertSchema,
    type: z.literal("customer_upsert"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsOpenSessionSchema,
    type: z.literal("rep_session_opened"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsCreateProductShareLinkSchema,
    type: z.literal("share_link_created"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsDeactivateProductShareLinkSchema,
    type: z.literal("share_link_deactivated"),
  }),
  retailOpsSyncEventBaseSchema.extend({
    payload: retailOpsInviteStaffSchema,
    type: z.literal("staff_invited"),
  }),
])

export const retailOpsSyncEventsSchema = z.object({
  deviceId: z.string().trim().min(3).max(160).optional(),
  events: z.array(retailOpsSyncEventSchema).min(1).max(50),
})

export const retailOpsSyncHistorySchema = z.object({
  deviceId: z.string().trim().min(3).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export const retailOpsSyncConflictsSchema = z.object({
  deviceId: z.string().trim().min(3).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
})

export const retailOpsReviewSyncConflictSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
})

export type RetailOpsStoreScopeInput = z.infer<typeof retailOpsStoreScopeSchema>
export type RetailOpsReportRangeInput = z.infer<
  typeof retailOpsReportRangeSchema
>
export type RetailOpsCustomerBookInput = z.infer<
  typeof retailOpsCustomerBookSchema
>
export type RetailOpsCustomerUpsertInput = z.infer<
  typeof retailOpsCustomerUpsertSchema
>
export type RetailOpsRecentSalesInput = z.infer<
  typeof retailOpsRecentSalesSchema
>
export type RetailOpsCreditSalesInput = z.infer<
  typeof retailOpsCreditSalesSchema
>
export type RetailOpsSessionStatusFilter = z.infer<
  typeof retailOpsSessionStatusFilterSchema
>
export type RetailOpsSessionsInput = z.infer<typeof retailOpsSessionsSchema>
export type RetailOpsPaymentMethod = z.infer<
  typeof retailOpsPaymentMethodSchema
>
export type RetailOpsSubscriptionPlanId = z.infer<
  typeof retailOpsSubscriptionPlanIdSchema
>
export type RetailOpsCreateSubscriptionCheckoutIntentInput = z.infer<
  typeof retailOpsCreateSubscriptionCheckoutIntentSchema
>
export type RetailOpsCreditPaymentMethod = z.infer<
  typeof retailOpsCreditPaymentMethodSchema
>
export type RetailOpsStaffRole = z.infer<typeof retailOpsStaffRoleSchema>
export type RetailOpsStaffListRoleFilter = z.infer<
  typeof retailOpsStaffListRoleFilterSchema
>
export type RetailOpsStaffListStatusFilter = z.infer<
  typeof retailOpsStaffListStatusFilterSchema
>
export type RetailOpsStaffListInput = z.infer<typeof retailOpsStaffListSchema>
export type RetailOpsCompleteStaffOnboardingInput = z.infer<
  typeof retailOpsCompleteStaffOnboardingSchema
>
export type RetailOpsResolveStaffInviteTokenInput = z.infer<
  typeof retailOpsResolveStaffInviteTokenSchema
>
export type RetailOpsCreateSaleInput = z.infer<typeof retailOpsCreateSaleSchema>
export type RetailOpsRecordCreditPaymentInput = z.infer<
  typeof retailOpsRecordCreditPaymentSchema
>
export type RetailOpsCreateProductInput = z.infer<
  typeof retailOpsCreateProductSchema
>
export type RetailOpsRecordStockIntakeInput = z.infer<
  typeof retailOpsRecordStockIntakeSchema
>
export type RetailOpsStockAdjustmentReason = z.infer<
  typeof retailOpsStockAdjustmentReasonSchema
>
export type RetailOpsRecordStockAdjustmentInput = z.infer<
  typeof retailOpsRecordStockAdjustmentSchema
>
export type RetailOpsRecordUnitConversionInput = z.infer<
  typeof retailOpsRecordUnitConversionSchema
>
export type RetailOpsOpenSessionInput = z.infer<
  typeof retailOpsOpenSessionSchema
>
export type RetailOpsCloseSessionInput = z.infer<
  typeof retailOpsCloseSessionSchema
>
export type RetailOpsInviteStaffInput = z.infer<
  typeof retailOpsInviteStaffSchema
>
export type RetailOpsCreateProductShareLinkInput = z.infer<
  typeof retailOpsCreateProductShareLinkSchema
>
export type RetailOpsDeactivateProductShareLinkInput = z.infer<
  typeof retailOpsDeactivateProductShareLinkSchema
>
export type RetailOpsProductShareLinkAnalyticsInput = z.infer<
  typeof retailOpsProductShareLinkAnalyticsSchema
>
export type RetailOpsSharedLinkOrderRequestStatusFilter = z.infer<
  typeof retailOpsSharedLinkOrderRequestStatusFilterSchema
>
export type RetailOpsSharedLinkOrderRequestsInput = z.infer<
  typeof retailOpsSharedLinkOrderRequestsSchema
>
export type RetailOpsUpdateSharedLinkOrderRequestStatusInput = z.infer<
  typeof retailOpsUpdateSharedLinkOrderRequestStatusSchema
>
export type RetailOpsSharedProductLookupInput = z.infer<
  typeof retailOpsSharedProductLookupSchema
>
export type RetailOpsCreateSharedProductOrderRequestInput = z.infer<
  typeof retailOpsCreateSharedProductOrderRequestSchema
>
export type RetailOpsSyncEventType = z.infer<
  typeof retailOpsSyncEventTypeSchema
>
export type RetailOpsSyncEventInput = z.infer<typeof retailOpsSyncEventSchema>
export type RetailOpsSyncEventsInput = z.infer<typeof retailOpsSyncEventsSchema>
export type RetailOpsSyncHistoryInput = z.infer<
  typeof retailOpsSyncHistorySchema
>
export type RetailOpsSyncConflictsInput = z.infer<
  typeof retailOpsSyncConflictsSchema
>
export type RetailOpsReviewSyncConflictInput = z.infer<
  typeof retailOpsReviewSyncConflictSchema
>
export type RetailOpsProductUnitPriceHistoryInput = z.infer<
  typeof retailOpsProductUnitPriceHistorySchema
>
export type RetailOpsStockMovementsInput = z.infer<
  typeof retailOpsStockMovementsSchema
>
export type RetailOpsRevokeOfflineDeviceInput = z.infer<
  typeof retailOpsRevokeOfflineDeviceSchema
>
export type RetailOpsRestoreOfflineDeviceInput = z.infer<
  typeof retailOpsRestoreOfflineDeviceSchema
>
