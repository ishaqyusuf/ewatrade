import {
  StoreConversationError,
  acknowledgeStoreConversationStaffRead,
  claimStoreConversation,
  getStoreConversationStaffMessagesAfter,
  getStoreConversationStaffTimeline,
  handoffStoreConversation,
  listEligibleStoreConversationAttendants,
  listStoreConversationQueue,
  moderateStoreConversation,
  reassignStoreConversation,
  recordFailedStoreConversationResponse,
  releaseStoreConversation,
  replyToStoreConversation,
} from "@ewatrade/db/queries"
import {
  enqueueStoreConversationNotificationDispatch,
  enqueueStoreConversationWhatsAppOutbound,
} from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"
import {
  StoreConversationAttachmentViewerUnavailableError,
  issueStoreConversationAttachmentViewerGrant,
} from "../../../service-commerce/conversation-attachment-viewer"

import {
  storeConversationQueueInputSchema,
  storeConversationStaffAttachmentViewerGrantInputSchema,
  storeConversationStaffClaimInputSchema,
  storeConversationStaffHandoffInputSchema,
  storeConversationStaffMessagesAfterInputSchema,
  storeConversationStaffModerationInputSchema,
  storeConversationStaffReadAcknowledgementInputSchema,
  storeConversationStaffReassignInputSchema,
  storeConversationStaffReleaseInputSchema,
  storeConversationStaffReplyInputSchema,
  storeConversationStaffTimelineInputSchema,
} from "../../../schemas/store-conversations"
import { createTRPCRouter, protectedProcedure } from "../../init"
import { resolveServiceStoreId } from "../service-permissions"

function storeId(
  ctx: {
    tenantContext: {
      activeStore: { id: string } | null
      stores: Array<{ id: string }>
    }
  },
  requested: string,
) {
  return resolveServiceStoreId(
    ctx.tenantContext.stores,
    ctx.tenantContext.activeStore,
    requested,
  )
}

function mapStoreConversationError(error: unknown): never {
  if (error instanceof StoreConversationError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "NOT_READY"
              ? "PRECONDITION_FAILED"
              : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

export const serviceCommerceConversationsRouter = createTRPCRouter({
  acknowledgeStoreConversationStaffRead: protectedProcedure
    .input(storeConversationStaffReadAcknowledgementInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await acknowledgeStoreConversationStaffRead(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  requestStoreConversationAttachmentViewerGrant: protectedProcedure
    .input(storeConversationStaffAttachmentViewerGrantInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await issueStoreConversationAttachmentViewerGrant(ctx.db, {
          actorUserId: ctx.session.user.id,
          conversationId: input.conversationId,
          messageAttachmentId: input.messageAttachmentId,
          reason: input.reason,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof StoreConversationError) {
          mapStoreConversationError(error)
        }
        if (
          error instanceof StoreConversationAttachmentViewerUnavailableError
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This attachment view is currently unavailable.",
        })
      }
    }),

  eligibleStoreConversationAttendants: protectedProcedure
    .input(storeConversationQueueInputSchema.pick({ storeId: true }))
    .query(async ({ ctx, input }) => {
      try {
        return await listEligibleStoreConversationAttendants(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  claimStoreConversation: protectedProcedure
    .input(storeConversationStaffClaimInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await claimStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  replyToStoreConversation: protectedProcedure
    .input(storeConversationStaffReplyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resolvedStoreId = storeId(ctx, input.storeId)
      try {
        const result = await replyToStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (result.notificationDispatch) {
          await enqueueStoreConversationNotificationDispatch(
            {
              intentId: result.notificationDispatch.intentId,
              storeId: result.notificationDispatch.storeId,
              tenantId: result.notificationDispatch.tenantId,
            },
            result.notificationDispatch.runAt,
          )
        }
        if (result.whatsAppDispatch) {
          await enqueueStoreConversationWhatsAppOutbound(
            result.whatsAppDispatch,
          )
        }
        return { message: result.message, replayed: result.replayed }
      } catch (error) {
        if (
          error instanceof StoreConversationError &&
          (error.code === "CONFLICT" || error.code === "NOT_READY")
        ) {
          await recordFailedStoreConversationResponse(ctx.db, {
            actorUserId: ctx.session.user.id,
            clientOperationId: input.clientOperationId,
            conversationId: input.conversationId,
            expectedAssignmentRevision: input.expectedAssignmentRevision,
            reasonCode:
              error.code === "CONFLICT" ? "reply_conflict" : "reply_not_ready",
            storeId: resolvedStoreId,
            tenantId: ctx.tenantContext.tenant.id,
          })
        }
        mapStoreConversationError(error)
      }
    }),

  handoffStoreConversation: protectedProcedure
    .input(storeConversationStaffHandoffInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await handoffStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  reassignStoreConversation: protectedProcedure
    .input(storeConversationStaffReassignInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reassignStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  moderateStoreConversation: protectedProcedure
    .input(storeConversationStaffModerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await moderateStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  releaseStoreConversation: protectedProcedure
    .input(storeConversationStaffReleaseInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await releaseStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  storeConversationQueue: protectedProcedure
    .input(storeConversationQueueInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listStoreConversationQueue(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  storeConversationMessagesAfter: protectedProcedure
    .input(storeConversationStaffMessagesAfterInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getStoreConversationStaffMessagesAfter(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),

  storeConversationTimeline: protectedProcedure
    .input(storeConversationStaffTimelineInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getStoreConversationStaffTimeline(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapStoreConversationError(error)
      }
    }),
})
