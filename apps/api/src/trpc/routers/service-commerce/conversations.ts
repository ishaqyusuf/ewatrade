import {
  StoreConversationError,
  claimStoreConversation,
  getStoreConversationStaffTimeline,
  listStoreConversationQueue,
  replyToStoreConversation,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  storeConversationQueueInputSchema,
  storeConversationStaffClaimInputSchema,
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
      try {
        return await replyToStoreConversation(ctx.db, {
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
          actorUserId: ctx.session.user.id,
          limit: input.limit,
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
