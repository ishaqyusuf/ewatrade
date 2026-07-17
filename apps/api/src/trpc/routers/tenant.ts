import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  RetailOpsSubscriptionError,
  createTenantStore,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { createStoreSchema } from "../../schemas/tenant"
import { createTRPCRouter, protectedProcedure } from "../init"

function assertCanManageTenantStores(role: string) {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole || !canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage business stores.",
    })
  }
}

export const tenantRouter = createTRPCRouter({
  current: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext
  }),

  stores: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext.stores
  }),

  createStore: protectedProcedure
    .input(createStoreSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageTenantStores(ctx.tenantContext.membership.role)
      const { onboarding, ...storeInput } = input

      try {
        return await createTenantStore(ctx.db, {
          createdByUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
          ...storeInput,
          currencyCode:
            storeInput.currencyCode ??
            ctx.tenantContext.tenant.currencyCode ??
            "NGN",
          onboarding: onboarding
            ? { ...onboarding, source: "trpc_store_create" }
            : undefined,
        })
      } catch (error) {
        if (error instanceof RetailOpsSubscriptionError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        throw error
      }
    }),
})
