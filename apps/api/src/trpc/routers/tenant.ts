import { createTenantStore } from "@ewatrade/db/queries"
import { createTRPCRouter, protectedProcedure } from "../init"
import { createStoreSchema } from "../../schemas/tenant"

export const tenantRouter = createTRPCRouter({
  current: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext
  }),

  stores: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext.stores
  }),

  createStore: protectedProcedure
    .input(createStoreSchema)
    .mutation(async ({ ctx, input }) => {
      return createTenantStore(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
        ...input,
      })
    }),
})
