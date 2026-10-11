import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
import {
  CatalogError,
  getCommercialOrderChangeOptions,
  getCommercialOrderTimeline,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders } from "./orders"

const orderInput = z.object({ orderId: z.string().trim().min(1) }).strict()

function notFound(error: unknown): never {
  if (error instanceof CatalogError && error.code === "ORDER_NOT_FOUND")
    throw new TRPCError({
      cause: error,
      code: "NOT_FOUND",
      message: "Commercial Order not found.",
    })
  throw error
}

/** Order history and the Change menu, with the same visibility as orders.get. */
export const orderTimelineProcedures = {
  timeline: protectedProcedure
    .input(orderInput)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await getCommercialOrderTimeline(ctx.db, {
          orderId: input.orderId,
          scope: await orderScope(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        notFound(error)
      }
    }),

  changeOptions: protectedProcedure
    .input(orderInput)
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const role = normalizeRole(ctx.tenantContext.membership.role)
      try {
        return await getCommercialOrderChangeOptions(ctx.db, {
          activeStoreId: ctx.tenantContext.activeStore?.id ?? null,
          canAmend: Boolean(role && canManageSalesOperations(role)),
          orderId: input.orderId,
          scope: await orderScope(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        notFound(error)
      }
    }),
}
