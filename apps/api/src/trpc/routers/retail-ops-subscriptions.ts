import {
  type EwaTradeRole,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  createRetailOpsSubscriptionCheckoutIntent,
  getRetailOpsSubscriptionSnapshot,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { retailOpsCreateSubscriptionCheckoutIntentSchema } from "../../schemas/retail-ops"
import { createTRPCRouter, protectedProcedure } from "../init"

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

function assertCanViewRetailOpsSubscription(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to view Retail Ops billing.",
    })
  }
}

function assertCanManageRetailOpsBilling(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage Retail Ops billing.",
    })
  }
}

export const retailOpsSubscriptionsRouter = createTRPCRouter({
  subscription: protectedProcedure.query(async ({ ctx }) => {
    assertCanViewRetailOpsSubscription(ctx.tenantContext.membership.role)

    return getRetailOpsSubscriptionSnapshot(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  createSubscriptionCheckoutIntent: protectedProcedure
    .input(retailOpsCreateSubscriptionCheckoutIntentSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsBilling(ctx.tenantContext.membership.role)

      return createRetailOpsSubscriptionCheckoutIntent(ctx.db, {
        planId: input.planId,
        requestedByUserId: ctx.session.user.id,
        surface: input.surface,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})
