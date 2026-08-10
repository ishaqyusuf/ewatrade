import {
  ServiceCommerceMediaError,
  createServiceCommerceHumanObservation,
  getAuthorizedServiceCommerceMediaAttachment,
  getAuthorizedServiceCommerceMediaView,
  projectSafeServiceCommerceMediaAsset,
  projectSafeServiceCommerceObservation,
  recordServiceCommerceMediaSafety,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
  scheduleServiceCommerceMediaRetry,
} from "@ewatrade/db/queries"
import { getConfiguredPrivateMediaProvider } from "@ewatrade/service-commerce"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceMediaAttachmentSchema,
  serviceCommerceMediaCommitUploadSchema,
  serviceCommerceMediaObservationSchema,
  serviceCommerceMediaRetrySchema,
  serviceCommerceMediaSafetyRequestSchema,
  serviceCommerceMediaSafetyResultSchema,
  serviceCommerceMediaViewerGrantSchema,
} from "../../../schemas/service-commerce-media"
import {
  createTRPCRouter,
  internalProcedure,
  protectedProcedure,
} from "../../init"
import {
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapMediaError(error: unknown): never {
  if (error instanceof ServiceCommerceMediaError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

function storeScope(
  context: {
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
    tenant: { id: string }
  },
  requestedStoreId: string,
) {
  return {
    storeId: resolveServiceStoreId(
      context.stores,
      context.activeStore,
      requestedStoreId,
    ),
    tenantId: context.tenant.id,
  }
}

function sourceKind(value: string) {
  if (value === "COMMERCE_INQUIRY") return "commerce_inquiry" as const
  if (value === "PRESCRIPTION_REQUEST") return "prescription" as const
  return "service" as const
}

function mediaRecovery(lifecycle: string, channelOrigin: string) {
  switch (lifecycle) {
    case "PENDING_UPLOAD":
      return { action: "resume_upload", retryable: true }
    case "PENDING_RETRIEVAL":
      return { action: "retry_retrieval", retryable: true }
    case "RETRYABLE":
      return {
        action: channelOrigin === "WHATSAPP" ? "retry_retrieval" : "reupload",
        retryable: true,
      }
    case "REJECTED":
      return { action: "reupload", retryable: true }
    case "SAFE":
      return { action: "ready", retryable: false }
    case "QUARANTINED":
      return { action: "contact_business", retryable: false }
    case "DELETED":
      return { action: "unavailable", retryable: false }
    default:
      return { action: "wait_for_processing", retryable: false }
  }
}

function projectAttachment(attachment: {
  createdAt: Date
  id: string
  lifecycle: string
  mediaAsset: Parameters<typeof projectSafeServiceCommerceMediaAsset>[0] & {
    channelOrigin: string
  }
  mediaAssetId: string
  observations: Array<
    Parameters<typeof projectSafeServiceCommerceObservation>[0]
  >
  sourceId: string
  sourceKind: string
  sourceLineId: string | null
  sourceVersion: string
}) {
  return {
    attachment: {
      attachedAt: attachment.createdAt,
      id: attachment.id,
      lifecycle: attachment.lifecycle.toLowerCase(),
      mediaAssetId: attachment.mediaAssetId,
      source: {
        id: attachment.sourceId,
        kind: sourceKind(attachment.sourceKind),
      },
      sourceLineId: attachment.sourceLineId,
      sourceVersion: attachment.sourceVersion,
    },
    media: projectSafeServiceCommerceMediaAsset(attachment.mediaAsset),
    observation: attachment.observations[0]
      ? projectSafeServiceCommerceObservation(attachment.observations[0])
      : null,
    recovery: mediaRecovery(
      attachment.mediaAsset.lifecycle,
      attachment.mediaAsset.channelOrigin,
    ),
  }
}

/**
 * Media bytes, object keys, provider ids and actual upload intents intentionally
 * remain outside protected tRPC. Browser and provider adapters must use an
 * authenticated server-side upload/retrieval boundary that verifies bytes first.
 */
export const serviceCommerceMediaRouter = createTRPCRouter({
  commitMediaUpload: internalProcedure
    .input(serviceCommerceMediaCommitUploadSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordStoredServiceCommerceMediaAsset(ctx.db, {
          ...input,
          reason: "media_upload_committed",
        })
      } catch (error) {
        mapMediaError(error)
      }
    }),

  mediaAttachment: protectedProcedure
    .input(serviceCommerceMediaAttachmentSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const scope = storeScope(ctx.tenantContext, input.storeId)
        const attachment = await getAuthorizedServiceCommerceMediaAttachment(
          ctx.db,
          {
            actorUserId: ctx.session.user.id,
            attachmentId: input.attachmentId,
            ...scope,
          },
        )
        return projectAttachment(attachment)
      } catch (error) {
        mapMediaError(error)
      }
    }),

  recordMediaSafety: internalProcedure
    .input(serviceCommerceMediaSafetyResultSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordServiceCommerceMediaSafety(ctx.db, {
          ...input,
          reason: "media_safety_recorded",
        })
      } catch (error) {
        mapMediaError(error)
      }
    }),

  requestMediaSafety: internalProcedure
    .input(serviceCommerceMediaSafetyRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await requestServiceCommerceMediaSafety(ctx.db, {
          ...input,
          reason: "media_safety_requested",
        })
      } catch (error) {
        mapMediaError(error)
      }
    }),

  requestMediaViewerGrant: protectedProcedure
    .input(serviceCommerceMediaViewerGrantSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const scope = storeScope(ctx.tenantContext, input.storeId)
        const authorized = await getAuthorizedServiceCommerceMediaView(ctx.db, {
          actorUserId: ctx.session.user.id,
          attachmentId: input.attachmentId,
          expiresAt: new Date(Date.now() + 60_000),
          reason: input.reason,
          ...scope,
        })
        const grant =
          await getConfiguredPrivateMediaProvider().createViewerGrant(
            authorized,
          )
        return { expiresAt: grant.expiresAt, url: grant.url }
      } catch (error) {
        if (
          error instanceof ServiceCommerceMediaError ||
          error instanceof TRPCError
        ) {
          mapMediaError(error)
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "Private media viewing is currently unavailable.",
        })
      }
    }),

  scheduleMediaRetry: internalProcedure
    .input(serviceCommerceMediaRetrySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await scheduleServiceCommerceMediaRetry(ctx.db, {
          ...input,
          reason: "media_retry_scheduled",
        })
      } catch (error) {
        mapMediaError(error)
      }
    }),

  verifyMediaObservation: protectedProcedure
    .input(serviceCommerceMediaObservationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await createServiceCommerceHumanObservation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...storeScope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapMediaError(error)
      }
    }),
})
