import {
  ServiceCommerceAccessError,
  getServiceCommerceWorkspaceAccess,
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  serviceCommerceProfileActivationSchema,
  serviceCommerceProfileUpdateSchema,
  serviceCommerceWorkspaceAccessSchema,
} from "../../../schemas/service-commerce"
import { createTRPCRouter, protectedProcedure } from "../../init"
import { resolveServiceStoreId } from "../service-permissions"

function mapServiceCommerceError(error: unknown): never {
  if (error instanceof ServiceCommerceAccessError) {
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

export const serviceCommerceAccessRouter = createTRPCRouter({
  setActivation: protectedProcedure
    .input(serviceCommerceProfileActivationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await setServiceCommerceStoreProfileActivation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapServiceCommerceError(error)
      }
    }),

  updateProfile: protectedProcedure
    .input(serviceCommerceProfileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await updateServiceCommerceStoreProfile(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapServiceCommerceError(error)
      }
    }),

  workspaceAccess: protectedProcedure
    .input(serviceCommerceWorkspaceAccessSchema)
    .query(async ({ ctx, input }) => {
      try {
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await getServiceCommerceWorkspaceAccess(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapServiceCommerceError(error)
      }
    }),
})
