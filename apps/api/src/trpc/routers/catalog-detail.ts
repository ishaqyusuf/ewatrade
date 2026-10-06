import {
  catalogDetailItemExists,
  getCatalogItemDetail,
  listCatalogItemActivity,
  listCatalogItemOrders,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { catalogDetailScope } from "../../catalog/detail-access"
import {
  catalogActivitySchema,
  catalogDetailPageSchema,
  catalogDetailSchema,
} from "../../schemas/catalog-detail"
import { createTRPCRouter, protectedProcedure } from "../init"

export const catalogDetailRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(catalogDetailSchema)
    .query(async ({ ctx, input }) => {
      const result = await getCatalogItemDetail(
        ctx.db,
        catalogDetailScope(input, ctx.tenantContext),
      )
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catalog item not found.",
        })
      return result
    }),
  orders: protectedProcedure
    .input(catalogDetailPageSchema)
    .query(async ({ ctx, input }) => {
      const scope = catalogDetailScope(input, ctx.tenantContext)
      const item = await ctx.db.catalogItem.findFirst({
        where: { id: input.itemId, tenantId: scope.tenantId },
        select: { id: true },
      })
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catalog item not found.",
        })
      return listCatalogItemOrders(ctx.db, scope, input)
    }),
  activity: protectedProcedure
    .input(catalogActivitySchema)
    .query(async ({ ctx, input }) => {
      const scope = catalogDetailScope(input, ctx.tenantContext)
      const item = await ctx.db.catalogItem.findFirst({
        where: { id: input.itemId, tenantId: scope.tenantId },
        select: { id: true },
      })
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catalog item not found.",
        })
      return listCatalogItemActivity(ctx.db, scope, input)
    }),
})
