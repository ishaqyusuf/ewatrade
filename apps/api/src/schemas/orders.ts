import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const commercialOrderPaymentInputSchema = z
  .object({
    amountMinor: z.number().int().positive().max(100_000_000),
    clientPaymentId: z.string().trim().min(8).max(160),
    method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
    note: z.string().trim().max(500).optional(),
    reference: z.string().trim().max(160).optional(),
  })
  .strict()

const exactOrderQuantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, {
        allowZero: false,
        maxScale: EXACT_QUANTITY_MAX_SCALE,
      })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid exact quantity.",
      })
    }
  })
  .transform((value) =>
    parseExactDecimal(value, {
      allowZero: false,
      maxScale: EXACT_QUANTITY_MAX_SCALE,
    }),
  )

export const commercialOrderCreateSchema = z
  .object({
    clientOrderId: z.string().trim().min(8).max(160),
    customerId: z.string().trim().min(1).max(128).optional(),
    customerMode: z.enum(["contact_only", "create"]).optional(),
    customerEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    customerPhone: z.string().trim().min(3).max(40).optional(),
    discountMinor: z.number().int().nonnegative().max(100_000_000).optional(),
    deliveryDueAt: z.coerce.date().optional(),
    fulfillNow: z.boolean().optional(),
    initialPayment: commercialOrderPaymentInputSchema.optional(),
    lines: z
      .array(
        z
          .object({
            approvedQuotePriceMinor: z
              .number()
              .int()
              .nonnegative()
              .max(100_000_000)
              .optional(),
            expectedBalanceRevision: z.number().int().nonnegative().optional(),
            enteredTotalMinor: z
              .number()
              .int()
              .positive()
              .max(100_000_000)
              .optional(),
            note: z.string().trim().max(2_000).optional(),
            expectedConfigurationVersionId: z.string().trim().min(1).optional(),
            expectedFixedPriceMinor: z
              .number()
              .int()
              .nonnegative()
              .max(100_000_000)
              .optional(),
            offeringId: z.string().trim().min(1),
            quantity: exactOrderQuantitySchema,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    notes: z.string().trim().max(2_000).optional(),
    schemaVersion: z.literal(1),
    storeId: z.string().trim().min(1).optional(),
    taxMinor: z.number().int().nonnegative().max(100_000_000).optional(),
  })
  .strict()

export const commercialOrderGetSchema = z
  .object({
    orderId: z.string().trim().min(1).optional(),
    orderNumber: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .refine(
    (input) => Boolean(input.orderId) !== Boolean(input.orderNumber),
    "Choose an order id or number.",
  )

export const commercialOrderListSchema = z
  .object({
    mine: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

const commercialOrderStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
])

/** Without a date range: all-time totals. With one: paid/outstanding too. */
export const commercialOrderReportSummarySchema = z
  .object({
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
    /** Only the caller's own orders (a sales rep's "Your sales"). */
    mine: z.boolean().optional(),
    statuses: z.array(commercialOrderStatusSchema).max(9).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const commercialOrderListPageSchema = z
  .object({
    mine: z.boolean().optional(),
    createdAfter: z.coerce.date().optional(),
    cursor: z.string().trim().min(1).optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    query: z.string().trim().max(160).optional(),
    queryMode: z.enum(["all", "customer"]).default("all"),
    sort: z
      .object({
        field: z.enum(["orderNumber", "status", "createdAt", "total"]),
        direction: z.enum(["asc", "desc"]),
      })
      .strict()
      .optional(),
    statuses: z.array(commercialOrderStatusSchema).max(9).optional(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const commercialOrderFulfillLineSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    orderLineId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500).optional(),
    schemaVersion: z.literal(1),
  })
  .strict()

export const commercialOrderFulfillChargeOnlyServiceLineSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    orderLineId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
  })
  .strict()

export const commercialOrderAuthorizeChargeOnlyServiceLineSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    orderLineId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
  })
  .strict()

export const commercialOrderFulfillProductsSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    orderId: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500).optional(),
    schemaVersion: z.literal(1),
  })
  .strict()

export const commercialOrderReturnLineSchema = z
  .object({
    clientReturnId: z.string().trim().min(8).max(160),
    destinationBalanceSourceId: z.string().trim().min(1).optional(),
    disposition: z.enum(["damaged", "no_restock", "quarantine", "restock"]),
    orderLineId: z.string().trim().min(1),
    quantity: exactOrderQuantitySchema,
    reason: z.string().trim().min(1).max(500),
    schemaVersion: z.literal(1),
  })
  .strict()

export const commercialOrderPaymentSchema = z
  .object({
    ...commercialOrderPaymentInputSchema.shape,
    orderId: z.string().trim().min(1),
    type: z.enum(["payment", "refund"]).optional(),
  })
  .strict()

export const commercialOrderReminderSettingsUpdateSchema = z
  .object({
    dayBeforeEnabled: z.boolean(),
    enabled: z.boolean(),
    sameDayEnabled: z.boolean(),
    storeId: z.string().trim().min(1).optional(),
  })
  .strict()

export const commercialOrderReminderSettingsGetSchema = z
  .object({ storeId: z.string().trim().min(1).optional() })
  .strict()

export const commercialOrderPaymentsListPageSchema = z
  .object({
    storeId: z.string().trim().min(1).optional(),
    cursor: z.string().trim().min(1).optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    query: z.string().trim().max(160).optional(),
  })
  .strict()
