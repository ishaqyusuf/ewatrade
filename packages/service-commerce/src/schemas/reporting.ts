import { z } from "zod"

import {
  SERVICE_COMMERCE_CHANNEL_ORIGINS,
  SERVICE_COMMERCE_SOURCE_KINDS,
  serviceCommerceChannelOriginSchema,
  serviceCommerceSourceKindSchema,
} from "./source"

const idSchema = z.string().trim().min(1).max(191)
const countSchema = z.number().int().nonnegative()
const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/)
const minorAmountSchema = z.number().int().nonnegative()

/**
 * Reports use occurrence timestamps, not record creation times. Their ranges
 * are always [start, end), which lets adjacent report windows compose without
 * double-counting a lifecycle occurrence at the boundary.
 */
export const SERVICE_COMMERCE_REPORT_MAX_WINDOW_DAYS = 366
export const SERVICE_COMMERCE_REPORT_MAX_WINDOW_MILLISECONDS =
  SERVICE_COMMERCE_REPORT_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1_000
/**
 * Every source query is capped independently. `mayBeTruncated` is returned
 * when a query reaches this cap, so aggregates are never presented as exact
 * when the bounded read may have omitted older rows.
 */
export const SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT = 10_000

/**
 * Pilot thresholds protect remote-Neon reporting without turning an
 * unavailable provider or an oversized query into an unbounded request.
 * Production rollout still requires an owner-reviewed threshold decision.
 */
export const SERVICE_COMMERCE_REPORT_RATE_LIMIT_WINDOW_MILLISECONDS = 60_000
export const SERVICE_COMMERCE_REPORT_RATE_LIMIT_MAX_READS = 30
export const SERVICE_COMMERCE_REPORT_PILOT_CONCURRENT_READS = 4
export const SERVICE_COMMERCE_REPORT_PILOT_P95_TARGET_MILLISECONDS = 15_000
export const SERVICE_COMMERCE_REPORT_PILOT_MAX_TARGET_MILLISECONDS = 30_000

export const SERVICE_COMMERCE_REPORT_DRILLDOWN_SECTIONS = [
  "lifecycle",
  "catalog",
  "reliability",
  "media",
  "costs",
] as const

/** These aliases make the allowlisted reporting dimensions explicit. */
export const SERVICE_COMMERCE_REPORT_SOURCES = SERVICE_COMMERCE_SOURCE_KINDS
export const SERVICE_COMMERCE_REPORT_CHANNELS = SERVICE_COMMERCE_CHANNEL_ORIGINS

export const SERVICE_COMMERCE_COST_KINDS = [
  "meta_delivered_message",
  "bsp_or_twilio_markup",
  "number",
  "payment_provider_fee",
  "delivery",
  "tax",
  "revenue",
  "ewatrade_subscription",
  "ewatrade_usage",
] as const

export const SERVICE_COMMERCE_REDACTED_OBSERVABILITY_KINDS = [
  "routing",
  "readiness",
  "provider_attempt",
  "job_recovery",
] as const

export const SERVICE_COMMERCE_REDACTED_OBSERVABILITY_OUTCOMES = [
  "available",
  "blocked",
  "failed",
  "recovered",
  "retryable",
] as const

export const serviceCommerceReportDrilldownSectionSchema = z.enum(
  SERVICE_COMMERCE_REPORT_DRILLDOWN_SECTIONS,
)
export const serviceCommerceCostKindSchema = z.enum(SERVICE_COMMERCE_COST_KINDS)
export const serviceCommerceRedactedObservabilityKindSchema = z.enum(
  SERVICE_COMMERCE_REDACTED_OBSERVABILITY_KINDS,
)
export const serviceCommerceRedactedObservabilityOutcomeSchema = z.enum(
  SERVICE_COMMERCE_REDACTED_OBSERVABILITY_OUTCOMES,
)

export const serviceCommerceReportInputSchema = z
  .object({
    drilldown: serviceCommerceReportDrilldownSectionSchema.optional(),
    end: z.coerce.date(),
    start: z.coerce.date(),
    storeId: idSchema.optional(),
    tenantId: idSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.end <= value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report end must be after report start.",
        path: ["end"],
      })
    }
    if (
      value.end.getTime() - value.start.getTime() >
      SERVICE_COMMERCE_REPORT_MAX_WINDOW_MILLISECONDS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Report windows cannot exceed ${SERVICE_COMMERCE_REPORT_MAX_WINDOW_DAYS} days.`,
        path: ["end"],
      })
    }
  })

export const serviceCommerceReportScopeSchema = z
  .object({
    end: z.coerce.date(),
    start: z.coerce.date(),
    storeId: idSchema.nullable(),
    tenantId: idSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.end <= value.start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report end must be after report start.",
        path: ["end"],
      })
    }
    if (
      value.end.getTime() - value.start.getTime() >
      SERVICE_COMMERCE_REPORT_MAX_WINDOW_MILLISECONDS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Report windows cannot exceed ${SERVICE_COMMERCE_REPORT_MAX_WINDOW_DAYS} days.`,
        path: ["end"],
      })
    }
  })

const serviceCommerceReportSourceCountSchema = z
  .object({
    count: countSchema,
    source: serviceCommerceSourceKindSchema,
  })
  .strict()

const serviceCommerceReportChannelCountSchema = z
  .object({
    channel: serviceCommerceChannelOriginSchema,
    count: countSchema,
  })
  .strict()

export const serviceCommerceLifecycleReportSchema = z
  .object({
    bookingsConfirmed: countSchema,
    bookingsCompleted: countSchema,
    byChannel: z.array(serviceCommerceReportChannelCountSchema),
    bySource: z.array(serviceCommerceReportSourceCountSchema),
    deliveriesCompleted: countSchema,
    paymentsSucceeded: countSchema,
    paymentValueMinor: minorAmountSchema,
    pickupsCompleted: countSchema,
    quotesAccepted: countSchema,
    quotesIssued: countSchema,
    requestsReceived: countSchema,
    serviceCompletions: countSchema,
  })
  .strict()

export const serviceCommerceCatalogReportSchema = z
  .object({
    demandResolved: countSchema,
    draftsCreated: countSchema,
    existingOfferingsMatched: countSchema,
    managedInventoryGraduations: countSchema,
    procureToOrderCommitments: countSchema,
    quoteOverrides: countSchema,
    quoteOverrideUnknown: countSchema,
    resolutionUnknown: countSchema,
    reusablePricePromotions: countSchema,
  })
  .strict()

export const serviceCommerceReliabilityReportSchema = z
  .object({
    jobRecoveries: countSchema,
    jobRecoveryAttempts: countSchema,
    providerAttempts: countSchema,
    providerFailures: countSchema,
    providerRetries: countSchema,
    staleCapabilityRejections: countSchema,
  })
  .strict()

export const serviceCommerceMediaReportSchema = z
  .object({
    attachmentsActive: countSchema,
    attachmentsRejected: countSchema,
    attachmentsRetryable: countSchema,
    attachmentsSafe: countSchema,
    attachmentsQuarantined: countSchema,
    observationsConverted: countSchema,
    observationsCurrent: countSchema,
  })
  .strict()

/**
 * Unknown provider amounts are explicit nulls. A recorded zero remains known
 * and is therefore distinguishable from an unavailable provider amount.
 */
export const serviceCommerceCostObservationSchema = z
  .object({
    amountMinor: minorAmountSchema.nullable(),
    costKind: serviceCommerceCostKindSchema,
    currencyCode: currencyCodeSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.amountMinor !== null && value.currencyCode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known cost amounts require a currency code.",
        path: ["currencyCode"],
      })
    }
  })

export const serviceCommerceCostSummarySchema = z
  .object({
    costKind: serviceCommerceCostKindSchema,
    currencyCode: currencyCodeSchema.nullable(),
    knownCount: countSchema,
    knownTotalMinor: minorAmountSchema.nullable(),
    unknownCount: countSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.knownCount === 0 && value.knownTotalMinor !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A cost summary without known values cannot expose a total.",
        path: ["knownTotalMinor"],
      })
    }
    if (value.knownCount > 0 && value.knownTotalMinor === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known cost values require an aggregate total.",
        path: ["knownTotalMinor"],
      })
    }
    if (value.knownCount > 0 && value.currencyCode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known cost values require a currency code.",
        path: ["currencyCode"],
      })
    }
  })

/**
 * Usage/cost dimensions remain aggregate-only: no provider operation id,
 * recipient, message text, credentials, or customer source can cross this
 * boundary.
 */
export const serviceCommerceUsageCostDimensionSchema = z
  .object({
    billingOwner: z.string().trim().min(1).max(191).nullable(),
    connectionId: idSchema.nullable(),
    costs: z.array(serviceCommerceCostSummarySchema),
    messageCategory: z.string().trim().min(1).max(191).nullable(),
    recipientMarket: z.string().trim().min(1).max(32).nullable(),
  })
  .strict()

/**
 * Deliberately aggregate-only. It cannot carry customer content, credentials,
 * bearer capabilities, provider operation ids, object keys, or raw errors.
 */
export const serviceCommerceRedactedObservabilitySchema = z
  .object({
    count: countSchema,
    kind: serviceCommerceRedactedObservabilityKindSchema,
    outcome: serviceCommerceRedactedObservabilityOutcomeSchema,
  })
  .strict()

export const serviceCommerceReportDrilldownOutputSchema = z
  .object({
    category: serviceCommerceReportDrilldownSectionSchema,
    mayBeTruncated: z.boolean(),
    rows: z.array(
      z
        .object({
          billingOwner: z.string().trim().min(1).max(191).nullable(),
          category: z.string().trim().min(1).max(191),
          connectionId: idSchema.nullable(),
          count: countSchema,
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          messageCategory: z.string().trim().min(1).max(191).nullable(),
          outcome: z.string().trim().min(1).max(191),
          recipientMarket: z.string().trim().min(1).max(32).nullable(),
        })
        .strict(),
    ),
    scope: z
      .object({
        end: z.coerce.date(),
        start: z.coerce.date(),
        storeId: idSchema.nullable(),
      })
      .strict(),
  })
  .strict()

export const serviceCommerceReportOutputSchema = z
  .object({
    catalog: serviceCommerceCatalogReportSchema,
    costs: z.array(serviceCommerceCostSummarySchema),
    currencyCode: currencyCodeSchema,
    lifecycle: serviceCommerceLifecycleReportSchema,
    media: serviceCommerceMediaReportSchema,
    observability: z.array(serviceCommerceRedactedObservabilitySchema),
    mayBeTruncated: z.boolean(),
    reliability: serviceCommerceReliabilityReportSchema,
    scope: serviceCommerceReportScopeSchema,
    storeBreakdown: z.array(
      z
        .object({
          completions: countSchema,
          name: z.string().trim().min(1).max(191),
          paymentsSucceeded: countSchema,
          quotesIssued: countSchema,
          requestsReceived: countSchema,
          storeId: idSchema,
        })
        .strict(),
    ),
    timezone: z.string().trim().min(1).max(100),
    usageCostsByDimension: z.array(serviceCommerceUsageCostDimensionSchema),
  })
  .strict()

export type ServiceCommerceCatalogReport = z.infer<
  typeof serviceCommerceCatalogReportSchema
>
export type ServiceCommerceCostKind = z.infer<
  typeof serviceCommerceCostKindSchema
>
export type ServiceCommerceCostObservation = z.infer<
  typeof serviceCommerceCostObservationSchema
>
export type ServiceCommerceCostSummary = z.infer<
  typeof serviceCommerceCostSummarySchema
>
export type ServiceCommerceLifecycleReport = z.infer<
  typeof serviceCommerceLifecycleReportSchema
>
export type ServiceCommerceMediaReport = z.infer<
  typeof serviceCommerceMediaReportSchema
>
export type ServiceCommerceRedactedObservability = z.infer<
  typeof serviceCommerceRedactedObservabilitySchema
>
export type ServiceCommerceReliabilityReport = z.infer<
  typeof serviceCommerceReliabilityReportSchema
>
export type ServiceCommerceUsageCostDimension = z.infer<
  typeof serviceCommerceUsageCostDimensionSchema
>
export type ServiceCommerceReportDrilldownSection = z.infer<
  typeof serviceCommerceReportDrilldownSectionSchema
>
export type ServiceCommerceReportInput = z.infer<
  typeof serviceCommerceReportInputSchema
>
export type ServiceCommerceReportDrilldownOutput = z.infer<
  typeof serviceCommerceReportDrilldownOutputSchema
>
export type ServiceCommerceReportOutput = z.infer<
  typeof serviceCommerceReportOutputSchema
>
export type ServiceCommerceReportScope = z.infer<
  typeof serviceCommerceReportScopeSchema
>
