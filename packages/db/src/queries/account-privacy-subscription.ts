import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"

export type AccountPrivacySubscriptionCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "MEMBERSHIP_REVOCATION_REQUIRED"
  | "SUBSCRIPTION_REVIEW_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacySubscriptionError extends Error {
  constructor(readonly code: AccountPrivacySubscriptionCode) {
    super(code)
    this.name = "AccountPrivacySubscriptionError"
  }
}

/** Certifies only the narrow no-data case; never cancels a Tenant's plan. */
export async function confirmNoAccountPrivacySubscriptions(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacySubscriptionError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!policyVersion)
    throw new AccountPrivacySubscriptionError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacySubscriptionError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          userId: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
          contactEmail: true,
          status: true,
          user: { select: { email: true, emailVerified: true } },
          accessRevocation: { select: { status: true, userId: true } },
        },
      })
      if (!request) throw new AccountPrivacySubscriptionError("NOT_FOUND")
      const subjectId = request.userId
      if (
        !subjectId ||
        subjectId === input.operatorUserId ||
        request.verifiedSubjectUserId !== subjectId ||
        !request.verifiedAt ||
        request.status !== "PROCESSING" ||
        !request.user?.emailVerified ||
        !request.contactEmail ||
        request.contactEmail.trim().toLowerCase() !==
          request.user.email.trim().toLowerCase()
      )
        throw new AccountPrivacySubscriptionError("IDENTITY_REVIEW_REQUIRED")
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== subjectId
      )
        throw new AccountPrivacySubscriptionError("ACCESS_REVOCATION_REQUIRED")

      // Removed Membership rows preserve the historical Tenant scope until
      // account-profile disposition. Query before physical User removal.
      const memberships = await tx.membership.findMany({
        where: { userId: subjectId },
        select: { tenantId: true, status: true },
      })
      if (memberships.some((membership) => membership.status !== "REMOVED"))
        throw new AccountPrivacySubscriptionError(
          "MEMBERSHIP_REVOCATION_REQUIRED",
        )
      const tenantIds = [...new Set(memberships.map((row) => row.tenantId))]
      const membershipOutcome = await tx.accountPrivacyDomainOutcome.findUnique(
        {
          where: {
            requestId_domain: { requestId: request.id, domain: "MEMBERSHIP" },
          },
          select: { userId: true, policyVersion: true, disposition: true },
        },
      )
      if (
        membershipOutcome?.userId !== subjectId ||
        membershipOutcome.policyVersion !== policyVersion ||
        !["ACCESS_REVOKED", "NOT_APPLICABLE"].includes(
          membershipOutcome.disposition,
        ) ||
        (tenantIds.length > 0 &&
          membershipOutcome.disposition === "NOT_APPLICABLE")
      )
        throw new AccountPrivacySubscriptionError(
          "MEMBERSHIP_REVOCATION_REQUIRED",
        )
      const initiatedCheckouts = await tx.billingCheckoutSession.count({
        where: { requestedByUserId: subjectId },
      })
      const refundReviewActions = await tx.playRefundReviewResponse.count({
        where: { actorUserId: subjectId },
      })
      // A Tenant plan is not automatically the person's plan. A linked paid
      // plan still needs human allocation/review before no-data certification.
      const storePurchases = await tx.storeSubscriptionPurchase.count({
        where: { tenantId: { in: tenantIds } },
      })
      const providerSubscriptions = await tx.tenantSubscription.count({
        where: {
          tenantId: { in: tenantIds },
          provider: { not: "NONE" },
        },
      })
      const billingInvoices = await tx.billingInvoice.count({
        where: { tenantId: { in: tenantIds } },
      })
      if (
        initiatedCheckouts ||
        refundReviewActions ||
        storePurchases ||
        providerSubscriptions ||
        billingInvoices
      )
        throw new AccountPrivacySubscriptionError(
          "SUBSCRIPTION_REVIEW_REQUIRED",
        )

      const existing = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: {
            requestId: request.id,
            domain: "SOFTWARE_SUBSCRIPTIONS",
          },
        },
        select: {
          userId: true,
          disposition: true,
          processor: true,
          policyVersion: true,
        },
      })
      if (existing) {
        if (
          existing.userId !== subjectId ||
          existing.disposition !== "NOT_APPLICABLE" ||
          existing.processor !== "account-privacy-subscription-empty-v1" ||
          existing.policyVersion !== policyVersion
        )
          throw new AccountPrivacySubscriptionError("CLAIM_CONFLICT")
        return { requestId: request.id, outcomeRecorded: true, replay: true }
      }
      const evidenceDigest = createHash("sha256")
        .update(
          JSON.stringify({
            requestId: request.id,
            subjectId,
            operatorUserId: input.operatorUserId,
            policyVersion,
            processedAt: now.toISOString(),
            tenantIds,
            initiatedCheckouts,
            refundReviewActions,
            storePurchases,
            providerSubscriptions,
            billingInvoices,
          }),
        )
        .digest("hex")
      await tx.accountPrivacyDomainOutcome.create({
        data: {
          requestId: request.id,
          userId: subjectId,
          domain: "SOFTWARE_SUBSCRIPTIONS",
          disposition: "NOT_APPLICABLE",
          processor: "account-privacy-subscription-empty-v1",
          policyVersion,
          evidenceDigest,
          processedAt: now,
        },
      })
      return { requestId: request.id, outcomeRecorded: true, replay: false }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}
