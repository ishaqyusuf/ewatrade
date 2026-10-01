import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyCommercialInventory } from "./account-privacy-commercial-inventory"

export type AccountPrivacyCommercialOutcomeCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "MEMBERSHIP_REVOCATION_REQUIRED"
  | "COMMERCIAL_RECORDS_REVIEW_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyCommercialOutcomeError extends Error {
  constructor(readonly code: AccountPrivacyCommercialOutcomeCode) {
    super(code.replaceAll("_", " ").toLowerCase())
    this.name = "AccountPrivacyCommercialOutcomeError"
  }
}

/** Certifies only a zero-count commercial inventory; it never changes merchant records. */
export async function confirmNoAccountPrivacyCommercialRecords(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyCommercialOutcomeError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!policyVersion)
    throw new AccountPrivacyCommercialOutcomeError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyCommercialOutcomeError("OPERATOR_REQUIRED")
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
      if (!request) throw new AccountPrivacyCommercialOutcomeError("NOT_FOUND")
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
        throw new AccountPrivacyCommercialOutcomeError(
          "IDENTITY_REVIEW_REQUIRED",
        )
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== subjectId
      )
        throw new AccountPrivacyCommercialOutcomeError(
          "ACCESS_REVOCATION_REQUIRED",
        )
      const memberships = await tx.membership.findMany({
        where: { userId: subjectId },
        select: { tenantId: true, status: true },
      })
      if (memberships.some((membership) => membership.status !== "REMOVED"))
        throw new AccountPrivacyCommercialOutcomeError(
          "MEMBERSHIP_REVOCATION_REQUIRED",
        )
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
        (memberships.length > 0 &&
          membershipOutcome.disposition === "NOT_APPLICABLE")
      )
        throw new AccountPrivacyCommercialOutcomeError(
          "MEMBERSHIP_REVOCATION_REQUIRED",
        )
      const inventory = await getAccountPrivacyCommercialInventory(
        tx,
        subjectId,
        request.contactEmail,
      )
      if (Object.values(inventory).some((count) => count > 0))
        throw new AccountPrivacyCommercialOutcomeError(
          "COMMERCIAL_RECORDS_REVIEW_REQUIRED",
        )
      const existing = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: {
            requestId: request.id,
            domain: "COMMERCIAL_RECORDS",
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
          existing.processor !== "account-privacy-commercial-empty-v1" ||
          existing.policyVersion !== policyVersion
        )
          throw new AccountPrivacyCommercialOutcomeError("CLAIM_CONFLICT")
        return { requestId: request.id, outcomeRecorded: true, replay: true }
      }
      const evidenceDigest = createHash("sha256")
        .update(
          JSON.stringify({
            version: 1,
            requestId: request.id,
            subjectId,
            operatorUserId: input.operatorUserId,
            policyVersion,
            processedAt: now.toISOString(),
            inventory,
          }),
        )
        .digest("hex")
      await tx.accountPrivacyDomainOutcome.create({
        data: {
          requestId: request.id,
          userId: subjectId,
          domain: "COMMERCIAL_RECORDS",
          disposition: "NOT_APPLICABLE",
          processor: "account-privacy-commercial-empty-v1",
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
