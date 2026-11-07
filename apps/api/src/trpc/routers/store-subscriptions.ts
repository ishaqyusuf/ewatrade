import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import type { PrismaClient } from "@ewatrade/db"
import {
  OwnerBillingPolicyError,
  createPrismaOwnerBillingRepository,
  enrollOwnerBusiness,
  findOwnerBillingAccount,
  getOrCreateOwnerBillingAccount,
  getOwnerBillingCatalogState,
  ownerBillingRuntime,
  removeOwnerBusiness,
} from "@ewatrade/db/owner-billing"
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

function requireOwnerBilling() {
  const runtime = ownerBillingRuntime()
  if (!runtime || process.env.STORE_BILLING_ENABLED !== "true")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Owner subscriptions are not available yet.",
    })
  return runtime
}

const OWNER_BILLING_ERROR_MESSAGES: Partial<
  Record<OwnerBillingPolicyError["code"], string>
> = {
  BUSINESS_LIMIT_REACHED:
    "Your plan covers all the businesses it can. Release one or upgrade to add this business.",
  SUBSCRIPTION_REQUIRED: "An active owner subscription is required.",
  BUSINESS_OWNER_REQUIRED: "Only the business owner can change its coverage.",
  OWNER_REQUIRED: "Only the subscription owner can change its coverage.",
  COVERAGE_CONFLICT: "This business is covered by another subscription.",
}

async function runOwnerCoverageCommand<T>(
  db: PrismaClient,
  actorUserId: string,
  run: (accountId: string) => Promise<T>,
) {
  const account = await findOwnerBillingAccount(db, actorUserId)
  if (!account)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "An active owner subscription is required.",
    })
  try {
    return await run(account.id)
  } catch (error) {
    if (!(error instanceof OwnerBillingPolicyError)) throw error
    throw new TRPCError({
      code:
        error.code === "OWNER_REQUIRED" ||
        error.code === "BUSINESS_OWNER_REQUIRED"
          ? "FORBIDDEN"
          : error.code === "COVERAGE_CONFLICT"
            ? "CONFLICT"
            : "PRECONDITION_FAILED",
      message:
        OWNER_BILLING_ERROR_MESSAGES[error.code] ??
        "Business coverage could not be changed.",
    })
  }
}

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
  catalog: protectedProcedure
    .input(
      z
        .object({ store: z.enum(["app_store", "play_store"]) })
        .strict()
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertManager(ctx.tenantContext.membership.role)
      const billingEnabled = process.env.STORE_BILLING_ENABLED === "true"
      const products = billingEnabled
        ? getStoreProducts().filter(
            (product) => !input?.store || product.store === input.store,
          )
        : []
      const checkoutConfigured =
        billingEnabled &&
        isNewStoreCheckoutConfigured(
          products,
          process.env,
          undefined,
          input?.store,
        )
      const { purchaseAvailable, legalAcceptanceRequired } =
        await getStoreCheckoutLegalGate(
          ctx.db,
          ctx.session.user.id,
          checkoutConfigured,
        )
      const billingState = await getCurrentStoreBillingState(
        ctx.db,
        ctx.tenantContext.tenant.id,
      )
      const ownerBilling = ownerBillingRuntime()
      if (ownerBilling) {
        // Owner-wide: only the paying owner may buy, and the receipt binds to
        // their account, not to the business that happens to be open.
        const isOwner = ctx.tenantContext.membership.role === "OWNER"
        const account =
          billingEnabled && products.length > 0 && isOwner
            ? await getOrCreateOwnerBillingAccount(ctx.db, ctx.session.user.id)
            : await findOwnerBillingAccount(ctx.db, ctx.session.user.id)
        const ownerState = account
          ? await getOwnerBillingCatalogState(ctx.db, {
              accountId: account.id,
              tenantId: ctx.tenantContext.tenant.id,
              environment: ownerBilling.environment,
            })
          : null
        return {
          billingScope: "owner" as const,
          coverageAvailable: billingEnabled && isOwner,
          products,
          purchaseAvailable: purchaseAvailable && isOwner,
          legalAcceptanceRequired,
          accountToken:
            billingEnabled && products.length > 0 && isOwner
              ? (account?.id ?? null)
              : null,
          activeProvider:
            ownerState?.activeProvider ?? billingState.activeProvider,
          activePlayProductId: ownerState?.activeProvider
            ? ownerState.activePlayProductId
            : billingState.activePlayProductId,
          ownerCoverage: ownerState
            ? {
                enrolled: ownerState.enrolled,
                planId: ownerState.access.planId,
                reason: ownerState.access.reason,
                businessLimit: ownerState.access.businessLimit,
                coveredBusinessCount: ownerState.access.coveredTenantIds.length,
              }
            : null,
        }
      }
      // A disabled or unmapped catalog is informational. Do not create a
      // purchase-binding account merely because a manager opens billing.
      const account =
        billingEnabled && products.length > 0
          ? await getStoreBillingAccount(ctx.db, ctx.tenantContext.tenant.id)
          : null
      return {
        billingScope: "business" as const,
        coverageAvailable: false,
        products,
        purchaseAvailable,
        legalAcceptanceRequired,
        accountToken: account?.id ?? null,
        ...billingState,
        ownerCoverage: null,
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
          actorUserId: ctx.session.user.id,
        })
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This purchase could not be verified for this business. Keep your receipt and try restoring it again.",
        })
      }
    }),
  /** Owner-wide: cover the open business with the owner's subscription. */
  enrollBusiness: protectedProcedure.mutation(async ({ ctx }) => {
    const runtime = requireOwnerBilling()
    return runOwnerCoverageCommand(
      ctx.db,
      ctx.session.user.id,
      async (accountId) => {
        const result = await enrollOwnerBusiness(
          createPrismaOwnerBillingRepository(ctx.db),
          {
            accountId,
            actorUserId: ctx.session.user.id,
            tenantId: ctx.tenantContext.tenant.id,
          },
          { environment: runtime.environment, now: () => new Date() },
        )
        return {
          action: result.action,
          planId: result.access.planId,
          reason: result.access.reason,
        }
      },
    )
  }),
  /** Releasing coverage keeps the business, its data and the purchase. */
  releaseBusiness: protectedProcedure
    .input(z.object({ tenantId: z.string().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      requireOwnerBilling()
      return runOwnerCoverageCommand(ctx.db, ctx.session.user.id, (accountId) =>
        removeOwnerBusiness(createPrismaOwnerBillingRepository(ctx.db), {
          accountId,
          actorUserId: ctx.session.user.id,
          tenantId: input.tenantId,
        }),
      )
    }),
})
