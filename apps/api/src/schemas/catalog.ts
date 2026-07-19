import {
  EXACT_FACTOR_MAX_SCALE,
  EXACT_QUANTITY_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { z } from "zod"

const catalogKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i,
    "Use letters, numbers, hyphens, or underscores.",
  )

const catalogImageUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Image URL must use http or https.",
  })

const exactFactorSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, {
        allowZero: false,
        maxScale: EXACT_FACTOR_MAX_SCALE,
      })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid unit factor.",
      })
    }
  })
  .transform((value) =>
    parseExactDecimal(value, {
      allowZero: false,
      maxScale: EXACT_FACTOR_MAX_SCALE,
    }),
  )

const exactQuantitySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      parseExactDecimal(value, { maxScale: EXACT_QUANTITY_MAX_SCALE })
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid exact quantity.",
      })
    }
  })
  .transform((value) =>
    parseExactDecimal(value, { maxScale: EXACT_QUANTITY_MAX_SCALE }),
  )

const catalogStoreAvailabilitySchema = z
  .object({
    isAvailable: z.boolean(),
    storeId: z.string().trim().min(1),
  })
  .strict()

const catalogOfferingFields = {
  enabled: z.boolean().optional(),
  storeAvailability: z
    .array(catalogStoreAvailabilitySchema)
    .max(100)
    .optional(),
}

const catalogFixedOfferingSchema = z
  .object({
    ...catalogOfferingFields,
    fixedPriceMinor: z.coerce.number().int().min(0).max(100_000_000),
    key: catalogKeySchema,
    name: z.string().trim().min(1).max(120),
    pricingPolicy: z.literal("fixed"),
  })
  .strict()

const catalogQuoteOfferingSchema = z
  .object({
    ...catalogOfferingFields,
    key: catalogKeySchema,
    name: z.string().trim().min(1).max(120),
    pricingPolicy: z.literal("quote_required"),
  })
  .strict()

const serviceWorkPolicyFields = {
  authorizationPolicy: z
    .enum([
      "after_required_payment",
      "manual_release",
      "on_order_confirmation",
    ])
    .optional(),
  guidance: z.string().trim().max(2_000).optional(),
  quantityScale: z.number().int().min(0).max(6).optional(),
  workPolicy: z.enum(["charge_only", "tracked"]).optional(),
}

const catalogProductOfferingSchema = catalogFixedOfferingSchema
  .extend({
    barcode: z.string().trim().min(1).max(120).optional(),
    inventoryUnitKey: catalogKeySchema,
    sku: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

function catalogVariantSchema<T extends z.ZodType>(offeringSchema: T) {
  return z
    .object({
      enabled: z.boolean().optional(),
      isDefault: z.boolean(),
      key: catalogKeySchema,
      name: z.string().trim().min(1).max(120),
      offerings: z.array(offeringSchema).min(1).max(48),
      selections: z
        .array(
          z
            .object({
              groupKey: catalogKeySchema,
              valueKey: catalogKeySchema,
            })
            .strict(),
        )
        .max(12)
        .optional(),
    })
    .strict()
}

const catalogItemFields = {
  category: z.string().trim().max(120).optional(),
  clientOperationId: z.string().trim().min(8).max(160),
  description: z.string().trim().max(2_000).optional(),
  imageLinks: z.array(catalogImageUrlSchema).max(8).default([]),
  imageUrl: catalogImageUrlSchema.optional(),
  name: z.string().trim().min(1).max(160),
  optionGroups: z
    .array(
      z
        .object({
          key: catalogKeySchema,
          name: z.string().trim().min(1).max(80),
          values: z
            .array(
              z
                .object({
                  key: catalogKeySchema,
                  label: z.string().trim().min(1).max(80),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict(),
    )
    .max(12)
    .optional(),
  storeId: z.string().trim().min(1).optional(),
}

export const catalogCreateProductSchema = z
  .object({
    ...catalogItemFields,
    kind: z.literal("product"),
    openingStockQuantity: exactQuantitySchema.optional(),
    unitConfiguration: z
      .object({
        canonicalBalanceScale: z.coerce.number().int().min(0).max(18),
        units: z
          .array(
            z
              .object({
                factor: exactFactorSchema,
                key: catalogKeySchema,
                name: z.string().trim().min(1).max(80),
                stockBehavior: z.enum([
                  "alternate_transaction",
                  "canonical_shared",
                  "packaged_stock",
                ]),
                symbol: z.string().trim().min(1).max(24).optional(),
                transactionScale: z.coerce.number().int().min(0).max(6),
              })
              .strict(),
          )
          .min(1)
          .max(48),
      })
      .strict(),
    variants: z
      .array(catalogVariantSchema(catalogProductOfferingSchema))
      .min(1)
      .max(96),
  })
  .strict()

export const catalogCreateServiceSchema = z
  .object({
    ...catalogItemFields,
    kind: z.literal("service"),
    variants: z
      .array(
        catalogVariantSchema(
          z.discriminatedUnion("pricingPolicy", [
            catalogFixedOfferingSchema.extend(serviceWorkPolicyFields).strict(),
            catalogQuoteOfferingSchema.extend(serviceWorkPolicyFields).strict(),
          ]),
        ),
      )
      .min(1)
      .max(96),
  })
  .strict()

export const catalogCreateItemSchema = z.discriminatedUnion("kind", [
  catalogCreateProductSchema,
  catalogCreateServiceSchema,
])

const simpleCatalogItemFields = {
  clientOperationId: z.string().trim().min(8).max(160),
  description: z.string().trim().max(2_000).optional(),
  name: z.string().trim().min(1).max(160),
  priceMinor: z.coerce.number().int().min(0).max(100_000_000),
  storeId: z.string().trim().min(1).optional(),
}

export const catalogCreateSimpleProductSchema = z
  .object({
    ...simpleCatalogItemFields,
    canonicalUnitName: z.string().trim().min(1).max(80),
    kind: z.literal("product"),
    openingStockQuantity: exactQuantitySchema.optional(),
  })
  .strict()

export const catalogCreateSimpleServiceSchema = z
  .object({
    ...simpleCatalogItemFields,
    ...serviceWorkPolicyFields,
    kind: z.literal("service"),
  })
  .strict()

export const catalogCreateSimpleItemSchema = z.discriminatedUnion("kind", [
  catalogCreateSimpleProductSchema,
  catalogCreateSimpleServiceSchema,
])

export const catalogGetItemSchema = z
  .object({
    itemId: z.string().trim().min(1),
  })
  .strict()

export const catalogListItemsSchema = z
  .object({
    kind: z.enum(["product", "service"]).optional(),
    status: z.enum(["active", "archived", "draft"]).optional(),
  })
  .strict()

export const catalogArchiveOfferingSchema = z
  .object({ offeringId: z.string().trim().min(1) })
  .strict()

export const catalogArchiveVariantSchema = z
  .object({ variantId: z.string().trim().min(1) })
  .strict()

export const catalogSetOfferingAvailabilitySchema = z
  .object({
    isAvailable: z.boolean(),
    offeringId: z.string().trim().min(1),
    storeId: z.string().trim().min(1),
  })
  .strict()

export const catalogProductUnitConfigurationsSchema = z
  .object({ productId: z.string().trim().min(1) })
  .strict()

export const catalogCreateUnitDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    symbol: z.string().trim().min(1).max(24).optional(),
  })
  .strict()

const catalogConfigurationUnitSchema = z
  .object({
    factor: exactFactorSchema,
    key: catalogKeySchema,
    name: z.string().trim().min(1).max(80),
    stockBehavior: z.enum([
      "alternate_transaction",
      "canonical_shared",
      "packaged_stock",
    ]),
    symbol: z.string().trim().min(1).max(24).optional(),
    transactionScale: z.coerce.number().int().min(0).max(6),
    unitDefinitionId: z.string().trim().min(1).optional(),
  })
  .strict()

export const catalogUpdateUnitConfigurationDraftSchema = z
  .object({
    canonicalBalanceScale: z.coerce.number().int().min(0).max(18),
    configurationId: z.string().trim().min(1),
    units: z.array(catalogConfigurationUnitSchema).min(1).max(48),
  })
  .strict()

export const catalogPublishUnitConfigurationSchema = z
  .object({
    configurationId: z.string().trim().min(1),
    stockTransitionOperationId: z.string().trim().min(1).optional(),
  })
  .strict()
