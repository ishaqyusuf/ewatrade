import { listCatalogCategories } from "@ewatrade/db/catalog-categories"
import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import {
  browseProductTaxonomy,
  readProductTaxonomyAttributes,
} from "@ewatrade/utils/product-taxonomy"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { suggestCatalogCategories } from "../../catalog/category-suggestions"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import { assertCanReadCatalog } from "../../catalog/reference-access"
import { createTRPCRouter, protectedProcedure } from "../init"
import { catalogPhotoTRPCError } from "./catalog-photos"

export const catalogCategoriesRouter = createTRPCRouter({
  browse: protectedProcedure
    .input(
      z
        .object({
          parentId: z
            .string()
            .regex(/^shopify:[a-z0-9-]+$/)
            .optional(),
          after: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)
      try {
        return browseProductTaxonomy(input)
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a valid category or reopen its branch.",
        })
      }
    }),
  attributes: protectedProcedure
    .input(
      z
        .object({ categoryKey: z.string().regex(/^shopify:[a-z0-9-]+$/) })
        .strict(),
    )
    .query(({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)
      const result = readProductTaxonomyAttributes(input.categoryKey)
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Category not found.",
        })
      return result
    }),
  suggest: protectedProcedure
    .input(
      z
        .object({
          title: z.string().trim().min(2).max(160),
          storeId: z.string().min(1).max(128).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await suggestCatalogCategories(
          ctx.db,
          catalogPhotoActorScope(ctx, input.storeId),
          input.title,
        )
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
  list: protectedProcedure
    .input(
      z
        .object({ storeId: z.string().min(1).max(128).optional() })
        .strict()
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await listCatalogCategories(
          ctx.db,
          catalogPhotoActorScope(ctx, input?.storeId),
        )
      } catch (error) {
        if (error instanceof CatalogPhotoError)
          throw catalogPhotoTRPCError(error)
        throw error
      }
    }),
})
