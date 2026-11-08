import { z } from "zod"
import {
  SUBSCRIPTION_PRIVACY_FAMILIES,
  subscriptionPrivacyDigest,
} from "./account-privacy-subscription-inventory"

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const subscriptionRetentionPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    mode: z.literal("MINIMUM_NECESSARY_BILLING_RETENTION"),
    approvedAt: z.iso.datetime(),
    documentDigest: digest,
    maximumReviewMonths: z.literal(12),
    maximumHoldDays: z.literal(90),
  })
  .strict()
export function getApprovedSubscriptionRetentionPolicy(now: Date) {
  try {
    const policy = subscriptionRetentionPolicySchema.parse(
      JSON.parse(
        process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON ?? "null",
      ),
    )
    const policyDigest = subscriptionPrivacyDigest(policy)
    if (
      policy.version !==
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim() ||
      policyDigest !==
        process.env.ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256 ||
      new Date(policy.approvedAt) > now
    )
      return null
    return { ...policy, policyDigest }
  } catch {
    return null
  }
}
export const subscriptionRetentionDecisionSchema = z
  .object({
    family: z.enum(SUBSCRIPTION_PRIVACY_FAMILIES),
    purpose: z.enum([
      "PAYMENT_RECONCILIATION",
      "REFUND_DISPUTE",
      "RECEIPT_ANTI_REPLAY",
      "STATUTORY_RECORD",
    ]),
    // Restricted evidence locator digest, not arbitrary prose or provider material.
    necessityEvidenceDigest: digest,
    basisEvidenceDigest: digest,
    nextReviewAt: z.iso.datetime(),
    basis: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("EXPIRY"), expiresAt: z.iso.datetime() })
        .strict(),
      z
        .object({
          kind: z.literal("HOLD"),
          reason: z.enum(["LEGAL_HOLD", "UNRESOLVED_DISPUTE"]),
          reviewAt: z.iso.datetime(),
        })
        .strict(),
    ]),
  })
  .strict()
export const reviewAccountPrivacySubscriptionsSchema = z
  .object({
    requestId: z.string().min(1),
    expectedInventoryDigest: digest,
    policyDigest: digest,
    controllerEvidenceDigest: digest,
    minimumNecessaryReviewed: z.literal(true),
    controllerAuthorityReviewed: z.literal(true),
    shorterPoliciesAndHoldsReviewed: z.literal(true),
    storeCancellationIsSeparate: z.literal(true),
    decisions: z
      .array(subscriptionRetentionDecisionSchema)
      .min(1)
      .max(SUBSCRIPTION_PRIVACY_FAMILIES.length),
  })
  .strict()
export type SubscriptionRetentionDecision = z.infer<
  typeof subscriptionRetentionDecisionSchema
>
export const reassessAccountPrivacySubscriptionsSchema =
  reviewAccountPrivacySubscriptionsSchema
    .omit({ requestId: true })
    .extend({ reviewId: z.string().min(1) })
    .strict()

export function subscriptionReviewDeadline(
  decisions: SubscriptionRetentionDecision[],
  now: Date,
): Date | null {
  const annual = new Date(now)
  annual.setUTCFullYear(annual.getUTCFullYear() + 1)
  let deadline = annual.getTime()
  for (const decision of decisions) {
    const review = new Date(decision.nextReviewAt).getTime()
    const basisDeadline = new Date(
      decision.basis.kind === "EXPIRY"
        ? decision.basis.expiresAt
        : decision.basis.reviewAt,
    ).getTime()
    if (
      review <= now.getTime() ||
      review > annual.getTime() ||
      basisDeadline <= now.getTime() ||
      review > basisDeadline
    )
      return null
    if (
      decision.basis.kind === "HOLD" &&
      basisDeadline > now.getTime() + 90 * 86400000
    )
      return null
    deadline = Math.min(deadline, review, basisDeadline)
  }
  return new Date(deadline)
}
