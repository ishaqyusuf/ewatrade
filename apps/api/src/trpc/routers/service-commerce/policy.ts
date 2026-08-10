import {
  ServiceCommercePolicyError,
  getServiceCommercePolicyDecisionDetail,
  listServiceCommercePolicyDecisions,
  revokeServiceCommercePolicyDecision,
  setServiceCommercePolicyDecision,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  serviceCommercePolicyDetailSchema,
  serviceCommercePolicyListSchema,
  serviceCommercePolicyRevokeSchema,
  serviceCommercePolicySetSchema,
} from "../../../schemas/service-commerce-policy"
import { createTRPCRouter, protectedProcedure } from "../../init"
import { resolveServiceStoreId } from "../service-permissions"

function mapPolicyError(error: unknown): never {
  if (error instanceof ServiceCommercePolicyError) {
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

function storeId(
  context: {
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
  },
  requested: string,
) {
  return resolveServiceStoreId(context.stores, context.activeStore, requested)
}

export const serviceCommercePolicyRouter = createTRPCRouter({
  policyDecision: protectedProcedure
    .input(serviceCommercePolicyDetailSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getServiceCommercePolicyDecisionDetail(ctx.db, {
          actorUserId: ctx.session.user.id,
          decisionId: input.decisionId,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapPolicyError(error)
      }
    }),

  policyDecisions: protectedProcedure
    .input(serviceCommercePolicyListSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listServiceCommercePolicyDecisions(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapPolicyError(error)
      }
    }),

  revokePolicyDecision: protectedProcedure
    .input(serviceCommercePolicyRevokeSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeServiceCommercePolicyDecision(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapPolicyError(error)
      }
    }),

  setPolicyDecision: protectedProcedure
    .input(serviceCommercePolicySetSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await setServiceCommercePolicyDecision(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          reviewedByUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapPolicyError(error)
      }
    }),
})
