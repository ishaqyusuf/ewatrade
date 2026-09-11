import {
  canManageTenant,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  CatalogError,
  countCommercialOrderCustomers,
  createCommercialOrder,
  fulfillCommercialOrderProductLine,
  fulfillCommercialOrderProducts,
  getCommercialOrder,
  getCommercialOrderReminderSettings,
  getCommercialOrderReportSummary,
  listCommercialOrderPaymentsPage,
  listCommercialOrders,
  listCommercialOrdersPage,
  recordCommercialOrderPayment,
  returnCommercialOrderProductLine,
  updateCommercialOrderReminderSettings,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  commercialOrderCreateSchema,
  commercialOrderFulfillLineSchema,
  commercialOrderFulfillProductsSchema,
  commercialOrderGetSchema,
  commercialOrderListPageSchema,
  commercialOrderListSchema,
  commercialOrderPaymentSchema,
  commercialOrderPaymentsListPageSchema,
  commercialOrderReminderSettingsGetSchema,
  commercialOrderReminderSettingsUpdateSchema,
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

function assertCanManageOrderReminders(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageTenant(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Owners and Admins can manage Order reminders.",
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
    return new TRPCError({
      cause: error,
      code: "NOT_FOUND",
      message: error.message,
    })
  }
  if (
    error.code === "IDEMPOTENCY_MISMATCH" ||
    error.code === "INSUFFICIENT_STOCK" ||
    error.code === "OFFERING_UNAVAILABLE" ||
    error.code === "REVISION_CONFLICT" ||
    error.code === "STALE_CONFIGURATION"
  ) {
    return new TRPCError({
      cause: error,
      code: "CONFLICT",
      message: error.message,
    })
  }
  return new TRPCError({
    cause: error,
    code: "BAD_REQUEST",
    message: error.message,
  })
}

export const ordersRouter = createTRPCRouter({
  customerCount: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    return countCommercialOrderCustomers(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  reportSummary: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    const summary = await getCommercialOrderReportSummary(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
    return {
      ...summary,
      currencyCode: ctx.tenantContext.tenant.currencyCode,
    }
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

  fulfillProducts: protectedProcedure
    .input(commercialOrderFulfillProductsSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await fulfillCommercialOrderProducts(ctx.db, {
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

  payments: protectedProcedure
    .input(commercialOrderPaymentsListPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return listCommercialOrderPaymentsPage(ctx.db, {
        ...input,
        defaultCurrencyCode: ctx.tenantContext.tenant.currencyCode,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  reminderSettings: protectedProcedure
    .input(commercialOrderReminderSettingsGetSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageOrderReminders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const settings = await getCommercialOrderReminderSettings(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (!settings) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Store not found for this business.",
        })
      }
      return settings
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

  updateReminderSettings: protectedProcedure
    .input(commercialOrderReminderSettingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageOrderReminders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const settings = await updateCommercialOrderReminderSettings(ctx.db, {
        ...input,
        actorUserId: ctx.session.user.id,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (!settings) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Store not found for this business.",
        })
      }
      return settings
    }),
})
