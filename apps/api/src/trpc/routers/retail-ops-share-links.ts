import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsFulfillmentError,
  RetailOpsShareLinkError,
  RetailOpsSubscriptionError,
  assertRetailOpsReportRangeAllowed,
  createRetailOpsDeliveryRequest,
  createRetailOpsProductShareLink,
  deactivateRetailOpsProductShareLink,
  getRetailOpsProductShareLinkAnalytics,
  listRetailOpsDeliveryRequests,
  listRetailOpsProductShareLinks,
  listRetailOpsSharedLinkOrderRequests,
  updateRetailOpsDeliveryRequestStatus,
  updateRetailOpsSharedLinkOrderRequestStatus,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCreateDeliveryRequestSchema,
  retailOpsCreateProductShareLinkSchema,
  retailOpsDeactivateProductShareLinkSchema,
  retailOpsDeliveryRequestsSchema,
  retailOpsProductShareLinkAnalyticsSchema,
  retailOpsSharedLinkOrderRequestsSchema,
  retailOpsStoreScopeSchema,
  retailOpsUpdateDeliveryRequestStatusSchema,
  retailOpsUpdateSharedLinkOrderRequestStatusSchema,
} from "../../schemas/retail-ops"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function getShareLinkErrorCode(
  error: RetailOpsShareLinkError,
): "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (error.code === "ORDER_REQUEST_ALREADY_FINALIZED") return "CONFLICT"
  if (error.code === "ORDER_REQUEST_FORBIDDEN") return "FORBIDDEN"
  if (error.code === "SHARE_LINK_FORBIDDEN") return "FORBIDDEN"

  return "NOT_FOUND"
}

function getFulfillmentErrorCode(
  error: RetailOpsFulfillmentError,
): "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "ORDER_NOT_DELIVERY_ELIGIBLE") return "BAD_REQUEST"
  if (error.code === "DELIVERY_REQUEST_UNAVAILABLE") return "CONFLICT"
  if (error.code === "ORDER_REQUEST_FORBIDDEN") return "FORBIDDEN"

  return "NOT_FOUND"
}

function getRetailOpsRole(role: string): EwaTradeRole {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use Retail Ops.",
    })
  }

  return normalizedRole
}

function assertCanUseRetailOpsShareLinks(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to share Retail Ops products.",
    })
  }

  return normalizedRole
}

async function assertRetailOpsReportHistoryAllowed(
  ctx: {
    db: TRPCContext["db"]
    tenantContext: NonNullable<TRPCContext["tenantContext"]>
  },
  input: {
    from?: Date
  },
) {
  try {
    await assertRetailOpsReportRangeAllowed(ctx.db, {
      from: input.from,
      tenantId: ctx.tenantContext.tenant.id,
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
}

function getPublicProductBaseUrl() {
  return (
    process.env.STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com"
  )
}

function resolveStore(
  stores: Array<{
    id: string
    name: string
    slug: string
  }>,
  activeStore: {
    id: string
    name: string
    slug: string
  } | null,
  input: {
    storeId?: string
  },
) {
  if (input.storeId) {
    const store = stores.find(
      (currentStore) => currentStore.id === input.storeId,
    )

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this tenant.",
      })
    }

    return store
  }

  const store = activeStore ?? stores[0] ?? null

  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before opening Retail Ops.",
    })
  }

  return store
}

export const retailOpsShareLinksRouter = createTRPCRouter({
  productShareLinks: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseRetailOpsShareLinks(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      return listRetailOpsProductShareLinks(ctx.db, {
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  productShareLinkAnalytics: protectedProcedure
    .input(retailOpsProductShareLinkAnalyticsSchema)
    .query(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return getRetailOpsProductShareLinkAnalytics(ctx.db, {
        actorUserId: ctx.session.user.id,
        canManageAllLinks: canManageSalesOperations(role),
        from: input.from,
        productId: input.productId,
        shareLinkId: input.shareLinkId,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  sharedLinkOrderRequests: protectedProcedure
    .input(retailOpsSharedLinkOrderRequestsSchema)
    .query(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsSharedLinkOrderRequests(ctx.db, {
        actorUserId: ctx.session.user.id,
        canManageAllRequests: canManageSalesOperations(role),
        from: input.from,
        limit: input.limit,
        status: input.status,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  updateSharedLinkOrderRequestStatus: protectedProcedure
    .input(retailOpsUpdateSharedLinkOrderRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await updateRetailOpsSharedLinkOrderRequestStatus(ctx.db, {
          actorUserId: ctx.session.user.id,
          canManageAllRequests: canManageSalesOperations(role),
          cashierSessionId: input.cashierSessionId,
          fulfilledAt: input.fulfilledAt,
          fulfillmentMethod: input.fulfillmentMethod,
          fulfillmentNote: input.fulfillmentNote,
          fulfillmentStatus: input.fulfillmentStatus,
          orderId: input.orderId,
          paidAt: input.paidAt,
          paymentMethod: input.paymentMethod,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsShareLinkError) {
          throw new TRPCError({
            code: getShareLinkErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  deliveryRequests: protectedProcedure
    .input(retailOpsDeliveryRequestsSchema)
    .query(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsDeliveryRequests(ctx.db, {
        actorUserId: ctx.session.user.id,
        canManageAllRequests: canManageSalesOperations(role),
        from: input.from,
        limit: input.limit,
        status: input.status,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  createDeliveryRequest: protectedProcedure
    .input(retailOpsCreateDeliveryRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await createRetailOpsDeliveryRequest(ctx.db, {
          actorUserId: ctx.session.user.id,
          canManageAllRequests: canManageSalesOperations(role),
          dropoffAddress: input.dropoffAddress,
          dropoffName: input.dropoffName,
          dropoffPhone: input.dropoffPhone,
          notes: input.notes,
          orderId: input.orderId,
          pickupAddress: input.pickupAddress,
          pickupName: input.pickupName,
          pickupPhone: input.pickupPhone,
          requestedAt: input.requestedAt,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsFulfillmentError) {
          throw new TRPCError({
            code: getFulfillmentErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  updateDeliveryRequestStatus: protectedProcedure
    .input(retailOpsUpdateDeliveryRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await updateRetailOpsDeliveryRequestStatus(ctx.db, {
          actorUserId: ctx.session.user.id,
          assignedDriverName: input.assignedDriverName,
          assignedDriverPhone: input.assignedDriverPhone,
          canManageAllRequests: canManageSalesOperations(role),
          deliveryRequestId: input.deliveryRequestId,
          happenedAt: input.happenedAt,
          note: input.note,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsFulfillmentError) {
          throw new TRPCError({
            code: getFulfillmentErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  createProductShareLink: protectedProcedure
    .input(retailOpsCreateProductShareLinkSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseRetailOpsShareLinks(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await createRetailOpsProductShareLink(ctx.db, {
          actorUserId: ctx.session.user.id,
          externalId: input.externalId,
          label: input.label,
          productId: input.productId,
          publicBaseUrl: getPublicProductBaseUrl(),
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsShareLinkError) {
          throw new TRPCError({
            code: getShareLinkErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  deactivateProductShareLink: protectedProcedure
    .input(retailOpsDeactivateProductShareLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await deactivateRetailOpsProductShareLink(ctx.db, {
          actorUserId: ctx.session.user.id,
          canManageAllLinks: canManageSalesOperations(role),
          externalId: input.externalId,
          productId: input.productId,
          shareLinkId: input.shareLinkId,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsShareLinkError) {
          throw new TRPCError({
            code: getShareLinkErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),
})
