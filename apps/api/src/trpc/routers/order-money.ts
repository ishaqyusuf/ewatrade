import {
  CatalogError,
  FinanceError,
  getCommercialOrderChangePolicy,
  orderChangeRequirement,
  refundCommercialOrder,
  returnCommercialOrderItems,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { exactOrderQuantitySchema } from "../../schemas/orders"
import { protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import {
  assertDirectOrderChange,
  orderChangeActor,
} from "./order-change-approvals"
import { assertCanOperateOrders, orderError } from "./orders"

const method = z.enum(["bank_transfer", "card", "cash", "other", "pos"])
const command = {
  orderId: z.string().trim().min(1),
  clientOperationId: z.string().trim().min(8).max(120),
  reason: z.string().trim().min(1).max(500),
}

export const orderRefundSchema = z
  .object({
    ...command,
    amountMinor: z.number().int().positive().max(100_000_000),
    moneyAccountId: z.string().trim().min(1).max(128).optional(),
    method,
    reference: z.string().trim().max(160).optional(),
    /** Overcharged: the order total drops by the refund too. */
    lowerTotal: z.boolean(),
  })
  .strict()

export const orderReturnItemsSchema = z
  .object({
    ...command,
    lines: z
      .array(
        z
          .object({
            orderLineId: z.string().trim().min(1),
            quantity: exactOrderQuantitySchema,
            disposition: z.enum([
              "damaged",
              "no_restock",
              "quarantine",
              "restock",
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    /** Credit the returned value and give back what was overpaid. */
    money: z
      .object({
        moneyAccountId: z.string().trim().min(1).max(128).optional(),
        method,
        reference: z.string().trim().max(160).optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

/** The order must be visible to the caller and belong to their active Store. */
async function orderInActiveStore(
  ctx: Parameters<typeof orderScope>[0],
  orderId: string,
) {
  const storeId = ctx.tenantContext.activeStore?.id
  const order = await ctx.db.commercialOrder.findFirst({
    where: {
      ...(await orderScope(ctx)),
      id: orderId,
      tenantId: ctx.tenantContext.tenant.id,
    },
    select: { storeId: true },
  })
  if (!order)
    throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." })
  if (!storeId || order.storeId !== storeId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Switch to this order's store to change it.",
    })
  return storeId
}

function mapped(error: unknown): never {
  if (error instanceof CatalogError || error instanceof FinanceError)
    throw orderError(error)
  throw error
}

/** Money back and items back, with an order credit so nothing reopens. */
export const orderMoneyProcedures = {
  refund: protectedProcedure
    .input(orderRefundSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = await orderInActiveStore(ctx, input.orderId)
      const policy = await getCommercialOrderChangePolicy(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      // Open: Owner/Admin/Manager; Needs approval: Owner/Admin; Off: nobody.
      assertDirectOrderChange(
        orderChangeRequirement(policy, {
          action: "refund",
          ...orderChangeActor(ctx.tenantContext.membership.role),
        }),
        "refund",
      )
      try {
        return await refundCommercialOrder(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),

  returnItems: protectedProcedure
    .input(orderReturnItemsSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      const storeId = await orderInActiveStore(ctx, input.orderId)
      const policy = await getCommercialOrderChangePolicy(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      const actor = orderChangeActor(ctx.tenantContext.membership.role)
      // Giving money back is an owner or manager decision when the Store is open.
      assertDirectOrderChange(
        orderChangeRequirement(policy, {
          action: "return",
          withMoney: Boolean(input.money),
          ...actor,
        }),
        "return",
      )
      // Whether money may also go back is known once the refund is worked out.
      const cashBack = orderChangeRequirement(policy, {
        action: "return",
        cashBack: true,
        withMoney: true,
        ...actor,
      })
      try {
        return await returnCommercialOrderItems(ctx.db, {
          ...input,
          cashBackBlockedReason:
            cashBack.kind === "blocked"
              ? cashBack.reason
              : cashBack.kind === "ask"
                ? "Giving money back needs an owner or admin's approval. Ask for approval instead"
                : null,
          money: input.money ?? null,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),
}
