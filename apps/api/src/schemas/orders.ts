import {
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

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
    customerEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().min(1).max(160).optional(),
    customerPhone: z.string().trim().min(3).max(40).optional(),
    discountMinor: z.number().int().nonnegative().max(100_000_000).optional(),
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
  .object({ orderId: z.string().trim().min(1) })
  .strict()

export const commercialOrderListSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
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
    amountMinor: z.number().int().positive().max(100_000_000),
    clientPaymentId: z.string().trim().min(8).max(160),
    method: z.enum(["bank_transfer", "card", "cash", "other", "pos"]),
    note: z.string().trim().max(500).optional(),
    orderId: z.string().trim().min(1),
    reference: z.string().trim().max(160).optional(),
    type: z.enum(["payment", "refund"]).optional(),
  })
  .strict()
