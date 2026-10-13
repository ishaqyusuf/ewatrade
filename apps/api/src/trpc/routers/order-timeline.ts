import {
  CatalogError,
  getCommercialOrderChangeApprovalsForOrder,
  getCommercialOrderChangeOptions,
  getCommercialOrderChangePolicy,
  getCommercialOrderTimeline,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { orderChangeActor } from "./order-change-approvals"
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
      const actor = orderChangeActor(ctx.tenantContext.membership.role)
      const tenantId = ctx.tenantContext.tenant.id
      const activeStoreId = ctx.tenantContext.activeStore?.id ?? null
      try {
        const [options, approvals] = await Promise.all([
          getCommercialOrderChangeOptions(ctx.db, {
            activeStoreId,
            canAmend: actor.canManageMoney,
            isApprover: actor.isApprover,
            orderId: input.orderId,
            policy: activeStoreId
              ? await getCommercialOrderChangePolicy(ctx.db, {
                  storeId: activeStoreId,
                  tenantId,
                })
              : undefined,
            scope: await orderScope(ctx),
            tenantId,
          }),
          getCommercialOrderChangeApprovalsForOrder(ctx.db, {
            actorUserId: ctx.session.user.id,
            isApprover: actor.isApprover,
            orderId: input.orderId,
            tenantId,
          }),
        ])
        return { ...options, approvals }
      } catch (error) {
        notFound(error)
      }
    }),
}
