import {
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { FinanceError } from "@ewatrade/db/queries"
import {
  CatalogError,
  authorizeCommercialOrderChargeOnlyServiceLine,
  countCommercialOrderCustomers,
  createCommercialOrder,
  fulfillCommercialOrderChargeOnlyServiceLine,
  fulfillCommercialOrderProductLine,
  fulfillCommercialOrderProducts,
  getCommercialOrder,
  getCommercialOrderReminderSettings,
  getCommercialOrderReportSummary,
  listCommercialOrderPaymentsPage,
  listCommercialOrders,
  listCommercialOrdersPage,
  lookupCommercialOrders,
  recordCommercialOrderPayment,
  returnCommercialOrderProductLine,
  updateCommercialOrderReminderSettings,
} from "@ewatrade/db/queries"
import {
  getOrderReceiptSettings,
  getOrderReceipts,
  saveOrderReceiptSettings,
} from "@ewatrade/db/queries"
import { ReceiptRenderError } from "@ewatrade/order-receipts"
import { renderOrderReceipts } from "@ewatrade/order-receipts/pdf"
import { TRPCError } from "@trpc/server"
import {
  orderReceiptPrepareSchema,
  orderReceiptSettingsGetSchema,
  orderReceiptSettingsSaveSchema,
} from "../../schemas/order-receipts"

import { orderLookupSchema } from "../../schemas/order-visibility"
import {
  commercialOrderAuthorizeChargeOnlyServiceLineSchema,
  commercialOrderCreateSchema,
  commercialOrderFulfillChargeOnlyServiceLineSchema,
  commercialOrderFulfillLineSchema,
  commercialOrderFulfillProductsSchema,
  commercialOrderGetSchema,
  commercialOrderListPageSchema,
  commercialOrderListSchema,
  commercialOrderPaymentSchema,
  commercialOrderPaymentsListPageSchema,
  commercialOrderReminderSettingsGetSchema,
  commercialOrderReminderSettingsUpdateSchema,
  commercialOrderReportSummarySchema,
  commercialOrderReturnLineSchema,
} from "../../schemas/orders"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"

function assertCanOperateOrders(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Commercial Orders.",
    })
  }
}

function assertCanManageOrderReminders(
  role: string,
  subject = "Order reminders",
) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageTenant(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Only Owners and Admins can manage ${subject}.`,
    })
  }
}

function assertCanManageSalesOperations(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageSalesOperations(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to authorize Service release.",
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

function orderError(error: CatalogError | FinanceError) {
  if (error instanceof FinanceError) {
    return new TRPCError({
      cause: error,
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
              ? "CONFLICT"
              : "BAD_REQUEST",
      message: error.message,
    })
  }
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
  receiptSettings: protectedProcedure
    .input(orderReceiptSettingsGetSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await getOrderReceiptSettings(ctx.db, {
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),
  saveReceiptSettings: protectedProcedure
    .input(orderReceiptSettingsSaveSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageOrderReminders(
        ctx.tenantContext.membership.role,
        "receipt settings",
      )
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await saveOrderReceiptSettings(ctx.db, {
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),
  prepareReceipts: protectedProcedure
    .input(orderReceiptPrepareSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        const receipts = await getOrderReceipts(ctx.db, {
          ...input,
          ...(await orderScope(ctx, { storeId })),
          storeId,
        })
        const pdf = await renderOrderReceipts(receipts)
        const pages = input.includeImages
          ? await (
              await import("@ewatrade/order-receipts/images")
            ).renderReceiptImages(pdf)
          : undefined
        return {
          pages,
          pdfBase64: pdf.toString("base64"),
          orderNumbers: receipts.map((receipt) => receipt.orderNumber),
          generatedAt: receipts[0]?.generatedAt,
          settingsSource: receipts[0]?.settingsSource,
        }
      } catch (error) {
        if (error instanceof ReceiptRenderError)
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
        if (error instanceof CatalogError) throw orderError(error)
        throw error
      }
    }),
  customerCount: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    return countCommercialOrderCustomers(ctx.db, {
      ...(await orderScope(ctx)),
      storeId:
        ctx.tenantContext.staffAccess?.mode === "SCOPED" ||
        ["CASHIER", "OPERATOR"].includes(ctx.tenantContext.membership.role)
          ? ctx.tenantContext.activeStore?.id
          : undefined,
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  reportSummary: protectedProcedure
    .input(commercialOrderReportSummarySchema.optional())
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = input?.storeId
        ? resolveStoreId(
            ctx.tenantContext.stores,
            ctx.tenantContext.activeStore,
            input.storeId,
          )
        : undefined
      const summary = await getCommercialOrderReportSummary(
        ctx.db,
        await orderScope(ctx, { storeId }),
      )
      return {
        ...summary,
        currencyCode:
          ctx.tenantContext.stores.find((store) => store.id === storeId)
            ?.currencyCode ?? ctx.tenantContext.tenant.currencyCode,
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
        throw error
      }
    }),

  fulfillChargeOnlyServiceLine: protectedProcedure
    .input(commercialOrderFulfillChargeOnlyServiceLineSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await fulfillCommercialOrderChargeOnlyServiceLine(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
        throw error
      }
    }),

  authorizeChargeOnlyServiceLine: protectedProcedure
    .input(commercialOrderAuthorizeChargeOnlyServiceLineSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageSalesOperations(ctx.tenantContext.membership.role)
      try {
        return await authorizeCommercialOrderChargeOnlyServiceLine(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
        throw error
      }
    }),

  lookupOpen: protectedProcedure
    .input(orderLookupSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return lookupCommercialOrders(ctx.db, {
        ...input,
        ...(await orderScope(ctx, {
          storeId: ctx.tenantContext.activeStore?.id,
        })),
      })
    }),

  get: protectedProcedure
    .input(commercialOrderGetSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const order = await getCommercialOrder(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
        storeId: (await orderScope(ctx)).storeId,
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
        ...(await orderScope(ctx, { storeId, mine: input.mine })),
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
        ...(await orderScope(ctx, { storeId, mine: input.mine })),
      })
    }),

  payments: protectedProcedure
    .input(commercialOrderPaymentsListPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return listCommercialOrderPaymentsPage(ctx.db, {
        ...input,
        defaultCurrencyCode: ctx.tenantContext.tenant.currencyCode,
        ...(await orderScope(ctx, input)),
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
        throw error
      }
    }),

  returnProductLine: protectedProcedure
    .input(commercialOrderReturnLineSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const scope = await orderScope(ctx)
      if (scope.createdByUserId) {
        const line = await ctx.db.commercialOrderLine.findFirst({
          where: { id: input.orderLineId, order: scope },
          select: { id: true },
        })
        if (!line)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order item not found.",
          })
      }
      try {
        return await returnCommercialOrderProductLine(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw orderError(error)
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
