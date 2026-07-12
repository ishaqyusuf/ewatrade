import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsSessionError,
  RetailOpsSubscriptionError,
  assertRetailOpsReportRangeAllowed,
  closeRetailOpsSession,
  listRetailOpsPaymentReconciliation,
  listRetailOpsSessions,
  openRetailOpsSession,
  reviewRetailOpsCloseoutSession,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCloseSessionSchema,
  retailOpsOpenSessionSchema,
  retailOpsReportRangeSchema,
  retailOpsReviewCloseoutSessionSchema,
  retailOpsSessionsSchema,
} from "../../schemas/retail-ops"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

function getSessionErrorCode(
  error: RetailOpsSessionError,
): "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" {
  if (error.code === "DUPLICATE_INVENTORY_LINE") return "BAD_REQUEST"
  if (error.code === "OPEN_SESSION_EXISTS") return "CONFLICT"
  if (error.code === "SESSION_NOT_CLOSED") return "CONFLICT"

  return "NOT_FOUND"
}

function getRetailOpsRole(role: string): EwaTradeRole {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use Retail Ops.",
    })
  }

  return normalizedRole
}

function getRetailOpsActorReadScope(role: string, userId: string) {
  const normalizedRole = getRetailOpsRole(role)

  return canManageSalesOperations(normalizedRole) ? undefined : userId
}

function assertCanOperateRetailOpsPos(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Retail Ops POS.",
    })
  }
}

function assertCanReviewRetailOpsCloseouts(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to review Retail Ops closeouts.",
    })
  }
}

async function assertRetailOpsReportHistoryAllowed(
  ctx: {
    db: TRPCContext["db"]
    tenantContext: NonNullable<TRPCContext["tenantContext"]>
  },
  input: {
    from?: Date
  },
) {
  try {
    await assertRetailOpsReportRangeAllowed(ctx.db, {
      from: input.from,
      tenantId: ctx.tenantContext.tenant.id,
    })
  } catch (error) {
    if (error instanceof RetailOpsSubscriptionError) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error.message,
      })
    }

    throw error
  }
}

function resolveStore(
  stores: Array<{
    id: string
    name: string
    slug: string
  }>,
  activeStore: {
    id: string
    name: string
    slug: string
  } | null,
  input: {
    storeId?: string
  },
) {
  if (input.storeId) {
    const store = stores.find(
      (currentStore) => currentStore.id === input.storeId,
    )

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this tenant.",
      })
    }

    return store
  }

  const store = activeStore ?? stores[0] ?? null

  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before opening Retail Ops.",
    })
  }

  return store
}

export const retailOpsSessionsRouter = createTRPCRouter({
  sessions: protectedProcedure
    .input(retailOpsSessionsSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsSessions(ctx.db, {
        from: input.from,
        limit: input.limit,
        status: input.status,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
        userId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
      })
    }),

  paymentReconciliation: protectedProcedure
    .input(retailOpsReportRangeSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsPaymentReconciliation(ctx.db, {
        from: input.from,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
        userId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
      })
    }),

  openSession: protectedProcedure
    .input(retailOpsOpenSessionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await openRetailOpsSession(ctx.db, {
          actorUserId: ctx.session.user.id,
          externalId: input.externalId,
          inventoryLines: input.inventoryLines,
          notes: input.notes,
          openedAt: input.openedAt,
          openingFloatMinor: input.openingFloatMinor,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsSessionError) {
          throw new TRPCError({
            code: getSessionErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  closeSession: protectedProcedure
    .input(retailOpsCloseSessionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateRetailOpsPos(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await closeRetailOpsSession(ctx.db, {
          actorUserId: ctx.session.user.id,
          cashierSessionId: input.cashierSessionId,
          closedAt: input.closedAt,
          closingFloatMinor: input.closingFloatMinor,
          declaredCardMinor: input.declaredCardMinor,
          declaredCreditMinor: input.declaredCreditMinor,
          declaredTransferMinor: input.declaredTransferMinor,
          externalId: input.externalId,
          inventoryLines: input.inventoryLines,
          notes: input.notes,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsSessionError) {
          throw new TRPCError({
            code: getSessionErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  reviewCloseoutSession: protectedProcedure
    .input(retailOpsReviewCloseoutSessionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanReviewRetailOpsCloseouts(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await reviewRetailOpsCloseoutSession(ctx.db, {
          actorUserId: ctx.session.user.id,
          cashierSessionId: input.cashierSessionId,
          note: input.note,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsSessionError) {
          throw new TRPCError({
            code: getSessionErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),
})
