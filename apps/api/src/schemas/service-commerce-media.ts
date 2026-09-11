import {
  serviceCommerceChannelOriginSchema,
  serviceCommerceHumanVerifiedObservationDraftSchema,
  serviceCommerceMediaKindSchema,
  serviceCommerceMediaMimeTypeSchema,
  serviceCommercePrivateMediaSafetyLifecycleSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const storeIdSchema = idSchema
const reasonSchema = z.string().trim().min(3).max(240)

const sourceAttachmentSchema = z
  .object({
    source: serviceCommerceSourceRefSchema,
    sourceLineId: idSchema,
    sourceVersion: idSchema,
  })
  .strict()

/**
 * This is a transport-neutral declaration only. An authenticated multipart
 * endpoint must verify the bytes before it can turn this intent into a media
 * reference; it is deliberately not a browser tRPC upload command.
 */
export const serviceCommerceMediaUploadIntentSchema = sourceAttachmentSchema
  .extend({
    clientMediaId: idSchema,
    fileName: z.string().trim().min(1).max(255),
    kind: serviceCommerceMediaKindSchema.exclude(["audio"]),
    mimeType: serviceCommerceMediaMimeTypeSchema.exclude([
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "audio/webm",
    ]),
    sizeBytes: z.number().int().positive().max(10_000_000),
    storeId: storeIdSchema,
  })
  .strict()

export const serviceCommerceMediaInternalReferenceSchema =
  serviceCommerceMediaUploadIntentSchema
    .extend({
      channel: serviceCommerceChannelOriginSchema,
      provider: z.string().trim().min(1).max(100).optional(),
      providerMediaId: idSchema.optional(),
      retentionUntil: z.coerce.date(),
      signatureMimeType: serviceCommerceMediaMimeTypeSchema,
      tenantId: idSchema,
    })
    .strict()

export const serviceCommerceMediaAttachmentSchema = z
  .object({ attachmentId: idSchema, storeId: storeIdSchema })
  .strict()

export const serviceCommerceMediaViewerGrantSchema =
  serviceCommerceMediaAttachmentSchema.extend({ reason: reasonSchema }).strict()

export const serviceCommerceMediaObservationSchema =
  serviceCommerceMediaAttachmentSchema
    .extend({
      ...serviceCommerceHumanVerifiedObservationDraftSchema.shape,
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict()

export const serviceCommerceMediaCommitUploadSchema = z
  .object({
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    mediaAssetId: idSchema,
    objectKey: z.string().trim().min(1).max(500),
    storeId: storeIdSchema,
    tenantId: idSchema,
    verifiedMediaType: serviceCommerceMediaMimeTypeSchema,
    verifiedSizeBytes: z.number().int().positive().max(10_000_000),
  })
  .strict()

export const serviceCommerceMediaSafetyRequestSchema = z
  .object({
    mediaAssetId: idSchema,
    storeId: storeIdSchema,
    tenantId: idSchema,
  })
  .strict()

export const serviceCommerceMediaSafetyResultSchema =
  serviceCommerceMediaSafetyRequestSchema
    .extend({
      outcome: serviceCommercePrivateMediaSafetyLifecycleSchema,
      safetyMetadata: z.record(z.string(), z.unknown()).optional(),
      safetyProvider: z.string().trim().min(1).max(100).optional(),
    })
    .strict()

export const serviceCommerceMediaRetrySchema = z
  .object({
    failureCode: z.string().trim().min(1).max(120),
    mediaAssetId: idSchema,
    nextRetryAt: z.coerce.date(),
    retryLifecycle: z.enum(["pending_retrieval", "pending_upload"]),
    storeId: storeIdSchema,
    tenantId: idSchema,
  })
  .strict()
