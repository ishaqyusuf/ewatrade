import { createHash } from "node:crypto"
import type { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"

export type AccountPrivacyProfilePolicy = {
  version: string
  approvalReference: string
  approvedAt: string
  mode: "PSEUDONYMIZE"
  legalAcceptanceDisposition: "ERASE" | "RETAIN"
  retentionPurpose: string
  reviewAt: string
  digest: string
}

/** Exact reviewed server configuration; absent or inconsistent authority stays closed. */
export function getApprovedAccountPrivacyProfilePolicy(
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): AccountPrivacyProfilePolicy | null {
  const source = environment.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON
  const approvedDigest =
    environment.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256
  const version = environment.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (
    !source ||
    !version ||
    !approvedDigest ||
    !/^[a-f0-9]{64}$/.test(approvedDigest)
  )
    return null
  const digest = createHash("sha256").update(source).digest("hex")
  if (digest !== approvedDigest) return null
  try {
    const value: unknown = JSON.parse(source)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const policy = value as Record<string, unknown>
    const keys = [
      "version",
      "approvalReference",
      "approvedAt",
      "mode",
      "legalAcceptanceDisposition",
      "retentionPurpose",
      "reviewAt",
    ]
    if (
      Object.keys(policy).length !== keys.length ||
      keys.some((key) => typeof policy[key] !== "string")
    )
      return null
    if (
      policy.version !== version ||
      policy.mode !== "PSEUDONYMIZE" ||
      !["ERASE", "RETAIN"].includes(String(policy.legalAcceptanceDisposition))
    )
      return null
    if (
      !String(policy.approvalReference).trim() ||
      !String(policy.retentionPurpose).trim()
    )
      return null
    const approvedAt = new Date(String(policy.approvedAt))
    const reviewAt = new Date(String(policy.reviewAt))
    if (
      !Number.isFinite(now.getTime()) ||
      !Number.isFinite(approvedAt.getTime()) ||
      !Number.isFinite(reviewAt.getTime()) ||
      approvedAt > now ||
      reviewAt <= now
    )
      return null
    if (
      approvedAt.toISOString() !== policy.approvedAt ||
      reviewAt.toISOString() !== policy.reviewAt
    )
      return null
    return { ...policy, digest } as AccountPrivacyProfilePolicy
  } catch {
    return null
  }
}

export function accountPrivacyPseudonymousEmail(
  requestId: string,
  subjectId: string,
) {
  const identifier = createHash("sha256")
    .update(`account-privacy-profile-v1:${requestId}:${subjectId}`)
    .digest("hex")
  return `deleted-${identifier}@deleted.invalid`
}

export function accountPrivacyProfileEvidence(input: {
  requestId: string
  subjectId: string
  policy: AccountPrivacyProfilePolicy
  legalAcceptanceCount: number
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        processor: "account-privacy-profile-v1",
        requestId: input.requestId,
        subjectId: input.subjectId,
        policyDigest: input.policy.digest,
        email: accountPrivacyPseudonymousEmail(
          input.requestId,
          input.subjectId,
        ),
        legalAcceptanceDisposition: input.policy.legalAcceptanceDisposition,
        remainingLegalAcceptances: input.legalAcceptanceCount,
        postcondition:
          "identity-profile-credentials-and-age-declarations-cleared",
      }),
    )
    .digest("hex")
}

/** Shared current-state proof for completion and verified-email status retries. */
export function isAccountPrivacyProfileMinimizationConfirmed(input: {
  request: {
    id: string
    requestKey: string
    userId: string | null
    verifiedSubjectUserId: string | null
    verifiedAt: Date | null
    contactEmail: string | null
    user: { email: string; emailVerified: boolean } | null
  }
  outcome: {
    userId: string
    processor: string
    policyVersion: string
    disposition: string
    processedAt: Date
    nextReviewAt: Date | null
    evidenceDigest: string
  }
  inventory: Awaited<ReturnType<typeof getAccountPrivacyProfileInventory>>
  policy: AccountPrivacyProfilePolicy
  now: Date
}) {
  const { request, outcome, inventory, policy, now } = input
  const subjectId = request.verifiedSubjectUserId
  return Boolean(
    subjectId &&
      request.userId === subjectId &&
      request.requestKey === `account-deletion:${subjectId}` &&
      request.contactEmail?.trim() &&
      request.verifiedAt &&
      request.verifiedAt <= now &&
      request.user?.email ===
        accountPrivacyPseudonymousEmail(request.id, subjectId) &&
      !request.user.emailVerified &&
      inventory.userExists &&
      !inventory.originalEmailRemains &&
      !inventory.personalFieldCount &&
      !inventory.authAccounts &&
      !inventory.sessions &&
      !inventory.verificationRows &&
      (policy.legalAcceptanceDisposition === "RETAIN" ||
        !inventory.legalAcceptances) &&
      outcome.userId === subjectId &&
      outcome.processor === "account-privacy-profile-v1" &&
      outcome.policyVersion === policy.version &&
      outcome.disposition === "RETENTION_APPROVED" &&
      outcome.processedAt >= request.verifiedAt &&
      outcome.processedAt <= now &&
      outcome.nextReviewAt?.toISOString() === policy.reviewAt &&
      outcome.evidenceDigest ===
        accountPrivacyProfileEvidence({
          requestId: request.id,
          subjectId,
          policy,
          legalAcceptanceCount: inventory.legalAcceptances,
        }),
  )
}
