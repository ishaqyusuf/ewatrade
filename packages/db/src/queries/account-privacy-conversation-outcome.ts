import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyConversationInventory } from "./account-privacy-conversation-inventory"

export type AccountPrivacyConversationOutcomeCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "CONVERSATION_REVIEW_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyConversationOutcomeError extends Error {
  constructor(readonly code: AccountPrivacyConversationOutcomeCode) {
    super(code)
    this.name = "AccountPrivacyConversationOutcomeError"
  }
}

/** Certifies the empty conversation case only; it never changes shared content. */
export async function confirmNoAccountPrivacyConversations(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED !==
      "true"
  )
    throw new AccountPrivacyConversationOutcomeError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!policyVersion)
    throw new AccountPrivacyConversationOutcomeError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyConversationOutcomeError("OPERATOR_REQUIRED")
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
      if (!request)
        throw new AccountPrivacyConversationOutcomeError("NOT_FOUND")
      const subjectId = request.userId
      if (
        !subjectId ||
        subjectId === input.operatorUserId ||
        request.requestKey !== `account-deletion:${subjectId}` ||
        request.verifiedSubjectUserId !== subjectId ||
        !request.verifiedAt ||
        request.status !== "PROCESSING" ||
        !request.user?.emailVerified ||
        !request.contactEmail ||
        request.contactEmail.trim().toLowerCase() !==
          request.user.email.trim().toLowerCase()
      )
        throw new AccountPrivacyConversationOutcomeError(
          "IDENTITY_REVIEW_REQUIRED",
        )
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== subjectId
      )
        throw new AccountPrivacyConversationOutcomeError(
          "ACCESS_REVOCATION_REQUIRED",
        )

      // Historical links, requests and candidates remain in scope after
      // access is revoked or a WhatsApp capability expires.
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
        throw new AccountPrivacyConversationOutcomeError(
          "CONVERSATION_REVIEW_REQUIRED",
        )

      const existing = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: { requestId: request.id, domain: "CONVERSATIONS" },
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
          existing.processor !== "account-privacy-conversation-empty-v1" ||
          existing.policyVersion !== policyVersion
        )
          throw new AccountPrivacyConversationOutcomeError("CLAIM_CONFLICT")
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
          domain: "CONVERSATIONS",
          disposition: "NOT_APPLICABLE",
          processor: "account-privacy-conversation-empty-v1",
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
