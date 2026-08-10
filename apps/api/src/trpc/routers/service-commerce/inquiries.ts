import {
  CommerceInquiryError,
  CommerceQuoteError,
  ServiceCommerceSourceError,
  acceptCommerceInquiryQuote,
  createCommerceInquiry,
  getPublicCommerceInquiryQuote,
  getServiceCommerceCustomerRequestProjection,
  issueCommerceInquiryQuote,
  transitionCommerceInquiry,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  commerceInquiryCreateSchema,
  commerceInquiryQuoteIssueSchema,
  commerceInquiryTransitionSchema,
  publicCommerceInquiryQuoteAcceptSchema,
  publicCommerceInquiryQuoteSchema,
  serviceCommerceSourceProjectionSchema,
} from "../../../schemas/service-commerce-inquiries"
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../init"
import {
  assertServiceOperator,
  resolveServiceStoreId,
} from "../service-permissions"

function mapProtectedError(error: unknown): never {
  if (error instanceof CommerceInquiryError) {
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
  if (error instanceof ServiceCommerceSourceError) {
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
  if (error instanceof CommerceQuoteError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message })
  }
  throw error
}

function publicFailure(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "This Commerce Inquiry action is unavailable.",
  })
}

function storeId(
  context: {
    activeStore: { id: string } | null
    stores: Array<{ id: string }>
  },
  requested?: string,
) {
  return resolveServiceStoreId(context.stores, context.activeStore, requested)
}

export const serviceCommerceInquiryRouter = createTRPCRouter({
  acceptInquiryQuote: publicProcedure
    .input(publicCommerceInquiryQuoteAcceptSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await acceptCommerceInquiryQuote(ctx.db, input)
      } catch {
        publicFailure()
      }
    }),

  createInquiry: protectedProcedure
    .input(commerceInquiryCreateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await createCommerceInquiry(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedError(error)
      }
    }),

  inquiryQuote: publicProcedure
    .input(publicCommerceInquiryQuoteSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicCommerceInquiryQuote(ctx.db, input)
      } catch {
        publicFailure()
      }
    }),

  issueInquiryQuote: protectedProcedure
    .input(commerceInquiryQuoteIssueSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await issueCommerceInquiryQuote(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedError(error)
      }
    }),

  sourceProjection: protectedProcedure
    .input(serviceCommerceSourceProjectionSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getServiceCommerceCustomerRequestProjection(ctx.db, {
          actorUserId: ctx.session.user.id,
          source: input.source,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedError(error)
      }
    }),

  transitionInquiry: protectedProcedure
    .input(commerceInquiryTransitionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertServiceOperator(ctx.tenantContext.membership.role)
        return await transitionCommerceInquiry(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx.tenantContext, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapProtectedError(error)
      }
    }),
})
