import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import {
  CatalogError,
  countCommercialOrderCustomers,
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
  getCommercialOrder,
  listCommercialOrders,
  listCommercialOrdersPage,
  recordCommercialOrderPayment,
  returnCommercialOrderProductLine,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  commercialOrderCreateSchema,
  commercialOrderFulfillLineSchema,
  commercialOrderGetSchema,
  commercialOrderListSchema,
  commercialOrderListPageSchema,
  commercialOrderPaymentSchema,
  commercialOrderReturnLineSchema,
} from "../../schemas/orders"
import { createTRPCRouter, protectedProcedure } from "../init"

function assertCanOperateOrders(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Commercial Orders.",
    })
  }
}

function resolveStoreId(
  stores: Array<{ id: string }>,
  activeStore: { id: string } | null,
  requestedStoreId?: string,
) {
  if (requestedStoreId) {
    if (!stores.some((store) => store.id === requestedStoreId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this business.",
      })
    }
    return requestedStoreId
  }
  const storeId = activeStore?.id ?? stores[0]?.id
  if (!storeId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a Store before creating an Order.",
    })
  }
  return storeId
}

function orderError(error: CatalogError) {
  if (error.code === "ORDER_NOT_FOUND" || error.code === "STORE_NOT_FOUND") {
    return new TRPCError({ code: "NOT_FOUND", message: error.message })
  }
  if (
    error.code === "IDEMPOTENCY_MISMATCH" ||
    error.code === "INSUFFICIENT_STOCK" ||
    error.code === "OFFERING_UNAVAILABLE" ||
    error.code === "REVISION_CONFLICT" ||
    error.code === "STALE_CONFIGURATION"
  ) {
    return new TRPCError({ code: "CONFLICT", message: error.message })
  }
  return new TRPCError({ code: "BAD_REQUEST", message: error.message })
}

export const ordersRouter = createTRPCRouter({
  customerCount: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    return countCommercialOrderCustomers(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  create: protectedProcedure
    .input(commercialOrderCreateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await createCommercialOrder(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),

  fulfillProductLine: protectedProcedure
    .input(commercialOrderFulfillLineSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await fulfillCommercialOrderProductLine(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),

  get: protectedProcedure
    .input(commercialOrderGetSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const order = await getCommercialOrder(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Commercial Order not found.",
        })
      }
      return order
    }),

  list: protectedProcedure
    .input(commercialOrderListSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = input.storeId
        ? resolveStoreId(
            ctx.tenantContext.stores,
            ctx.tenantContext.activeStore,
            input.storeId,
          )
        : undefined
      return listCommercialOrders(ctx.db, {
        ...input,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  listPage: protectedProcedure
    .input(commercialOrderListPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = input.storeId
        ? resolveStoreId(
            ctx.tenantContext.stores,
            ctx.tenantContext.activeStore,
            input.storeId,
          )
        : undefined
      return listCommercialOrdersPage(ctx.db, {
        ...input,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  recordPayment: protectedProcedure
    .input(commercialOrderPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await recordCommercialOrderPayment(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),

  returnProductLine: protectedProcedure
    .input(commercialOrderReturnLineSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await returnCommercialOrderProductLine(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),
})
