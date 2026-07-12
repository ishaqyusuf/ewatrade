import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsSaleError,
  RetailOpsStockWalletError,
  RetailOpsSubscriptionError,
  assertRetailOpsReportRangeAllowed,
  createRetailOpsSale,
  listRetailOpsCreditSales,
  listRetailOpsRecentSales,
  recordRetailOpsCreditPayment,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCreateSaleSchema,
  retailOpsCreditSalesSchema,
  retailOpsRecentSalesSchema,
  retailOpsRecordCreditPaymentSchema,
} from "../../schemas/retail-ops"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function getSaleErrorCode(error: RetailOpsSaleError): "CONFLICT" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (error.code === "CREDIT_PAYMENT_NOT_ALLOWED") return "CONFLICT"
  if (error.code === "CREDIT_PAYMENT_OVERPAID") return "CONFLICT"

  return "NOT_FOUND"
}

function getStockWalletErrorCode(
  error: RetailOpsStockWalletError,
): "CONFLICT" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"

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

function getRetailOpsActorReadScope(role: string, userId: string) {
  const normalizedRole = getRetailOpsRole(role)

  return canManageSalesOperations(normalizedRole) ? undefined : userId
}

function assertCanOperateRetailOpsPos(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Retail Ops POS.",
    })
  }
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

export const retailOpsSalesRouter = createTRPCRouter({
  recentSales: protectedProcedure
    .input(retailOpsRecentSalesSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsRecentSales(ctx.db, {
        actorUserId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
        from: input.from,
        limit: input.limit,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  creditSales: protectedProcedure
    .input(retailOpsCreditSalesSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsCreditSales(ctx.db, {
        actorUserId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
        from: input.from,
        limit: input.limit,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  recordCreditPayment: protectedProcedure
    .input(retailOpsRecordCreditPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await recordRetailOpsCreditPayment(ctx.db, {
          actorUserId: ctx.session.user.id,
          amountMinor: input.amountMinor,
          cashierSessionId: input.cashierSessionId,
          externalId: input.externalId,
          notes: input.notes,
          orderId: input.orderId,
          paidAt: input.paidAt,
          paymentMethod: input.paymentMethod,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsSaleError) {
          throw new TRPCError({
            code: getSaleErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  createSale: protectedProcedure
    .input(retailOpsCreateSaleSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await createRetailOpsSale(ctx.db, {
          actorUserId: ctx.session.user.id,
          cashierSessionId: input.cashierSessionId,
          creditDueAt: input.creditDueAt,
          creditTermsNote: input.creditTermsNote,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          externalId: input.externalId,
          notes: input.notes,
          paymentMethod: input.paymentMethod,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          soldAt: input.soldAt,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsSaleError) {
          throw new TRPCError({
            code: getSaleErrorCode(error),
            message: error.message,
          })
        }

        if (error instanceof RetailOpsStockWalletError) {
          throw new TRPCError({
            code: getStockWalletErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),
})
