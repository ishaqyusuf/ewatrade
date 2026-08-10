import { z } from "zod"

import {
  serviceCommerceChannelOriginSchema,
  serviceCommerceSourceRefSchema,
} from "./source"

const serviceCommerceMediaIdSchema = z.string().trim().min(1).max(191)

export const SERVICE_COMMERCE_MEDIA_KINDS = ["image", "document"] as const

export const SERVICE_COMMERCE_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const

export const SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES = 10_000_000
export const SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENTS_PER_INTAKE = 12
export const SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS = 365

export const SERVICE_COMMERCE_MEDIA_ASSET_LIFECYCLES = [
  "pending_upload",
  "pending_retrieval",
  "stored",
  "safety_pending",
  "safe",
  "quarantined",
  "rejected",
  "retryable",
  "retention_hold",
  "deleted",
] as const

export const SERVICE_COMMERCE_PRIVATE_MEDIA_SAFETY_LIFECYCLES = [
  "safe",
  "quarantined",
  "rejected",
  "retryable",
] as const

export const SERVICE_COMMERCE_SOURCE_ATTACHMENT_LIFECYCLES = [
  "active",
  "replaced",
  "removed",
] as const

export const SERVICE_COMMERCE_OBSERVATION_LIFECYCLES = [
  "current",
  "superseded",
  "withdrawn",
] as const

export const SERVICE_COMMERCE_MEDIA_RETENTION_CLASSES = [
  "baseline",
  "vertical_extension",
] as const

export const SERVICE_COMMERCE_MEDIA_INGESTION_IDENTITIES = [
  "client",
  "provider",
] as const

export const SERVICE_COMMERCE_MEDIA_INTAKE_BLOCKERS = [
  "attachments_disabled",
  "channel_unavailable",
  "policy_restricted",
  "private_media_provider_unavailable",
  "attachment_limit_exceeded",
  "attachment_too_large",
  "unsupported_mime_type",
  "signature_mime_mismatch",
] as const

export const SERVICE_COMMERCE_MEDIA_VIEWER_GRANT_STATES = [
  "available",
  "access_denied",
  "attachment_inactive",
  "asset_not_safe",
  "expired",
] as const

export const SERVICE_COMMERCE_OBSERVATION_VALIDATION_STATUSES = [
  "valid",
  "asset_not_safe",
  "attachment_inactive",
  "stale_source",
  "observation_inactive",
] as const

export const SERVICE_COMMERCE_OBSERVATION_REVISION_VALIDATION_STATUSES = [
  "valid",
  "stale_observation",
] as const

export const serviceCommerceMediaKindSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_KINDS,
)
export const serviceCommerceMediaMimeTypeSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_MIME_TYPES,
)
export const serviceCommerceMediaAssetLifecycleSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_ASSET_LIFECYCLES,
)
export const serviceCommercePrivateMediaSafetyLifecycleSchema = z.enum(
  SERVICE_COMMERCE_PRIVATE_MEDIA_SAFETY_LIFECYCLES,
)
export const serviceCommerceSourceAttachmentLifecycleSchema = z.enum(
  SERVICE_COMMERCE_SOURCE_ATTACHMENT_LIFECYCLES,
)
export const serviceCommerceObservationLifecycleSchema = z.enum(
  SERVICE_COMMERCE_OBSERVATION_LIFECYCLES,
)
export const serviceCommerceMediaRetentionClassSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_RETENTION_CLASSES,
)
export const serviceCommerceMediaIngestionIdentitySchema = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(SERVICE_COMMERCE_MEDIA_INGESTION_IDENTITIES),
  })
  .strict()
export const serviceCommerceMediaIntakeBlockerSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_INTAKE_BLOCKERS,
)
export const serviceCommerceMediaViewerGrantStateSchema = z.enum(
  SERVICE_COMMERCE_MEDIA_VIEWER_GRANT_STATES,
)
export const serviceCommerceObservationValidationStatusSchema = z.enum(
  SERVICE_COMMERCE_OBSERVATION_VALIDATION_STATUSES,
)
export const serviceCommerceObservationRevisionValidationStatusSchema = z.enum(
  SERVICE_COMMERCE_OBSERVATION_REVISION_VALIDATION_STATUSES,
)

export const serviceCommerceMediaAssetSchema = z
  .object({
    byteSize: z
      .number()
      .int()
      .positive()
      .max(SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.coerce.date(),
    createdByUserId: serviceCommerceMediaIdSchema.nullable(),
    fileName: z.string().trim().min(1).max(255),
    id: serviceCommerceMediaIdSchema,
    ingestionIdentity: serviceCommerceMediaIngestionIdentitySchema,
    kind: serviceCommerceMediaKindSchema,
    lifecycle: serviceCommerceMediaAssetLifecycleSchema,
    mimeType: serviceCommerceMediaMimeTypeSchema,
    origin: serviceCommerceChannelOriginSchema,
    retentionClass: serviceCommerceMediaRetentionClassSchema,
    retentionDueAt: z.coerce.date().nullable(),
    retrievalAttempts: z.number().int().nonnegative(),
    storageReference: serviceCommerceMediaIdSchema,
    storeId: serviceCommerceMediaIdSchema,
    tenantId: serviceCommerceMediaIdSchema,
  })
  .strict()

export const serviceCommerceSourceAttachmentSchema = z
  .object({
    attachedAt: z.coerce.date(),
    attachedByUserId: serviceCommerceMediaIdSchema.nullable(),
    id: serviceCommerceMediaIdSchema,
    lifecycle: serviceCommerceSourceAttachmentLifecycleSchema,
    mediaAssetId: serviceCommerceMediaIdSchema,
    source: serviceCommerceSourceRefSchema,
    sourceVersion: serviceCommerceMediaIdSchema,
    storeId: serviceCommerceMediaIdSchema,
    tenantId: serviceCommerceMediaIdSchema,
  })
  .strict()

export const serviceCommerceHumanVerifiedObservationAttributeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(240),
  })
  .strict()

export const serviceCommerceHumanVerifiedObservationDraftSchema = z
  .object({
    attributes: z
      .array(serviceCommerceHumanVerifiedObservationAttributeSchema)
      .max(12)
      .superRefine((attributes, ctx) => {
        const normalizedNames = attributes.map((attribute) =>
          attribute.name.toLocaleLowerCase(),
        )
        if (new Set(normalizedNames).size !== normalizedNames.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Observation attributes must use unique names.",
          })
        }
      }),
    displayLabel: z.string().trim().min(1).max(500),
  })
  .strict()

export const serviceCommerceHumanVerifiedObservationSchema = z
  .object({
    attachmentId: serviceCommerceMediaIdSchema,
    attributes:
      serviceCommerceHumanVerifiedObservationDraftSchema.shape.attributes,
    displayLabel:
      serviceCommerceHumanVerifiedObservationDraftSchema.shape.displayLabel,
    id: serviceCommerceMediaIdSchema,
    lifecycle: serviceCommerceObservationLifecycleSchema,
    revision: z.number().int().positive(),
    sourceLineId: serviceCommerceMediaIdSchema.nullable().optional(),
    sourceVersion: serviceCommerceMediaIdSchema,
    verifiedAt: z.coerce.date(),
    verifiedByUserId: serviceCommerceMediaIdSchema,
  })
  .strict()

export type ServiceCommerceHumanVerifiedObservation = z.infer<
  typeof serviceCommerceHumanVerifiedObservationSchema
>
export type ServiceCommerceHumanVerifiedObservationDraft = z.infer<
  typeof serviceCommerceHumanVerifiedObservationDraftSchema
>
export type ServiceCommerceMediaAsset = z.infer<
  typeof serviceCommerceMediaAssetSchema
>
export type ServiceCommerceMediaAssetLifecycle = z.infer<
  typeof serviceCommerceMediaAssetLifecycleSchema
>
export type ServiceCommercePrivateMediaSafetyLifecycle = z.infer<
  typeof serviceCommercePrivateMediaSafetyLifecycleSchema
>
export type ServiceCommerceMediaIntakeBlocker = z.infer<
  typeof serviceCommerceMediaIntakeBlockerSchema
>
export type ServiceCommerceMediaIngestionIdentity = z.infer<
  typeof serviceCommerceMediaIngestionIdentitySchema
>
export type ServiceCommerceMediaKind = z.infer<
  typeof serviceCommerceMediaKindSchema
>
export type ServiceCommerceMediaMimeType = z.infer<
  typeof serviceCommerceMediaMimeTypeSchema
>
export type ServiceCommerceMediaViewerGrantState = z.infer<
  typeof serviceCommerceMediaViewerGrantStateSchema
>
export type ServiceCommerceObservationLifecycle = z.infer<
  typeof serviceCommerceObservationLifecycleSchema
>
export type ServiceCommerceObservationValidationStatus = z.infer<
  typeof serviceCommerceObservationValidationStatusSchema
>
export type ServiceCommerceObservationRevisionValidationStatus = z.infer<
  typeof serviceCommerceObservationRevisionValidationStatusSchema
>
export type ServiceCommerceSourceAttachment = z.infer<
  typeof serviceCommerceSourceAttachmentSchema
>
export type ServiceCommerceSourceAttachmentLifecycle = z.infer<
  typeof serviceCommerceSourceAttachmentLifecycleSchema
>
