import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { globalSearch } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import { globalSearchSchema } from "../../schemas/search"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"

export const searchRouter = createTRPCRouter({
  global: protectedProcedure
    .input(globalSearchSchema)
    .query(async ({ ctx, input }) => {
      const role = normalizeRole(ctx.tenantContext.membership.role)
      if (!role || !canOperatePos(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to search workspace records.",
        })
      }

      return globalSearch(ctx.db, {
        ...input,
        orderScope: await orderScope(ctx),
        canSearchStaff: canManageSalesOperations(role),
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})
