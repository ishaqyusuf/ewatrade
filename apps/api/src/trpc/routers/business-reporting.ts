import {
  type BusinessReport,
  getBusinessCustomerDebt,
  getBusinessItemSalesReport,
  getBusinessPaymentCollections,
  getBusinessPostedProfitReport,
  getBusinessStockReport,
  getBusinessSupplierAgingReport,
} from "@ewatrade/db/business-reporting"
import { TRPCError } from "@trpc/server"
import { assertBusinessReportOrigin } from "../../assistant/business-report-origin"
import {
  businessReportTargetSchema,
  customerDebtReportInput,
  itemSalesReportInput,
  paymentCollectionsReportInput,
  postedProfitReportInput,
  stockReportInput,
  supplierAgingReportInput,
} from "../../schemas/business-reporting"
import { financeProcedure } from "../finance-procedure"
import {
  type TRPCContext,
  createTRPCRouter,
  mergeRouters,
  protectedProcedure,
} from "../init"
import { orderScope } from "../order-scope"
import { assertCanManageInventory } from "./inventory"
import { assertCanOperateOrders } from "./orders"

/** Every native/model read derives authority and selected Store from fresh auth. */
const reportReads = createTRPCRouter({
  itemSales: protectedProcedure
    .input(itemSalesReportInput)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = ctx.tenantContext.activeStore?.id
      if (!storeId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Choose a Store." })
      return getBusinessItemSalesReport(ctx.db, {
        ...input,
        from: new Date(input.from),
        before: new Date(input.before),
        ...(await orderScope(ctx, { storeId })),
        storeName: ctx.tenantContext.activeStore?.name,
      })
    }),
  paymentCollections: protectedProcedure
    .input(paymentCollectionsReportInput)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = ctx.tenantContext.activeStore?.id
      if (!storeId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Choose a Store." })
      return getBusinessPaymentCollections(ctx.db, {
        ...input,
        from: new Date(input.from),
        before: new Date(input.before),
        ...(await orderScope(ctx, { storeId })),
        storeName: ctx.tenantContext.activeStore?.name,
      })
    }),
  customerDebt: financeProcedure
    .input(customerDebtReportInput)
    .query(({ ctx, input }) =>
      getBusinessCustomerDebt(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  supplierAging: financeProcedure
    .input(supplierAgingReportInput)
    .query(({ ctx, input }) =>
      getBusinessSupplierAgingReport(ctx.db, { ...input, ...ctx.financeActor }),
    ),
  postedProfit: financeProcedure
    .input(postedProfitReportInput)
    .query(({ ctx, input }) =>
      getBusinessPostedProfitReport(ctx.db, {
        ...input,
        from: new Date(input.from),
        through: new Date(input.through),
        ...ctx.financeActor,
      }),
    ),
  stock: protectedProcedure.input(stockReportInput).query(({ ctx, input }) => {
    assertCanManageInventory(ctx.tenantContext)
    const storeId = ctx.tenantContext.activeStore?.id
    if (
      !storeId ||
      !ctx.tenantContext.stores.some((store) => store.id === storeId)
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Choose an accessible Store.",
      })
    return getBusinessStockReport(ctx.db, {
      ...input,
      tenantId: ctx.tenantContext.tenant.id,
      storeId,
      storeName: ctx.tenantContext.activeStore?.name,
    })
  }),
})

const reportReadNamespace = createTRPCRouter({ businessReporting: reportReads })
/** Keep full canonical procedure paths for scoped staff middleware. */
export function createBusinessReportingCaller(ctx: TRPCContext) {
  return reportReadNamespace.createCaller(ctx).businessReporting
}

export const businessReportingRouter = mergeRouters(
  reportReads,
  createTRPCRouter({
    read: protectedProcedure
      .input(businessReportTargetSchema)
      .query(async ({ ctx, input }): Promise<BusinessReport> => {
        assertBusinessReportOrigin(input, {
          tenantId: ctx.tenantContext.tenant.id,
          storeId: ctx.tenantContext.activeStore?.id ?? null,
        })
        const caller = createBusinessReportingCaller(ctx)
        const request = input.request
        switch (request.report) {
          case "item_sales":
            return caller.itemSales(request.filters)
          case "payment_collections":
            return caller.paymentCollections(request.filters)
          case "customer_debt":
            return caller.customerDebt(request.filters)
          case "stock":
            return caller.stock(request.filters)
          case "supplier_aging":
            return caller.supplierAging(request.filters)
          case "posted_profit":
            return caller.postedProfit(request.filters)
        }
      }),
  }),
)
