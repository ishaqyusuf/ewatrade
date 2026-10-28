import { CatalogPhotoError } from "@ewatrade/db/catalog-photos"
import {
  CatalogError,
  readCatalogStorefrontPolicy,
  setCatalogStorefrontPolicy,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { catalogPhotoActorScope } from "../../catalog/photo-access"
import { createTRPCRouter, protectedProcedure } from "../init"
import { catalogPhotoTRPCError } from "./catalog-photos"

async function result<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CatalogPhotoError) throw catalogPhotoTRPCError(error)
    if (error instanceof CatalogError)
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
    throw error
  }
}

const target = z.object({
  storeId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  catalogItemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
})

export const catalogStorefrontRouter = createTRPCRouter({
  get: protectedProcedure.input(target.strict()).query(({ ctx, input }) =>
    result(() =>
      readCatalogStorefrontPolicy(ctx.db, {
        ...catalogPhotoActorScope(ctx, input.storeId),
        catalogItemId: input.catalogItemId,
      }),
    ),
  ),
  save: protectedProcedure
    .input(
      target
        .extend({
          unavailable: z.boolean(),
          allowBookAhead: z.boolean(),
          expectedRevision: z.number().int().nonnegative(),
          clientOperationId: z.string().min(8).max(160),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      result(() =>
        setCatalogStorefrontPolicy(ctx.db, {
          ...input,
          ...catalogPhotoActorScope(ctx, input.storeId),
        }),
      ),
    ),
})
