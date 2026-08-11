import { z } from "zod"

import {
  serviceCommercePolicyOutcomeSchema,
  serviceCommercePolicySubjectSchema,
} from "./policy"
import { serviceCommerceCatalogAdoptionModeSchema } from "./profile"
import { serviceCommerceSourceRefSchema } from "./source"

const idSchema = z.string().trim().min(1).max(191)
const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/)
const moneyMinorSchema = z.number().int().min(0)

export const SERVICE_COMMERCE_CATALOG_DRAFT_KINDS = [
  "product",
  "service",
] as const

export const SERVICE_COMMERCE_CATALOG_MATCH_KINDS = [
  "existing",
  "draft",
] as const

export const SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SOURCES = [
  "current_offering",
  "accepted_quote",
  "completed_sale",
  "unknown",
] as const

export const SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SCOPES = [
  "offering",
  "store",
  "tenant",
  "unknown",
] as const

export const SERVICE_COMMERCE_CATALOG_AVAILABILITY_OUTCOMES = [
  "tracked_in_stock",
  "manual_procure_to_order",
  "unavailable",
] as const

export const SERVICE_COMMERCE_CATALOG_AVAILABILITY_VALIDATION_STATUSES = [
  "valid",
  "stale_source",
  "expired",
  "unavailable",
] as const

export const SERVICE_COMMERCE_CATALOG_GRADUATION_MISSING_FACTS = [
  "category",
  "variant",
  "reusable_price",
  "product_unit",
  "product_identifier",
  "opening_count",
  "service_duration",
  "service_work_policy",
  "service_booking_policy",
] as const

export const SERVICE_COMMERCE_SERVICE_BOOKING_POLICIES = [
  "not_bookable",
  "request_required",
  "booking_required",
] as const

export const serviceCommerceCatalogDraftKindSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_DRAFT_KINDS,
)
export const serviceCommerceCatalogMatchKindSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_MATCH_KINDS,
)
export const serviceCommerceCatalogPriceSuggestionSourceSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SOURCES,
)
export const serviceCommerceCatalogPriceSuggestionScopeSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_PRICE_SUGGESTION_SCOPES,
)
export const serviceCommerceCatalogAvailabilityOutcomeSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_AVAILABILITY_OUTCOMES,
)
export const serviceCommerceCatalogAvailabilityValidationStatusSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_AVAILABILITY_VALIDATION_STATUSES,
)
export const serviceCommerceCatalogGraduationMissingFactSchema = z.enum(
  SERVICE_COMMERCE_CATALOG_GRADUATION_MISSING_FACTS,
)
export const serviceCommerceServiceBookingPolicySchema = z.enum(
  SERVICE_COMMERCE_SERVICE_BOOKING_POLICIES,
)

export const serviceCommerceCatalogGraduationReadinessInputSchema = z
  .object({
    category: z.string().trim().nullable(),
    currencyMatchesStore: z.boolean(),
    draftKind: serviceCommerceCatalogDraftKindSchema,
    fixedPriceMinor: moneyMinorSchema.nullable(),
    hasProductIdentifier: z.boolean(),
    hasProductUnit: z.boolean(),
    hasVerifiedOpeningCount: z.boolean(),
    serviceBookingPolicy: serviceCommerceServiceBookingPolicySchema.nullable(),
    serviceDurationMinutes: z.number().int().positive().nullable(),
    serviceWorkPolicy: z.enum(["charge_only", "tracked"]).nullable(),
    variantName: z.string().trim().nullable(),
  })
  .strict()

export const serviceCommerceCatalogGraduationReadinessSchema = z
  .object({
    canGraduate: z.boolean(),
    missingFacts: z.array(serviceCommerceCatalogGraduationMissingFactSchema),
  })
  .strict()

const catalogGraduationCommandBaseSchema = z
  .object({
    clientOperationId: idSchema,
    confirmed: z.literal(true),
    currencyCode: currencyCodeSchema,
    expectedOfferingRevision: z.number().int().min(0),
    fixedPriceMinor: moneyMinorSchema,
    offeringId: idSchema,
    reason: z.string().trim().min(3).max(240),
    storeId: idSchema.optional(),
  })
  .strict()

export const serviceCommerceProductGraduationFormSchema =
  catalogGraduationCommandBaseSchema
    .extend({
      barcode: z.string().trim().max(191).optional(),
      canonicalUnitName: z.string().trim().min(1).max(191),
      canonicalUnitSymbol: z.string().trim().max(32).optional(),
      category: z.string().trim().min(1).max(191),
      draftKind: z.literal("product"),
      openingStockQuantity: z
        .string()
        .trim()
        .regex(/^\d+(?:\.\d+)?$/),
      sku: z.string().trim().max(191).optional(),
      transactionScale: z.number().int().min(0).max(6),
      variantName: z.string().trim().min(1).max(191),
    })
    .strict()
    .superRefine((input, context) => {
      if (!input.sku && !input.barcode) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A SKU or barcode is required for managed inventory.",
          path: ["sku"],
        })
      }
      const fraction = input.openingStockQuantity.split(".")[1] ?? ""
      if (fraction.replace(/0+$/, "").length > input.transactionScale) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Opening stock exceeds the unit precision of ${input.transactionScale}.`,
          path: ["openingStockQuantity"],
        })
      }
    })

export const serviceCommerceServiceGraduationFormSchema =
  catalogGraduationCommandBaseSchema
    .extend({
      authorizationPolicy: z.enum([
        "on_order_confirmation",
        "after_required_payment",
        "manual_release",
      ]),
      bookingPolicy: serviceCommerceServiceBookingPolicySchema,
      category: z.string().trim().min(1).max(191),
      draftKind: z.literal("service"),
      durationMinutes: z.number().int().positive().max(43_200),
      guidance: z.string().trim().max(1000).optional(),
      variantName: z.string().trim().min(1).max(191),
      workPolicy: z.enum(["charge_only", "tracked"]),
    })
    .strict()

export const serviceCommerceCatalogGraduationFormSchema = z.discriminatedUnion(
  "draftKind",
  [
    serviceCommerceProductGraduationFormSchema,
    serviceCommerceServiceGraduationFormSchema,
  ],
)

export const serviceCommerceCatalogPublicationFormSchema = z
  .object({
    clientOperationId: idSchema,
    confirmed: z.literal(true),
    expectedOfferingRevision: z.number().int().min(0),
    offeringId: idSchema,
    reason: z.string().trim().min(3).max(240),
    storeId: idSchema.optional(),
  })
  .strict()

/**
 * A server-owned projection used by repositories and API handlers before a
 * Catalog adoption command. Clients render it but never derive authorization.
 */
export const serviceCommerceCatalogAdoptionGateSchema = z
  .object({
    adoptionMode: serviceCommerceCatalogAdoptionModeSchema,
    policyOutcome: serviceCommercePolicyOutcomeSchema,
    policySubject: serviceCommercePolicySubjectSchema,
  })
  .strict()

export const serviceCommerceCatalogSourceEvidenceSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        capturedAt: z.coerce.date(),
        kind: z.literal("source_snapshot"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("human_verified"),
        verifiedAt: z.coerce.date(),
        verifiedByUserId: idSchema,
      })
      .strict(),
  ],
)

/**
 * A source-line reference contains versioned provenance without raw content.
 * Generic request wording is an unverified source snapshot that may assist
 * matching; only a vertical review or future Human-Verified Observation may
 * use the human-verified evidence variant.
 */
export const serviceCommerceCatalogSourceLineRefSchema = z
  .object({
    evidence: serviceCommerceCatalogSourceEvidenceSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    id: idSchema,
    source: serviceCommerceSourceRefSchema,
    sourceVersion: z.string().trim().min(1).max(191),
  })
  .strict()

export const serviceCommerceVerifiedCatalogAliasSchema = z
  .object({
    alias: z.string().trim().min(1).max(500),
    offeringId: idSchema,
    sourceLine: serviceCommerceCatalogSourceLineRefSchema,
    storeId: idSchema,
    tenantId: idSchema,
    verifiedAt: z.coerce.date(),
    verifiedByUserId: idSchema,
  })
  .strict()

export const serviceCommerceCatalogMatchProjectionSchema = z
  .object({
    catalogItemId: idSchema,
    catalogItemName: z.string().trim().min(1).max(191),
    currencyCode: currencyCodeSchema,
    draftKind: serviceCommerceCatalogDraftKindSchema,
    fixedPriceMinor: moneyMinorSchema.nullable(),
    isPrivateDraft: z.boolean(),
    kind: serviceCommerceCatalogMatchKindSchema,
    offeringId: idSchema,
    offeringName: z.string().trim().min(1).max(191),
    score: z.number().min(0).max(1),
    variantId: idSchema,
    variantName: z.string().trim().min(1).max(191),
  })
  .strict()

const priceEvidenceBaseSchema = z
  .object({
    currencyCode: currencyCodeSchema,
    effectiveAt: z.coerce.date(),
    evidenceId: idSchema,
    offeringId: idSchema,
    priceMinor: moneyMinorSchema,
    storeId: idSchema.nullable(),
    tenantId: idSchema,
  })
  .strict()

export const serviceCommerceCatalogPriceEvidenceSchema = z.discriminatedUnion(
  "scope",
  [
    priceEvidenceBaseSchema.extend({
      scope: z.literal("offering"),
      source: z.literal("current_offering"),
      storeId: z.null(),
    }),
    priceEvidenceBaseSchema.extend({
      scope: z.literal("store"),
      source: z.enum(["accepted_quote", "completed_sale"]),
      storeId: idSchema,
    }),
    priceEvidenceBaseSchema.extend({
      authorizedTenantHistory: z.boolean(),
      scope: z.literal("tenant"),
      source: z.enum(["accepted_quote", "completed_sale"]),
      storeId: idSchema.nullable(),
    }),
  ],
)

export const serviceCommerceCatalogPriceSuggestionSchema = z.discriminatedUnion(
  "source",
  [
    z
      .object({
        currencyCode: currencyCodeSchema,
        effectiveAt: z.coerce.date(),
        priceMinor: moneyMinorSchema,
        scope: z.enum(["offering", "store", "tenant"]),
        source: z.enum([
          "current_offering",
          "accepted_quote",
          "completed_sale",
        ]),
      })
      .strict(),
    z
      .object({
        currencyCode: currencyCodeSchema.nullable(),
        effectiveAt: z.null(),
        priceMinor: z.null(),
        scope: z.literal("unknown"),
        source: z.literal("unknown"),
      })
      .strict(),
  ],
)

const catalogOperationBaseSchema = z
  .object({
    actorId: idSchema,
    sourceLine: serviceCommerceCatalogSourceLineRefSchema,
    storeId: idSchema,
    tenantId: idSchema,
  })
  .strict()

export const serviceCommerceCreateCatalogDraftInputSchema =
  catalogOperationBaseSchema
    .extend({
      draftKind: serviceCommerceCatalogDraftKindSchema,
      name: z.string().trim().min(1).max(191),
    })
    .strict()

export const serviceCommerceCatalogDraftFormSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
    verifiedAlias: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceCommerceCatalogPricePromotionFormSchema = z
  .object({
    confirmed: z.boolean().refine(Boolean, {
      message: "Confirm the affected Store scope before promotion.",
    }),
    reason: z.string().trim().min(3).max(240),
  })
  .strict()

export const serviceCommerceLinkCatalogOfferingInputSchema =
  catalogOperationBaseSchema
    .extend({
      offeringId: idSchema,
      verifiedAlias: z.string().trim().min(1).max(500),
    })
    .strict()

export const serviceCommerceQuotePriceInputSchema = catalogOperationBaseSchema
  .extend({
    currencyCode: currencyCodeSchema,
    priceMinor: moneyMinorSchema,
    quoteVersionId: idSchema,
    selectedSuggestion: serviceCommerceCatalogPriceSuggestionSchema.nullable(),
  })
  .strict()

export const serviceCommercePromoteCatalogPriceInputSchema = z
  .object({
    actorId: idSchema,
    affectedStoreIds: z.array(idSchema).min(1),
    confirmation: z.object({ confirmedAt: z.coerce.date() }).strict(),
    currencyCode: currencyCodeSchema,
    newPriceMinor: moneyMinorSchema,
    offeringId: idSchema,
    previousPriceMinor: moneyMinorSchema.nullable(),
    reason: z.string().trim().min(3).max(240),
    sourceLine: serviceCommerceCatalogSourceLineRefSchema,
    tenantId: idSchema,
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

export const serviceCommerceCatalogAvailabilityAttestationSchema =
  z.discriminatedUnion("availability", [
    z
      .object({
        attestedAt: z.coerce.date(),
        availability: z.literal("tracked_in_stock"),
        balanceRevision: z.number().int().min(0),
        balanceSourceId: idSchema,
        expiresAt: z.null(),
        quantity: z.string().regex(/^\d+(?:\.\d+)?$/),
        sourceLine: serviceCommerceCatalogSourceLineRefSchema,
      })
      .strict(),
    z
      .object({
        attestedAt: z.coerce.date(),
        availability: z.literal("manual_procure_to_order"),
        expiresAt: z.coerce.date(),
        quantity: z.string().regex(/^\d+(?:\.\d+)?$/),
        sourceLine: serviceCommerceCatalogSourceLineRefSchema,
      })
      .strict()
      .refine((input) => input.expiresAt > input.attestedAt, {
        message: "Manual availability must expire after attestation.",
        path: ["expiresAt"],
      }),
    z
      .object({
        attestedAt: z.coerce.date(),
        availability: z.literal("unavailable"),
        expiresAt: z.null(),
        sourceLine: serviceCommerceCatalogSourceLineRefSchema,
      })
      .strict(),
  ])

export type ServiceCommerceCatalogAvailabilityAttestation = z.infer<
  typeof serviceCommerceCatalogAvailabilityAttestationSchema
>
export type ServiceCommerceCatalogAvailabilityOutcome = z.infer<
  typeof serviceCommerceCatalogAvailabilityOutcomeSchema
>
export type ServiceCommerceCatalogAvailabilityValidationStatus = z.infer<
  typeof serviceCommerceCatalogAvailabilityValidationStatusSchema
>
export type ServiceCommerceCatalogAdoptionGate = z.infer<
  typeof serviceCommerceCatalogAdoptionGateSchema
>
export type ServiceCommerceCatalogDraftKind = z.infer<
  typeof serviceCommerceCatalogDraftKindSchema
>
export type ServiceCommerceCatalogDraftFormValues = z.infer<
  typeof serviceCommerceCatalogDraftFormSchema
>
export type ServiceCommerceCatalogGraduationFormValues = z.infer<
  typeof serviceCommerceCatalogGraduationFormSchema
>
export type ServiceCommerceCatalogGraduationReadiness = z.infer<
  typeof serviceCommerceCatalogGraduationReadinessSchema
>
export type ServiceCommerceCatalogGraduationReadinessInput = z.infer<
  typeof serviceCommerceCatalogGraduationReadinessInputSchema
>
export type ServiceCommerceCatalogPublicationFormValues = z.infer<
  typeof serviceCommerceCatalogPublicationFormSchema
>
export type ServiceCommerceCatalogMatchKind = z.infer<
  typeof serviceCommerceCatalogMatchKindSchema
>
export type ServiceCommerceCatalogMatchProjection = z.infer<
  typeof serviceCommerceCatalogMatchProjectionSchema
>
export type ServiceCommerceCatalogPriceEvidence = z.infer<
  typeof serviceCommerceCatalogPriceEvidenceSchema
>
export type ServiceCommerceCatalogPricePromotionFormValues = z.infer<
  typeof serviceCommerceCatalogPricePromotionFormSchema
>
export type ServiceCommerceCatalogPriceSuggestion = z.infer<
  typeof serviceCommerceCatalogPriceSuggestionSchema
>
export type ServiceCommerceCatalogPriceSuggestionScope = z.infer<
  typeof serviceCommerceCatalogPriceSuggestionScopeSchema
>
export type ServiceCommerceCatalogPriceSuggestionSource = z.infer<
  typeof serviceCommerceCatalogPriceSuggestionSourceSchema
>
export type ServiceCommerceCatalogSourceLineRef = z.infer<
  typeof serviceCommerceCatalogSourceLineRefSchema
>
export type ServiceCommerceCreateCatalogDraftInput = z.infer<
  typeof serviceCommerceCreateCatalogDraftInputSchema
>
export type ServiceCommerceLinkCatalogOfferingInput = z.infer<
  typeof serviceCommerceLinkCatalogOfferingInputSchema
>
export type ServiceCommercePromoteCatalogPriceInput = z.infer<
  typeof serviceCommercePromoteCatalogPriceInputSchema
>
export type ServiceCommerceQuotePriceInput = z.infer<
  typeof serviceCommerceQuotePriceInputSchema
>
export type ServiceCommerceVerifiedCatalogAlias = z.infer<
  typeof serviceCommerceVerifiedCatalogAliasSchema
>
