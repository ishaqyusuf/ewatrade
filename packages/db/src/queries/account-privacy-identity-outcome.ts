import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyConversationInventory } from "./account-privacy-conversation-inventory"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"

export type AccountPrivacyIdentityOutcomeCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "IDENTITY_ACCESS_REMAINS"
  | "GUEST_ACCESS_REVIEW_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyIdentityOutcomeError extends Error {
  constructor(readonly code: AccountPrivacyIdentityOutcomeCode) {
    super(code)
    this.name = "AccountPrivacyIdentityOutcomeError"
  }
}

/** Certifies revoked account access only when no linked guest-device history exists. */
export async function confirmAccountPrivacyIdentityAccessRevoked(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_IDENTITY_OUTCOME_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyIdentityOutcomeError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!policyVersion)
    throw new AccountPrivacyIdentityOutcomeError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyIdentityOutcomeError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          requestKey: true,
          userId: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
          contactEmail: true,
          status: true,
          user: { select: { email: true, emailVerified: true } },
          accessRevocation: { select: { status: true, userId: true } },
        },
      })
      if (!request) throw new AccountPrivacyIdentityOutcomeError("NOT_FOUND")
      const subjectId = request.userId
      const verifiedEmail = request.user?.email.trim().toLowerCase()
      if (
        !subjectId ||
        subjectId === input.operatorUserId ||
        request.requestKey !== `account-deletion:${subjectId}` ||
        request.verifiedSubjectUserId !== subjectId ||
        !request.verifiedAt ||
        request.status !== "PROCESSING" ||
        !request.user?.emailVerified ||
        !verifiedEmail ||
        !request.contactEmail ||
        request.contactEmail.trim().toLowerCase() !== verifiedEmail
      )
        throw new AccountPrivacyIdentityOutcomeError("IDENTITY_REVIEW_REQUIRED")
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== subjectId
      )
        throw new AccountPrivacyIdentityOutcomeError(
          "ACCESS_REVOCATION_REQUIRED",
        )

      // A completed stage can become stale after a new session or OTP. The
      // final transition checks again; this command must also refuse stale
      // access before its first write and on every replay.
      const sessions = await tx.session.count({
        where: { userId: subjectId, expiresAt: { gt: now } },
      })
      const providerTokens = await tx.account.count({
        where: {
          userId: subjectId,
          OR: [
            { accessToken: { not: null } },
            { refreshToken: { not: null } },
            { idToken: { not: null } },
          ],
        },
      })
      const pushEndpoints = await tx.storeConversationPushEndpoint.count({
        where: { accountUserId: subjectId, revokedAt: null },
      })
      const liveOtp = await tx.verification.count({
        where: {
          identifier: { in: mobileOtpIdentifiersForEmail(verifiedEmail) },
          expiresAt: { gt: now },
        },
      })
      if (sessions || providerTokens || pushEndpoints || liveOtp)
        throw new AccountPrivacyIdentityOutcomeError("IDENTITY_ACCESS_REMAINS")

      // Account-linked Guest identities can have other owners or grants.
      // Certify only the empty-history case; never revoke them by inference.
      const historicalLinks = await tx.storeConversationAccountAccess.count({
        where: { accountUserId: subjectId },
      })
      const privacyRequests = await tx.storeConversationPrivacyRequest.count({
        where: { accountUserId: subjectId },
      })
      const historicalCandidates =
        await tx.storeConversationWhatsAppCandidate.count({
          where: {
            OR: [
              { accountUserId: subjectId },
              { accountAccess: { is: { accountUserId: subjectId } } },
            ],
          },
        })
      const directAttribution = await getAccountPrivacyConversationInventory(
        tx,
        subjectId,
      )
      if (
        historicalLinks ||
        privacyRequests ||
        historicalCandidates ||
        Object.values(directAttribution).some((count) => count > 0)
      )
        throw new AccountPrivacyIdentityOutcomeError(
          "GUEST_ACCESS_REVIEW_REQUIRED",
        )

      const existing = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: {
            requestId: request.id,
            domain: "IDENTITY_ACCESS",
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
          existing.disposition !== "ACCESS_REVOKED" ||
          existing.processor !== "account-privacy-identity-empty-v1" ||
          existing.policyVersion !== policyVersion
        )
          throw new AccountPrivacyIdentityOutcomeError("CLAIM_CONFLICT")
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
            accessRevocation: "REVOKED",
            sessions,
            providerTokens,
            pushEndpoints,
            liveOtp,
            historicalLinks,
            privacyRequests,
            historicalCandidates,
            directAttribution,
          }),
        )
        .digest("hex")
      await tx.accountPrivacyDomainOutcome.create({
        data: {
          requestId: request.id,
          userId: subjectId,
          domain: "IDENTITY_ACCESS",
          disposition: "ACCESS_REVOKED",
          processor: "account-privacy-identity-empty-v1",
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
