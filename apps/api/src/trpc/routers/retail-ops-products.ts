import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsProductError,
  RetailOpsSubscriptionError,
  assertRetailOpsReportRangeAllowed,
  createRetailOpsProduct,
  getRetailOpsProductUnitPriceAt,
  listRetailOpsProductUnitPriceHistory,
  listRetailOpsProductUnitTemplates,
  updateRetailOpsProductUnitPrice,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCreateProductSchema,
  retailOpsProductUnitEffectivePriceSchema,
  retailOpsProductUnitPriceHistorySchema,
  retailOpsUpdateProductUnitPriceSchema,
} from "../../schemas/retail-ops"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function getProductErrorCode(
  error: RetailOpsProductError,
): "BAD_REQUEST" | "NOT_FOUND" {
  if (error.code === "DUPLICATE_UNIT") return "BAD_REQUEST"
  if (error.code === "FUTURE_PRICE_NOT_SUPPORTED") return "BAD_REQUEST"

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

function assertCanManageRetailOpsProducts(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage Retail Ops products.",
    })
  }
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

export const retailOpsProductsRouter = createTRPCRouter({
  productUnitPriceAt: protectedProcedure
    .input(retailOpsProductUnitEffectivePriceSchema)
    .query(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await getRetailOpsProductUnitPriceAt(ctx.db, {
          effectiveAt: input.effectiveAt,
          productVariantId: input.productVariantId,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsProductError) {
          throw new TRPCError({
            code: getProductErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  priceHistory: protectedProcedure
    .input(retailOpsProductUnitPriceHistorySchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsProductUnitPriceHistory(ctx.db, {
        from: input.from,
        limit: input.limit,
        productVariantId: input.productVariantId,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  unitTemplates: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageRetailOpsProducts(ctx.tenantContext.membership.role)

    return listRetailOpsProductUnitTemplates(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  createProduct: protectedProcedure
    .input(retailOpsCreateProductSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsProducts(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await createRetailOpsProduct(ctx.db, {
          actorUserId: ctx.session.user.id,
          description: input.description,
          externalId: input.externalId,
          imageUrl: input.imageUrl,
          name: input.name,
          openingStockQuantity: input.openingStockQuantity,
          primaryUnitName: input.primaryUnitName,
          priceMinor: input.priceMinor,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          unitTemplateKey: input.unitTemplateKey,
          variants: input.variants,
        })
      } catch (error) {
        if (error instanceof RetailOpsProductError) {
          throw new TRPCError({
            code: getProductErrorCode(error),
            message: error.message,
          })
        }

        if (error instanceof RetailOpsSubscriptionError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        throw error
      }
    }),

  updateProductUnitPrice: protectedProcedure
    .input(retailOpsUpdateProductUnitPriceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsProducts(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await updateRetailOpsProductUnitPrice(ctx.db, {
          actorUserId: ctx.session.user.id,
          effectiveAt: input.effectiveAt,
          priceMinor: input.priceMinor,
          productVariantId: input.productVariantId,
          reason: input.reason,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsProductError) {
          throw new TRPCError({
            code: getProductErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),
})
