import {
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  FinanceError,
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
  assertRetailOpsPlanIdFeature,
  listOrderPaymentAccounts,
} from "@ewatrade/db/queries"
import {
  CatalogError,
  authorizeCommercialOrderChargeOnlyServiceLine,
  countCommercialOrderCustomers,
  createCommercialOrder,
  fulfillCommercialOrderChargeOnlyServiceLine,
  fulfillCommercialOrderProductLine,
  fulfillCommercialOrderProducts,
  getCommercialOrder,
  getCommercialOrderOperationalSummary,
  getCommercialOrderReminderSettings,
  getCommercialOrderReportSummary,
  getCommercialOrderSalesReport,
  listCommercialOrderPaymentsPage,
  listCommercialOrders,
  listCommercialOrdersPage,
  lookupCommercialOrders,
  lookupCommercialOrdersPage,
  recordCommercialOrderPayment,
  returnCommercialOrderProductLine,
  updateCommercialOrderReminderSettings,
} from "@ewatrade/db/queries"
import {
  getOrderReceiptSettings,
  getOrderReceipts,
  saveOrderReceiptSettings,
} from "@ewatrade/db/queries"
import { ruleRejectedError } from "@ewatrade/errors"
import { ReceiptRenderError } from "@ewatrade/order-receipts"
import { renderOrderReceipts } from "@ewatrade/order-receipts/pdf"
import { TRPCError } from "@trpc/server"
import {
  orderReceiptPrepareSchema,
  orderReceiptSettingsGetSchema,
  orderReceiptSettingsSaveSchema,
} from "../../schemas/order-receipts"
import { orderActivityRouter } from "./order-activity"
import { orderAmendmentProcedures } from "./order-amendments"
import { orderChangeApprovalProcedures } from "./order-change-approvals"
import { orderMoneyProcedures } from "./order-money"
import { orderTimelineProcedures } from "./order-timeline"

import {
  orderLookupPageSchema,
  orderLookupSchema,
} from "../../schemas/order-visibility"
import {
  commercialOrderAuthorizeChargeOnlyServiceLineSchema,
  commercialOrderCreateSchema,
  commercialOrderFulfillChargeOnlyServiceLineSchema,
  commercialOrderFulfillLineSchema,
  commercialOrderFulfillProductsSchema,
  commercialOrderGetSchema,
  commercialOrderListPageSchema,
  commercialOrderListSchema,
  commercialOrderOperationalSummarySchema,
  commercialOrderPaymentSchema,
  commercialOrderPaymentsListPageSchema,
  commercialOrderReminderSettingsGetSchema,
  commercialOrderReminderSettingsUpdateSchema,
  commercialOrderReportSummarySchema,
  commercialOrderReturnLineSchema,
  commercialOrderSalesReportSchema,
} from "../../schemas/orders"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"

export function assertCanOperateOrders(role: string) {
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

export function assertCanManageSalesOperations(role: string) {
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

export function orderError(error: CatalogError | FinanceError) {
  if (error instanceof FinanceError) {
    const code =
      error.code === "FORBIDDEN"
        ? "FORBIDDEN"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
            ? "CONFLICT"
            : "BAD_REQUEST"
    return new TRPCError({
      // Rule refusals show their reason; access and conflicts keep fixed text.
      cause: code === "BAD_REQUEST" ? ruleRejectedError(error) : error,
      code,
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
    cause: ruleRejectedError(error),
    code: "BAD_REQUEST",
    message: error.message,
  })
}

// "Invoices" in plan copy means Order receipt PDF/image generation (owner
// clarification, 3 October 2026). Free can still read receipt settings.
const receiptProcedure = protectedProcedure.use(({ ctx, next }) => {
  assertRetailOpsPlanIdFeature(
    ctx.tenantContext.tenant.retailOpsPlanId ??
      RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
    "invoices",
  )
  return next()
})

// Order reminder emails are a paid-plan feature: Free businesses get no
// reminder settings and the hourly job sends them nothing (owner, 11 Oct 2026).
const reminderProcedure = protectedProcedure.use(({ ctx, next }) => {
  assertRetailOpsPlanIdFeature(
    ctx.tenantContext.tenant.retailOpsPlanId ??
      RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
    "orderReminders",
  )
  return next()
})

export const ordersRouter = createTRPCRouter({
  /** Where order money can be received, for anyone who takes payments. */
  paymentAccounts: protectedProcedure.query(({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    return listOrderPaymentAccounts(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
      currencyCode:
        ctx.tenantContext.activeStore?.currencyCode ??
        ctx.tenantContext.tenant.currencyCode,
    })
  }),
  ...orderAmendmentProcedures,
  ...orderTimelineProcedures,
  ...orderMoneyProcedures,
  ...orderChangeApprovalProcedures,
  activity: orderActivityRouter,
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
  saveReceiptSettings: receiptProcedure
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
  prepareReceipts: receiptProcedure
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

  operationalSummary: protectedProcedure
    .input(commercialOrderOperationalSummarySchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return getCommercialOrderOperationalSummary(ctx.db, {
        ...input,
        ...(await orderScope(ctx, { storeId })),
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
      const summary = await getCommercialOrderReportSummary(ctx.db, {
        ...(await orderScope(ctx, { storeId, mine: input?.mine })),
        createdAfter: input?.createdAfter,
        createdBefore: input?.createdBefore,
        statuses: input?.statuses,
      })
      return {
        ...summary,
        currencyCode:
          ctx.tenantContext.stores.find((store) => store.id === storeId)
            ?.currencyCode ?? ctx.tenantContext.tenant.currencyCode,
      }
    }),

  salesReport: protectedProcedure
    .input(commercialOrderSalesReportSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = input.storeId
        ? resolveStoreId(
            ctx.tenantContext.stores,
            ctx.tenantContext.activeStore,
            input.storeId,
          )
        : undefined
      const report = await getCommercialOrderSalesReport(ctx.db, {
        ...(await orderScope(ctx, { storeId })),
        from: input.from,
        to: input.to,
      })
      return {
        ...report,
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

  lookupOpenPage: protectedProcedure
    .input(orderLookupPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
      )
      try {
        return await lookupCommercialOrdersPage(ctx.db, {
          ...input,
          ...(await orderScope(ctx, {
            storeId,
          })),
        })
      } catch (error) {
        if (error instanceof CatalogError) throw orderError(error)
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

  reminderSettings: reminderProcedure
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
      // Reps may take payment on any order they look up. A refund is money
      // out, so like returnProductLine it needs normal creator visibility.
      if (input.type === "refund") {
        const scope = await orderScope(ctx)
        if (scope.createdByUserId) {
          const order = await ctx.db.commercialOrder.findFirst({
            where: { ...scope, id: input.orderId },
            select: { id: true },
          })
          if (!order)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Commercial Order not found.",
            })
        }
      }
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

  updateReminderSettings: reminderProcedure
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
