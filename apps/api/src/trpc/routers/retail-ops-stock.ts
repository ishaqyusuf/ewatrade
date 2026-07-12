import {
  type EwaTradeRole,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsStockError,
  RetailOpsSubscriptionError,
  assertRetailOpsReportRangeAllowed,
  listRetailOpsStockMovements,
  recordRetailOpsStockAdjustment,
  recordRetailOpsStockIntake,
  recordRetailOpsUnitConversion,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsRecordStockAdjustmentSchema,
  retailOpsRecordStockIntakeSchema,
  retailOpsRecordUnitConversionSchema,
  retailOpsStockMovementsSchema,
} from "../../schemas/retail-ops"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function getStockErrorCode(
  error: RetailOpsStockError,
): "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (
    error.code === "CONVERSION_RATIO_MISMATCH" ||
    error.code === "DIFFERENT_PRODUCT" ||
    error.code === "INVALID_STOCK_ADJUSTMENT" ||
    error.code === "SAME_UNIT"
  ) {
    return "BAD_REQUEST"
  }

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

export const retailOpsStockRouter = createTRPCRouter({
  stockMovements: protectedProcedure
    .input(retailOpsStockMovementsSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsStockMovements(ctx.db, {
        from: input.from,
        limit: input.limit,
        productVariantId: input.productVariantId,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  recordStockIntake: protectedProcedure
    .input(retailOpsRecordStockIntakeSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await recordRetailOpsStockIntake(ctx.db, {
          actorUserId: ctx.session.user.id,
          externalId: input.externalId,
          note: input.note,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          receivedAt: input.receivedAt,
          sourceName: input.sourceName,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsStockError) {
          throw new TRPCError({
            code: getStockErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  recordStockAdjustment: protectedProcedure
    .input(retailOpsRecordStockAdjustmentSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await recordRetailOpsStockAdjustment(ctx.db, {
          actorUserId: ctx.session.user.id,
          adjustedAt: input.adjustedAt,
          direction: input.direction,
          externalId: input.externalId,
          note: input.note,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          reason: input.reason,
          sourceName: input.sourceName,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsStockError) {
          throw new TRPCError({
            code: getStockErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  recordUnitConversion: protectedProcedure
    .input(retailOpsRecordUnitConversionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await recordRetailOpsUnitConversion(ctx.db, {
          actorUserId: ctx.session.user.id,
          convertedAt: input.convertedAt,
          externalId: input.externalId,
          note: input.note,
          sourceProductVariantId: input.sourceProductVariantId,
          sourceQuantity: input.sourceQuantity,
          storeId: store.id,
          targetProductVariantId: input.targetProductVariantId,
          targetQuantity: input.targetQuantity,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsStockError) {
          throw new TRPCError({
            code: getStockErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),
})
