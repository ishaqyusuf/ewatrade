import {
  CatalogError,
  ServiceCommercePolicyError,
  acceptServiceQuote,
  createCustomerTrackingAccess,
  createServiceRequestForm,
  getPublicServiceQuote,
  getPublicServiceRequestForm,
  getPublicServiceTracking,
  issueServiceQuote,
  listServiceRequestForms,
  listServiceRequests,
  revokeCustomerTrackingAccess,
  selectServiceQuoteOption,
  submitPublicServiceRequest,
  updateServiceRequestDisposition,
} from "@ewatrade/db/queries"
import { AppError } from "@ewatrade/errors"
import { TRPCError } from "@trpc/server"

import {
  publicServiceQuoteAcceptSchema,
  publicServiceQuoteOptionSelectSchema,
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
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init"
import {
  assertServiceManager,
  resolveServiceStoreId,
} from "./service-permissions"

function publicFailure(cause: unknown) {
  return new TRPCError({
    cause: new AppError({ cause, code: "CUSTOMER_ACCESS_DENIED" }),
    code: "NOT_FOUND",
    message: "This public Service action is unavailable.",
  })
}

function isPublicFailure(error: unknown) {
  return (
    error instanceof CatalogError || error instanceof ServiceCommercePolicyError
  )
}

function mapProtectedPolicyError(error: unknown): never {
  if (error instanceof ServiceCommercePolicyError) {
    throw new TRPCError({ code: "FORBIDDEN", message: error.message })
  }
  throw error
}

export const serviceAccessRouter = createTRPCRouter({
  quote: publicProcedure
    .input(publicServiceQuoteSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceQuote(ctx.db, input)
      } catch (error) {
        if (isPublicFailure(error)) throw publicFailure(error)
        throw error
      }
    }),

  requestForm: publicProcedure
    .input(publicServiceRequestFormSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceRequestForm(ctx.db, input)
      } catch (error) {
        if (isPublicFailure(error)) throw publicFailure(error)
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
        if (isPublicFailure(error)) throw publicFailure(error)
        throw error
      }
    }),

  selectQuoteOption: publicProcedure
    .input(publicServiceQuoteOptionSelectSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await selectServiceQuoteOption(ctx.db, input)
      } catch (error) {
        if (isPublicFailure(error)) throw publicFailure(error)
        throw error
      }
    }),

  createRequestForm: protectedProcedure
    .input(serviceRequestFormCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await createServiceRequestForm(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedPolicyError(error)
      }
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
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceManager(ctx.tenantContext.membership.role)
        const storeId = resolveServiceStoreId(
          ctx.tenantContext.stores,
          ctx.tenantContext.activeStore,
          input.storeId,
        )
        return await issueServiceQuote(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedPolicyError(error)
      }
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
        if (isPublicFailure(error)) throw publicFailure(error)
        throw error
      }
    }),

  tracking: publicProcedure
    .input(publicServiceTrackingSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicServiceTracking(ctx.db, input)
      } catch (error) {
        if (isPublicFailure(error)) throw publicFailure(error)
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
