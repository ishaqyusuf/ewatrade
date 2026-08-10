import {
  serviceCommerceProductDemandSchema,
  serviceCommerceSourceRefSchema,
  serviceCommerceVerticalSchema,
} from "@ewatrade/service-commerce/schemas"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const exactQuantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, { allowZero: false, maxScale: 6 })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid quantity.",
      })
    }
  })

export const serviceCommerceSourceProjectionSchema = z
  .object({
    source: serviceCommerceSourceRefSchema,
    storeId: z.string().trim().min(1).max(191).optional(),
  })
  .strict()

export const commerceInquiryCreateSchema = z
  .object({
    channelOrigin: z.enum(["web", "staff", "whatsapp"]),
    clientInquiryId: z.string().trim().min(8).max(160),
    customerEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().min(1).max(160),
    customerPhone: z.string().trim().min(7).max(40).optional(),
    demand: serviceCommerceProductDemandSchema,
    lines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(500),
            requestedQuantity: exactQuantitySchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    storeId: z.string().trim().min(1).max(191).optional(),
    summary: z.string().trim().min(1).max(500),
    vertical: serviceCommerceVerticalSchema,
  })
  .strict()

export const commerceInquiryTransitionSchema = z
  .object({
    inquiryId: z.string().trim().min(1).max(191),
    reason: z.string().trim().min(1).max(500),
    storeId: z.string().trim().min(1).max(191).optional(),
    targetStatus: z.enum([
      "NEEDS_CLARIFICATION",
      "READY_TO_QUOTE",
      "DECLINED",
      "WITHDRAWN",
      "EXPIRED",
    ]),
  })
  .strict()

const inquiryQuoteLineSchema = z
  .object({
    availabilityAttestationId: z.string().trim().min(1).max(191).optional(),
    customerNote: z.string().trim().max(500).optional(),
    offeringId: z.string().trim().min(1).max(191).optional(),
    outcome: z.enum(["alternative", "declined", "included", "unavailable"]),
    quantity: exactQuantitySchema.optional(),
    sourceLineId: z.string().trim().min(1).max(191),
    unitPriceMinor: z.number().int().nonnegative().max(100_000_000).optional(),
  })
  .strict()

export const commerceInquiryQuoteIssueSchema = z
  .object({
    availabilityOutcome: z.enum(["full", "partial", "unavailable"]),
    clientQuoteId: z.string().trim().min(8).max(160),
    clientVersionId: z.string().trim().min(8).max(160),
    customerNote: z.string().trim().max(500).optional(),
    discountMinor: z.number().int().nonnegative().optional(),
    expiresAt: z.coerce.date().optional(),
    fulfilmentFeeMinor: z.number().int().nonnegative().optional(),
    fulfilmentPromise: z.string().trim().max(500).optional(),
    fulfilmentType: z.enum(["delivery", "pickup", "unspecified"]).optional(),
    inquiryId: z.string().trim().min(1).max(191),
    lines: z.array(inquiryQuoteLineSchema).min(1).max(100),
    storeId: z.string().trim().min(1).max(191).optional(),
    taxMinor: z.number().int().nonnegative().optional(),
  })
  .strict()

export const publicCommerceInquiryQuoteSchema = z
  .object({ acceptanceToken: z.string().trim().min(20).max(500) })
  .strict()

export const publicCommerceInquiryQuoteAcceptSchema = z
  .object({
    acceptanceToken: z.string().trim().min(20).max(500),
    clientAcceptanceId: z.string().trim().min(8).max(160),
  })
  .strict()
