import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  PlayRefundReviewResponseError,
  getCurrentStoreBillingState,
  getPlayRefundReviewQueue,
  getStoreBillingAccount,
  isPlayRefundReviewSubmissionEnabled,
  preparePlayRefundReviewResponse,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { reconcileStoreSubscription } from "../../billing/reconcile-store-subscription"
import { getStoreCheckoutLegalGate } from "../../billing/store-checkout-legal"
import { isNewStoreCheckoutConfigured } from "../../billing/store-checkout-readiness"
import { getStoreProducts } from "../../billing/store-products"
import { submitPlayRefundReviewResponse } from "../../billing/submit-play-refund-review"
import {
  createTRPCRouter,
  platformAdminProcedure,
  protectedProcedure,
} from "../init"

function assertManager(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageTenant(normalized))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Business billing permission is required.",
    })
}

export const storeSubscriptionsRouter = createTRPCRouter({
  refundReviewQueue: platformAdminProcedure.query(({ ctx }) =>
    getPlayRefundReviewQueue(ctx.db),
  ),
  prepareRefundReviewResponse: platformAdminProcedure
    .input(
      z
        .object({
          caseId: z.string().min(1),
          preference: z.enum(["APPROVE", "DECLINE", "NEUTRAL"]),
          sampleContentProvided: z.boolean(),
          decisionEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isPlayRefundReviewSubmissionEnabled(process.env))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Play refund-review preparation is unavailable.",
        })
      const policyVersion =
        process.env.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION?.trim()
      if (!policyVersion) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Play refund-review response policy is unavailable.",
        })
      }
      try {
        return await preparePlayRefundReviewResponse(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          policyVersion,
        })
      } catch (error) {
        if (error instanceof PlayRefundReviewResponseError)
          throw new TRPCError({
            code:
              error.code === "RESPONSE_CONFLICT"
                ? "CONFLICT"
                : "PRECONDITION_FAILED",
            message: "Play refund-review response could not be prepared.",
          })
        throw error
      }
    }),
  submitRefundReviewResponse: platformAdminProcedure
    .input(z.object({ responseId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await submitPlayRefundReviewResponse(ctx.db, input.responseId)
      } catch (error) {
        if (error instanceof PlayRefundReviewResponseError)
          throw new TRPCError({
            code:
              error.code === "RESPONSE_CONFLICT"
                ? "CONFLICT"
                : "PRECONDITION_FAILED",
            message: "Play refund-review response could not be submitted.",
          })
        throw error
      }
    }),
  catalog: protectedProcedure.query(async ({ ctx }) => {
    assertManager(ctx.tenantContext.membership.role)
    const billingEnabled = process.env.STORE_BILLING_ENABLED === "true"
    const products = billingEnabled ? getStoreProducts() : []
    const checkoutConfigured =
      billingEnabled && isNewStoreCheckoutConfigured(products)
    const { purchaseAvailable, legalAcceptanceRequired } =
      await getStoreCheckoutLegalGate(
        ctx.db,
        ctx.session.user.id,
        checkoutConfigured,
      )
    // A disabled or unmapped catalog is informational. Do not create a
    // purchase-binding account merely because a manager opens billing.
    const account =
      billingEnabled && products.length > 0
        ? await getStoreBillingAccount(ctx.db, ctx.tenantContext.tenant.id)
        : null
    const billingState = await getCurrentStoreBillingState(
      ctx.db,
      ctx.tenantContext.tenant.id,
    )
    return {
      products,
      purchaseAvailable,
      legalAcceptanceRequired,
      accountToken: account?.id ?? null,
      ...billingState,
    }
  }),
  verifyPurchase: protectedProcedure
    .input(
      z
        .object({
          store: z.enum(["app_store", "play_store"]),
          purchaseId: z.string().min(1).max(8192),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertManager(ctx.tenantContext.membership.role)
      if (process.env.STORE_BILLING_ENABLED !== "true")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Store subscriptions are not available yet.",
        })
      try {
        return await reconcileStoreSubscription(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This purchase could not be verified for this business. Keep your receipt and try restoring it again.",
        })
      }
    }),
})
