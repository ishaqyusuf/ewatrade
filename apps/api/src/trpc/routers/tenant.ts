import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  RetailOpsSubscriptionError,
  createTenantStore,
  getWorkspaceFeatureAvailability,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { createStoreSchema } from "../../schemas/tenant"
import {
  authenticatedProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "../init"

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
  businesses: authenticatedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        tenant: {
          select: {
            currencyCode: true,
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      where: {
        status: "ACTIVE",
        userId: ctx.session.user.id,
      },
    })

    return memberships.map((membership) => ({
      currencyCode: membership.tenant.currencyCode,
      id: membership.tenant.id,
      name: membership.tenant.name,
      role: membership.role,
      slug: membership.tenant.slug,
    }))
  }),

  current: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext
  }),

  featureAvailability: protectedProcedure.query(async ({ ctx }) => {
    const store =
      ctx.tenantContext.activeStore ?? ctx.tenantContext.stores[0] ?? null

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Create a store before loading workspace features.",
      })
    }

    return getWorkspaceFeatureAvailability(ctx.db, {
      storeId: store.id,
      tenantId: ctx.tenantContext.tenant.id,
    })
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
