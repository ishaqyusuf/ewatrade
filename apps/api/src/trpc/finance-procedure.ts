import { CatalogError, FinanceError } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { protectedProcedure } from "./init"

/** Shared Owner/Admin gate and FinanceError mapping for finance-owned writes. */
export const financeProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (
      !["OWNER", "ADMIN"].includes(
        ctx.tenantContext.membership.role.toUpperCase(),
      )
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only Owners and Admins can manage finance.",
      })
    }
    const result = await next({
      ctx: {
        ...ctx,
        financeActor: {
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        },
      },
    })
    if (!result.ok && result.error.cause instanceof FinanceError) {
      const error = result.error.cause
      throw new TRPCError({
        code:
          error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
                ? "CONFLICT"
                : "BAD_REQUEST",
        message: error.message,
        cause: error,
      })
    }
    if (!result.ok && result.error.cause instanceof CatalogError) {
      const error = result.error.cause
      throw new TRPCError({
        code:
          error.code === "STORE_NOT_FOUND"
            ? "NOT_FOUND"
            : [
                  "REVISION_CONFLICT",
                  "STALE_CONFIGURATION",
                  "IDEMPOTENCY_MISMATCH",
                  "INSUFFICIENT_STOCK",
                ].includes(error.code)
              ? "CONFLICT"
              : "BAD_REQUEST",
        message: error.message,
        cause: error,
      })
    }
    return result
  },
)
