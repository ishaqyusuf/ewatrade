import { listCatalogCategories } from "@ewatrade/db/catalog-categories"
import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import { z } from "zod"
import { suggestCatalogCategories } from "../../catalog/category-suggestions"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import { createTRPCRouter, protectedProcedure } from "../init"
import { catalogPhotoTRPCError } from "./catalog-photos"

export const catalogCategoriesRouter = createTRPCRouter({
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
