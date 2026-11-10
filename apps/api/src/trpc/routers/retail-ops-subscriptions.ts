import {
  type EwaTradeRole,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { getRetailOpsSubscriptionSnapshot } from "@ewatrade/db/queries"
import { ruleRejectedError } from "@ewatrade/errors"
import { TRPCError } from "@trpc/server"
import {
  checkWebSubscriptionPayment,
  createWebSubscriptionCheckout,
  getWebBillingSettings,
  manageWebSubscription,
} from "../../billing/web-subscriptions"
import { retailOpsCreateSubscriptionCheckoutIntentSchema } from "../../schemas/retail-ops"
import { createTRPCRouter, protectedProcedure } from "../init"

function paymentRequestFailed(message: string) {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message,
    cause: ruleRejectedError(new Error(message), "billing.webSubscription"),
  })
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

    const snapshot = await getRetailOpsSubscriptionSnapshot(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
    const webBilling =
      ctx.tenantContext.membership.role === "OWNER"
        ? await getWebBillingSettings(
            ctx.db,
            ctx.session.user.id,
            ctx.tenantContext.tenant.id,
          )
        : null
    return {
      ...snapshot,
      webBilling,
      plans: snapshot.plans.map((plan) => ({
        ...plan,
        priceLabel:
          webBilling?.prices.find((price) => price.planId === plan.id)?.label ??
          plan.priceLabel,
      })),
    }
  }),

  checkWebSubscriptionPayment: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.tenantContext.membership.role !== "OWNER")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the business owner can check a payment.",
      })
    try {
      return await checkWebSubscriptionPayment(ctx.db, ctx.session.user.id)
    } catch {
      throw paymentRequestFailed(
        "Payment has not been confirmed. Keep your receipt and check again shortly.",
      )
    }
  }),
  manageWebSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.tenantContext.membership.role !== "OWNER")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only the subscription owner can manage payments.",
      })
    try {
      return await manageWebSubscription(ctx.db, ctx.session.user.id)
    } catch {
      throw paymentRequestFailed(
        "Subscription management is not available yet. Keep your payment receipt.",
      )
    }
  }),
  createSubscriptionCheckoutIntent: protectedProcedure
    .input(retailOpsCreateSubscriptionCheckoutIntentSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsBilling(ctx.tenantContext.membership.role)

      if (input.surface === "mobile") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Mobile software plans require an App Store or Google Play purchase. Store subscriptions are not available yet.",
        })
      }

      if (ctx.tenantContext.membership.role !== "OWNER")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the business owner can pay for a software plan.",
        })
      const snapshot = await getRetailOpsSubscriptionSnapshot(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
      })
      const targetPlan = snapshot.plans.find((plan) => plan.id === input.planId)
      if (!targetPlan)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan." })
      const checkout = await createWebSubscriptionCheckout(ctx.db, {
        planId: input.planId,
        actorUserId: ctx.session.user.id,
        email: ctx.session.user.email,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return {
        checkoutUrl: checkout.checkoutUrl,
        createdAt: new Date().toISOString(),
        currentPlan: snapshot.plan,
        intent: {
          id: checkout.checkoutId,
          requestedByUserId: ctx.session.user.id,
          status: "checkout_ready" as const,
          surface: input.surface,
        },
        message:
          "Continue to Paystack to pay. Access changes only after payment is verified.",
        provider: "paystack" as const,
        subscription: snapshot.subscription,
        targetPlan,
        tenant: snapshot.tenant,
      }
    }),
})
