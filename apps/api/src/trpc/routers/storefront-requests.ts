import {
  CatalogError,
  CommerceQuoteError,
  ServiceCommercePolicyError,
  StorefrontOrderError,
  acceptServiceQuote,
  confirmStorefrontOrderRequest,
  countPendingStorefrontRequests,
  getStorefrontOrderRequestForStaff,
  issueStorefrontServiceQuote,
  listStorefrontOrderRequests,
  listStorefrontServiceRequests,
  openQuoteAccess,
  retryStorefrontMerchantAlert,
  updateServiceRequestDisposition,
  updateStorefrontOrderRequestDisposition,
} from "@ewatrade/db/queries"
import { ruleRejectedError } from "@ewatrade/errors"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertCanOperateOrders } from "./orders"
import { assertServiceManager } from "./service-permissions"

/**
 * Business review of storefront requests. Staff identity and Store scope come only
 * from the authenticated tenant context; conversion uses the canonical Order writer.
 */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const clientId = z.string().uuid()

function quoteSecret(env = process.env) {
  const value =
    env.STOREFRONT_QUOTE_ACCESS_SECRET ??
    env.BETTER_AUTH_SECRET ??
    env.AUTH_SECRET
  if (!value || value.length < 32)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Quote links aren't configured.",
    })
  return value
}

function scope(ctx: {
  session: { user: { id: string } }
  tenantContext: { tenant: { id: string }; stores?: { id: string }[] | null }
}) {
  const storeIds = ctx.tenantContext.stores?.map((store) => store.id) ?? []
  if (!storeIds.length)
    throw new TRPCError({ code: "FORBIDDEN", message: "No Store access." })
  return {
    tenantId: ctx.tenantContext.tenant.id,
    storeIds,
    actorUserId: ctx.session.user.id,
  }
}

function mapError(error: unknown): never {
  // Same mapping as the service router: domain refusals are readable, not 500s.
  if (error instanceof ServiceCommercePolicyError)
    throw new TRPCError({ code: "FORBIDDEN", cause: ruleRejectedError(error) })
  if (error instanceof CommerceQuoteError || error instanceof CatalogError)
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: ruleRejectedError(error),
    })
  if (error instanceof StorefrontOrderError)
    throw new TRPCError({
      code:
        error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "STALE" || error.code === "INVALID_STATE"
            ? "CONFLICT"
            : "BAD_REQUEST",
      message: error.message,
      cause: ruleRejectedError(error),
    })
  console.error("storefrontRequests unexpected error", error)
  throw error
}

export const storefrontRequestsRouter = createTRPCRouter({
  counts: protectedProcedure.query(({ ctx }) => {
    const value = scope(ctx)
    return countPendingStorefrontRequests(ctx.db, value)
  }),

  orders: protectedProcedure
    .input(
      z
        .object({
          filter: z
            .enum(["open", "confirmed", "closed", "all"])
            .default("open"),
          cursor: id.optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return listStorefrontOrderRequests(ctx.db, { ...scope(ctx), ...input })
    }),

  order: protectedProcedure
    .input(z.object({ requestId: id }).strict())
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const result = await getStorefrontOrderRequestForStaff(ctx.db, {
        ...scope(ctx),
        requestId: input.requestId,
      })
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found.",
        })
      return result
    }),

  confirmOrder: protectedProcedure
    .input(
      z
        .object({
          requestId: id,
          expectedRevision: z.number().int().positive(),
          deliveryFeeMinor: z
            .number()
            .int()
            .nonnegative()
            .max(1_000_000_000)
            .optional(),
          acceptCurrentPrices: z.boolean().optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await confirmStorefrontOrderRequest(ctx.db, scope(ctx), input)
      } catch (error) {
        mapError(error)
      }
    }),

  respondOrder: protectedProcedure
    .input(
      z
        .object({
          requestId: id,
          expectedRevision: z.number().int().positive(),
          action: z.enum(["decline", "request_information"]),
          message: z.string().trim().min(3).max(800),
          clientMessageId: clientId,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await updateStorefrontOrderRequestDisposition(
          ctx.db,
          scope(ctx),
          input,
        )
      } catch (error) {
        mapError(error)
      }
    }),

  retryAlert: protectedProcedure
    .input(z.object({ alertId: id }).strict())
    .mutation(({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return retryStorefrontMerchantAlert(ctx.db, {
        ...scope(ctx),
        alertId: input.alertId,
      })
    }),

  services: protectedProcedure
    .input(
      z
        .object({
          filter: z.enum(["open", "quoted", "closed", "all"]).default("open"),
          cursor: id.optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return listStorefrontServiceRequests(ctx.db, { ...scope(ctx), ...input })
    }),

  respondService: protectedProcedure
    .input(
      z
        .object({
          requestId: id,
          storeId: id,
          expectedRevision: z.number().int().positive(),
          action: z.enum(["decline", "request_information"]),
          message: z.string().trim().min(3).max(800),
          clientMessageId: clientId,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const value = scope(ctx)
      if (!value.storeIds.includes(input.storeId))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No access to that Store.",
        })
      const result = await updateServiceRequestDisposition(ctx.db, {
        tenantId: value.tenantId,
        storeId: input.storeId,
        requestId: input.requestId,
        status: input.action === "decline" ? "declined" : "needs_information",
        response: input.message,
        expectedRevision: input.expectedRevision,
      }).catch(mapError)
      const context = await ctx.db.storefrontServiceRequestContext.findFirst({
        where: { tenantId: value.tenantId, serviceRequestId: input.requestId },
        select: { id: true },
      })
      if (context)
        await ctx.db.storefrontRequestMessage.createMany({
          data: [
            {
              tenantId: value.tenantId,
              kind: "SERVICE",
              serviceContextId: context.id,
              author: "STAFF",
              authorUserId: value.actorUserId,
              body: input.message,
              clientMessageId: input.clientMessageId,
            },
          ],
          skipDuplicates: true,
        })
      return result
    }),

  issueServiceQuote: protectedProcedure
    .input(
      z
        .object({
          requestId: id,
          storeId: id,
          clientQuoteId: z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/),
          lines: z
            .array(
              z
                .object({
                  offeringId: id,
                  quantity: z.string().regex(/^\d{1,4}(?:\.\d{1,6})?$/),
                  unitPriceMinor: z
                    .number()
                    .int()
                    .nonnegative()
                    .max(1_000_000_000),
                })
                .strict(),
            )
            .min(1)
            .max(20),
          feeMinor: z
            .number()
            .int()
            .nonnegative()
            .max(1_000_000_000)
            .optional(),
          fulfilmentType: z
            .enum(["delivery", "pickup", "unspecified"])
            .optional(),
          note: z.string().trim().max(500).optional(),
          expiresInDays: z.number().int().min(1).max(30).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const value = scope(ctx)
      if (!value.storeIds.includes(input.storeId))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No access to that Store.",
        })
      return issueStorefrontServiceQuote(ctx.db, {
        tenantId: value.tenantId,
        storeId: input.storeId,
        actorUserId: value.actorUserId,
        requestId: input.requestId,
        clientQuoteId: input.clientQuoteId,
        lines: input.lines,
        ...(input.feeMinor !== undefined ? { feeMinor: input.feeMinor } : {}),
        ...(input.fulfilmentType
          ? { fulfilmentType: input.fulfilmentType }
          : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(input.expiresInDays
          ? {
              expiresAt: new Date(
                Date.now() + input.expiresInDays * 86_400_000,
              ),
            }
          : {}),
        quoteSecret: quoteSecret(),
      }).catch(mapError)
    }),

  /** The customer accepted on WhatsApp; staff records it as themselves. */
  recordServiceQuoteAcceptance: protectedProcedure
    .input(
      z
        .object({
          requestId: id,
          clientAcceptanceId: z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      const value = scope(ctx)
      const context = await ctx.db.storefrontServiceRequestContext.findFirst({
        where: {
          tenantId: value.tenantId,
          serviceRequestId: input.requestId,
          serviceRequest: { storeId: { in: value.storeIds } },
        },
        select: { quoteAccessCiphertext: true },
      })
      const token = context?.quoteAccessCiphertext
        ? openQuoteAccess(context.quoteAccessCiphertext, quoteSecret())
        : null
      if (!token)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Send the quote from this inbox first, then record the customer's acceptance.",
        })
      return acceptServiceQuote(ctx.db, {
        acceptanceToken: token,
        actorUserId: value.actorUserId,
        clientAcceptanceId: input.clientAcceptanceId,
      }).catch(mapError)
    }),
})
