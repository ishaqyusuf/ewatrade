import {
  StoreConversationError,
  claimStoreConversation,
  getStoreConversationStaffTimeline,
  handoffStoreConversation,
  listEligibleStoreConversationAttendants,
  listStoreConversationQueue,
  reassignStoreConversation,
  recordFailedStoreConversationResponse,
  releaseStoreConversation,
  replyToStoreConversation,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  storeConversationQueueInputSchema,
  storeConversationStaffClaimInputSchema,
  storeConversationStaffHandoffInputSchema,
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
        return await replyToStoreConversation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: resolvedStoreId,
          tenantId: ctx.tenantContext.tenant.id,
        })
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
