import { serviceCommerceSourceRefSchema } from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const sourceLineSchema = z
  .object({
    source: serviceCommerceSourceRefSchema,
    sourceLineId: idSchema,
    storeId: idSchema.optional(),
  })
  .strict()

export const serviceCommerceCatalogMatchesSchema = sourceLineSchema

export const serviceCommerceCatalogPriceSuggestionsSchema = sourceLineSchema
  .extend({ offeringId: idSchema })
  .strict()

export const serviceCommerceCatalogCreateDraftSchema = sourceLineSchema
  .extend({
    clientOperationId: idSchema,
    draftKind: z.enum(["product", "service"]),
    expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(191),
    verifiedAlias: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceCommerceCatalogLinkOfferingSchema = sourceLineSchema
  .extend({
    clientOperationId: idSchema,
    expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    offeringId: idSchema,
    verifiedAlias: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceCommerceCatalogAttestAvailabilitySchema = sourceLineSchema
  .extend({
    availability: z.enum([
      "tracked_in_stock",
      "manual_procure_to_order",
      "unavailable",
    ]),
    clientOperationId: idSchema,
    expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.coerce.date().optional(),
    quantity: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d+)?$/)
      .optional(),
    reason: z.string().trim().min(3).max(240),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.availability === "manual_procure_to_order" && !input.expiresAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual procure-to-order availability requires an expiry.",
        path: ["expiresAt"],
      })
    }
    if (input.availability !== "unavailable" && !input.quantity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available Catalog attestations require a quantity.",
        path: ["quantity"],
      })
    }
  })

export const serviceCommerceCatalogPricePromotionImpactSchema = sourceLineSchema
  .extend({
    expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    quoteId: idSchema,
  })
  .strict()

export const serviceCommerceCatalogPromotePriceSchema = sourceLineSchema
  .extend({
    affectedStoreIds: z.array(idSchema).min(1).max(100),
    clientOperationId: idSchema,
    expectedPreviousPriceMinor: z.number().int().min(0).nullable(),
    expectedSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    priceMinor: z.number().int().min(0),
    quoteVersionId: idSchema,
    reason: z.string().trim().min(3).max(240),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.affectedStoreIds).size !== input.affectedStoreIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Affected Stores must be unique.",
        path: ["affectedStoreIds"],
      })
    }
  })
