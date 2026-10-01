import type { PrismaClient } from "../../generated/prisma/client"

export type AccountPrivacyConversationAccessCode =
  | "DISABLED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyConversationAccessError extends Error {
  constructor(readonly code: AccountPrivacyConversationAccessCode) {
    super(code)
    this.name = "AccountPrivacyConversationAccessError"
  }
}

/** Stops only account-bound conversation access; shared Guest access is untouched. */
export async function revokeAccountPrivacyConversationAccess(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED !==
      "true"
  )
    throw new AccountPrivacyConversationAccessError("DISABLED")

  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyConversationAccessError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          userId: true,
          verifiedSubjectUserId: true,
          verifiedAt: true,
          status: true,
          accessRevocation: { select: { status: true, userId: true } },
        },
      })
      if (!request) throw new AccountPrivacyConversationAccessError("NOT_FOUND")
      if (
        !request.userId ||
        !request.verifiedAt ||
        request.status !== "PROCESSING" ||
        request.verifiedSubjectUserId !== request.userId ||
        request.userId === input.operatorUserId
      )
        throw new AccountPrivacyConversationAccessError(
          "IDENTITY_REVIEW_REQUIRED",
        )
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== request.userId
      )
        throw new AccountPrivacyConversationAccessError(
          "ACCESS_REVOCATION_REQUIRED",
        )

      const subjectId = request.userId
      const accesses = await tx.storeConversationAccountAccess.findMany({
        where: { accountUserId: subjectId },
        select: { id: true },
      })
      const accessIds = accesses.map((access) => access.id)
      const bridgeRows = await tx.storeConversationWhatsAppBridge.findMany({
        where: { accountAccessId: { in: accessIds } },
        select: { id: true },
      })
      const bridgeIds = bridgeRows.map((bridge) => bridge.id)
      const candidateRows =
        await tx.storeConversationWhatsAppCandidate.findMany({
          where: {
            OR: [
              { accountUserId: subjectId },
              { accountAccessId: { in: accessIds } },
            ],
          },
          select: { id: true },
        })
      const candidateIds = candidateRows.map((candidate) => candidate.id)

      // Revoke consumable capabilities and queued prompts before their parent
      // routes. Claim/send paths recheck route status; claimed outbound sends
      // already in flight still need provider/runtime reconciliation.
      const bridgeChoices =
        await tx.storeConversationWhatsAppBridgeChoiceCapability.updateMany({
          where: { bridgeId: { in: bridgeIds }, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: now },
        })
      const bridgeAttempts =
        await tx.storeConversationWhatsAppBridgeAttempt.updateMany({
          where: {
            bridgeId: { in: bridgeIds },
            status: { in: ["PENDING", "FAILED"] },
          },
          data: {
            status: "CANCELLED",
            claimToken: null,
            claimExpiresAt: null,
            nextAttemptAt: null,
            failureCode: "account_privacy_access_revoked",
          },
        })
      const candidateChoices =
        await tx.storeConversationWhatsAppCandidateActionCapability.updateMany({
          where: { candidateId: { in: candidateIds }, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: now },
        })
      const candidateAttempts =
        await tx.storeConversationWhatsAppCandidateAttempt.updateMany({
          where: {
            candidateId: { in: candidateIds },
            status: { in: ["PENDING", "FAILED"] },
          },
          data: {
            status: "CANCELLED",
            claimToken: null,
            claimExpiresAt: null,
            nextAttemptAt: null,
            failureCode: "account_privacy_access_revoked",
          },
        })
      const capabilities =
        await tx.storeConversationWhatsAppBridgeCapability.updateMany({
          where: { accountAccessId: { in: accessIds }, status: "PENDING" },
          data: { status: "REVOKED", revokedAt: now },
        })
      const candidates = await tx.storeConversationWhatsAppCandidate.updateMany(
        {
          where: { id: { in: candidateIds }, status: "PENDING" },
          data: { status: "REVOKED", revokedAt: now },
        },
      )
      const bridges = await tx.storeConversationWhatsAppBridge.updateMany({
        where: { id: { in: bridgeIds }, status: { not: "REVOKED" } },
        data: { status: "REVOKED", revokedAt: now },
      })
      const links = await tx.storeConversationAccountAccess.updateMany({
        where: { accountUserId: subjectId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      })

      // The final request transition repeats these checks. This stage does not
      // certify conversation erasure, Guest ownership or approved retention.
      const remainingLinks = await tx.storeConversationAccountAccess.count({
        where: { accountUserId: subjectId, status: "ACTIVE" },
      })
      const remainingCapabilities =
        await tx.storeConversationWhatsAppBridgeCapability.count({
          where: { accountAccessId: { in: accessIds }, status: "PENDING" },
        })
      const remainingBridges = await tx.storeConversationWhatsAppBridge.count({
        where: {
          accountAccessId: { in: accessIds },
          status: { not: "REVOKED" },
        },
      })
      const remainingCandidates =
        await tx.storeConversationWhatsAppCandidate.count({
          where: {
            status: "PENDING",
            OR: [
              { accountUserId: subjectId },
              { accountAccessId: { in: accessIds } },
            ],
          },
        })
      // A claimed send may already be at Meta. Keep its claim intact so the
      // worker can record SENT or OUTCOME_UNKNOWN; completion reconciles it.
      const unresolvedBridgePrompts =
        await tx.storeConversationWhatsAppBridgeAttempt.count({
          where: {
            bridgeId: { in: bridgeIds },
            status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
          },
        })
      const unresolvedCandidatePrompts =
        await tx.storeConversationWhatsAppCandidateAttempt.count({
          where: {
            candidateId: { in: candidateIds },
            status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
          },
        })
      const unresolvedOutboundSends =
        await tx.storeConversationWhatsAppOutboundAttempt.count({
          where: {
            bridgeId: { in: bridgeIds },
            status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
          },
        })
      if (
        remainingLinks ||
        remainingCapabilities ||
        remainingBridges ||
        remainingCandidates
      )
        throw new AccountPrivacyConversationAccessError("CLAIM_CONFLICT")

      const changed =
        links.count +
        capabilities.count +
        bridges.count +
        candidates.count +
        bridgeChoices.count +
        bridgeAttempts.count +
        candidateChoices.count +
        candidateAttempts.count
      return {
        requestId: input.requestId,
        accountLinksRevoked: links.count,
        bridgeCapabilitiesRevoked: capabilities.count,
        bridgesRevoked: bridges.count,
        candidatesRevoked: candidates.count,
        bridgeChoicesRevoked: bridgeChoices.count,
        bridgeAttemptsCancelled: bridgeAttempts.count,
        candidateChoicesRevoked: candidateChoices.count,
        candidateAttemptsCancelled: candidateAttempts.count,
        providerPromptReconciliationPending:
          unresolvedBridgePrompts +
          unresolvedCandidatePrompts +
          unresolvedOutboundSends,
        replay: changed === 0,
        conversationOutcomeRecorded: false as const,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}
