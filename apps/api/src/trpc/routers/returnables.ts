import {
  CatalogError,
  RETURNABLE_MOVEMENT_MAX_QUANTITY,
  RETURNABLE_MOVEMENT_NOTE_MAX_LENGTH,
  listReturnableBalances,
  listReturnableItems,
  listReturnableMovements,
  readOrderReturnables,
  recordReturnableMovement,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders } from "./orders"

const id = z.string().trim().min(1).max(128)

export const returnableRecordSchema = z
  .object({
    clientMovementId: z.string().trim().min(8).max(160),
    customerId: id,
    catalogItemId: id,
    orderId: id.optional(),
    kind: z.enum(["ISSUED", "RETURNED", "WRITTEN_OFF"]),
    quantity: z.number().int().min(1).max(RETURNABLE_MOVEMENT_MAX_QUANTITY),
    note: z.string().trim().max(RETURNABLE_MOVEMENT_NOTE_MAX_LENGTH).optional(),
  })
  .strict()

const NOT_FOUND = new Set([
  "CUSTOMER_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "RETURNABLE_NOT_FOUND",
])

function returnableError(error: unknown): never {
  if (error instanceof CatalogError)
    throw new TRPCError({
      cause: error,
      code: NOT_FOUND.has(error.code)
        ? "NOT_FOUND"
        : error.code === "IDEMPOTENCY_MISMATCH" ||
            error.code === "RETURNABLE_OVER_BALANCE"
          ? "CONFLICT"
          : "BAD_REQUEST",
      message: error.message,
    })
  throw error
}

/** Crates, cylinders and other items customers hold and bring back. */
export const returnablesRouter = createTRPCRouter({
  /** Items set up as Returnable, for checkout and Record return pickers. */
  items: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    return listReturnableItems(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  /** Outstanding balances per customer and item (all customers, or one). */
  balances: protectedProcedure
    .input(
      z
        .object({
          customerId: id.optional(),
          catalogItemId: id.optional(),
          includeSettled: z.boolean().optional(),
        })
        .strict()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return listReturnableBalances(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  movements: protectedProcedure
    .input(
      z
        .object({
          customerId: id.optional(),
          orderId: id.optional(),
          catalogItemId: id.optional(),
          cursor: id.optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      return listReturnableMovements(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  forOrder: protectedProcedure
    .input(z.object({ orderId: id }).strict())
    .query(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await readOrderReturnables(ctx.db, {
          orderId: input.orderId,
          scope: await orderScope(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        returnableError(error)
      }
    }),

  /** Went out, came back or written off; idempotent per clientMovementId. */
  record: protectedProcedure
    .input(returnableRecordSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await recordReturnableMovement(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          scope: await orderScope(ctx),
          storeId: ctx.tenantContext.activeStore?.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        returnableError(error)
      }
    }),
})
