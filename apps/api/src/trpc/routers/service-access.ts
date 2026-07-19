import {
  CatalogError,
  acceptServiceQuote,
  createCustomerTrackingAccess,
  createServiceRequestForm,
  getPublicServiceTracking,
  getPublicServiceQuote,
  getPublicServiceRequestForm,
  issueServiceQuote,
  listServiceRequestForms,
  listServiceRequests,
  revokeCustomerTrackingAccess,
  submitPublicServiceRequest,
  updateServiceRequestDisposition,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  publicServiceQuoteAcceptSchema,
  publicServiceQuoteSchema,
  publicServiceRequestFormSchema,
  publicServiceRequestSubmitSchema,
  publicServiceTrackingSchema,
  serviceQuoteIssueSchema,
  serviceRequestDispositionSchema,
  serviceRequestFormCreateSchema,
  serviceRequestFormListSchema,
  serviceRequestListSchema,
  serviceTrackingCreateSchema,
  serviceTrackingRevokeSchema,
} from "../../schemas/services"
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../init"
import {
  assertServiceManager,
  resolveServiceStoreId,
} from "./service-permissions"

function publicFailure() {
  return new TRPCError({
    code: "NOT_FOUND",
    message: "This public Service action is unavailable.",
  })
}

export const serviceAccessRouter = createTRPCRouter({
  quote: publicProcedure
    .input(publicServiceQuoteSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceQuote(ctx.db, input)
      } catch (error) {
        if (error instanceof CatalogError) throw publicFailure()
        throw error
      }
    }),

  requestForm: publicProcedure
    .input(publicServiceRequestFormSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceRequestForm(ctx.db, input)
      } catch (error) {
        if (error instanceof CatalogError) throw publicFailure()
        throw error
      }
    }),

  acceptQuote: publicProcedure
    .input(publicServiceQuoteAcceptSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await acceptServiceQuote(ctx.db, {
          actorUserId: "public_quote_acceptance",
          ...input,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw publicFailure()
        throw error
      }
    }),

  createRequestForm: protectedProcedure
    .input(serviceRequestFormCreateSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const storeId = resolveServiceStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return createServiceRequestForm(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  createTracking: protectedProcedure
    .input(serviceTrackingCreateSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return createCustomerTrackingAccess(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  issueQuote: protectedProcedure
    .input(serviceQuoteIssueSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const storeId = resolveServiceStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return issueServiceQuote(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  requestForms: protectedProcedure
    .input(serviceRequestFormListSchema)
    .query(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return listServiceRequestForms(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  requests: protectedProcedure
    .input(serviceRequestListSchema)
    .query(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return listServiceRequests(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  revokeTracking: protectedProcedure
    .input(serviceTrackingRevokeSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return revokeCustomerTrackingAccess(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  submitRequest: publicProcedure
    .input(publicServiceRequestSubmitSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await submitPublicServiceRequest(ctx.db, input)
      } catch (error) {
        if (error instanceof CatalogError) throw publicFailure()
        throw error
      }
    }),

  tracking: publicProcedure
    .input(publicServiceTrackingSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceTracking(ctx.db, input)
      } catch (error) {
        if (error instanceof CatalogError) throw publicFailure()
        throw error
      }
    }),

  updateRequest: protectedProcedure
    .input(serviceRequestDispositionSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return updateServiceRequestDisposition(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})
