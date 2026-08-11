import {
  canManageSalesOperations,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  ServiceCommerceCatalogError,
  ServiceCommercePolicyError,
  attestServiceCommerceCatalogAvailability,
  createServiceCommerceCatalogDraft,
  getServiceCommerceCatalogGraduationReadiness,
  getServiceCommerceCatalogPricePromotionImpact,
  getServiceCommerceCatalogPriceSuggestions,
  graduateServiceCommerceCatalogOffering,
  linkServiceCommerceCatalogOffering,
  listServiceCommerceCatalogMatches,
  promoteServiceCommerceCatalogPrice,
  publishServiceCommerceCatalogOffering,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  serviceCommerceCatalogAttestAvailabilitySchema,
  serviceCommerceCatalogCreateDraftSchema,
  serviceCommerceCatalogGraduationFormSchema,
  serviceCommerceCatalogGraduationReadinessSchema,
  serviceCommerceCatalogLinkOfferingSchema,
  serviceCommerceCatalogMatchesSchema,
  serviceCommerceCatalogPricePromotionImpactSchema,
  serviceCommerceCatalogPriceSuggestionsSchema,
  serviceCommerceCatalogPromotePriceSchema,
  serviceCommerceCatalogPublicationFormSchema,
} from "../../../schemas/service-commerce-catalog"
import { createTRPCRouter, protectedProcedure } from "../../init"
import {
  assertServiceManager,
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapCatalogError(error: unknown): never {
  if (error instanceof ServiceCommerceCatalogError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "INVALID_INPUT"
              ? "BAD_REQUEST"
              : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof ServiceCommercePolicyError) {
    throw new TRPCError({
      code: error.code === "FORBIDDEN" ? "FORBIDDEN" : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

function scope(
  context: {
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
    tenant: { id: string }
  },
  storeId?: string,
) {
  return {
    storeId: resolveServiceStoreId(
      context.stores,
      context.activeStore,
      storeId,
    ),
    tenantId: context.tenant.id,
  }
}

function assertCatalogGraduationManager(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageTenant(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only an Owner or Admin can graduate or publish Catalog records.",
    })
  }
}

export const serviceCommerceCatalogRouter = createTRPCRouter({
  catalogGraduationReadiness: protectedProcedure
    .input(serviceCommerceCatalogGraduationReadinessSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertCatalogGraduationManager(ctx.tenantContext.membership.role)
        return await getServiceCommerceCatalogGraduationReadiness(ctx.db, {
          actorUserId: ctx.session.user.id,
          offeringId: input.offeringId,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  graduateCatalogOffering: protectedProcedure
    .input(serviceCommerceCatalogGraduationFormSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertCatalogGraduationManager(ctx.tenantContext.membership.role)
        return await graduateServiceCommerceCatalogOffering(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  publishCatalogOffering: protectedProcedure
    .input(serviceCommerceCatalogPublicationFormSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertCatalogGraduationManager(ctx.tenantContext.membership.role)
        return await publishServiceCommerceCatalogOffering(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  attestCatalogAvailability: protectedProcedure
    .input(serviceCommerceCatalogAttestAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await attestServiceCommerceCatalogAvailability(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  catalogMatches: protectedProcedure
    .input(serviceCommerceCatalogMatchesSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await listServiceCommerceCatalogMatches(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  catalogPricePromotionImpact: protectedProcedure
    .input(serviceCommerceCatalogPricePromotionImpactSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await getServiceCommerceCatalogPricePromotionImpact(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  catalogPriceSuggestions: protectedProcedure
    .input(serviceCommerceCatalogPriceSuggestionsSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        const role = normalizeRole(ctx.tenantContext.membership.role)
        return await getServiceCommerceCatalogPriceSuggestions(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          includeTenantHistory: role ? canManageSalesOperations(role) : false,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  createCatalogDraft: protectedProcedure
    .input(serviceCommerceCatalogCreateDraftSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await createServiceCommerceCatalogDraft(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  linkCatalogOffering: protectedProcedure
    .input(serviceCommerceCatalogLinkOfferingSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await linkServiceCommerceCatalogOffering(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),

  promoteCatalogPrice: protectedProcedure
    .input(serviceCommerceCatalogPromotePriceSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        return await promoteServiceCommerceCatalogPrice(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          ...scope(ctx.tenantContext, input.storeId),
        })
      } catch (error) {
        mapCatalogError(error)
      }
    }),
})
