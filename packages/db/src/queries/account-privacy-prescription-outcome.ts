import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyPrescriptionInventory } from "./account-privacy-prescription-inventory"

export type AccountPrivacyPrescriptionOutcomeCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "IDENTITY_REVIEW_REQUIRED"
  | "ACCESS_REVOCATION_REQUIRED"
  | "MEMBERSHIP_REVOCATION_REQUIRED"
  | "PRESCRIPTION_RECORDS_REVIEW_REQUIRED"
  | "CLAIM_CONFLICT"

export class AccountPrivacyPrescriptionOutcomeError extends Error {
  constructor(readonly code: AccountPrivacyPrescriptionOutcomeCode) {
    super(code.replaceAll("_", " ").toLowerCase())
    this.name = "AccountPrivacyPrescriptionOutcomeError"
  }
}

/** Certifies only a zero-count clinical inventory; it never changes pharmacy records. */
export async function confirmNoAccountPrivacyPrescriptions(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_PRESCRIPTION_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyPrescriptionOutcomeError("DISABLED")
  const policyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!policyVersion)
    throw new AccountPrivacyPrescriptionOutcomeError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyPrescriptionOutcomeError("OPERATOR_REQUIRED")
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
      if (!request)
        throw new AccountPrivacyPrescriptionOutcomeError("NOT_FOUND")
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
        throw new AccountPrivacyPrescriptionOutcomeError(
          "IDENTITY_REVIEW_REQUIRED",
        )
      if (
        request.accessRevocation?.status !== "REVOKED" ||
        request.accessRevocation.userId !== subjectId
      )
        throw new AccountPrivacyPrescriptionOutcomeError(
          "ACCESS_REVOCATION_REQUIRED",
        )
      const memberships = await tx.membership.findMany({
        where: { userId: subjectId },
        select: { tenantId: true, status: true },
      })
      if (memberships.some((membership) => membership.status !== "REMOVED"))
        throw new AccountPrivacyPrescriptionOutcomeError(
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
        throw new AccountPrivacyPrescriptionOutcomeError(
          "MEMBERSHIP_REVOCATION_REQUIRED",
        )
      const inventory = await getAccountPrivacyPrescriptionInventory(
        tx,
        subjectId,
        request.contactEmail,
      )
      if (Object.values(inventory).some((count) => count > 0))
        throw new AccountPrivacyPrescriptionOutcomeError(
          "PRESCRIPTION_RECORDS_REVIEW_REQUIRED",
        )
      const existing = await tx.accountPrivacyDomainOutcome.findUnique({
        where: {
          requestId_domain: {
            requestId: request.id,
            domain: "PRESCRIPTIONS",
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
          existing.processor !== "account-privacy-prescription-empty-v1" ||
          existing.policyVersion !== policyVersion
        )
          throw new AccountPrivacyPrescriptionOutcomeError("CLAIM_CONFLICT")
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
          domain: "PRESCRIPTIONS",
          disposition: "NOT_APPLICABLE",
          processor: "account-privacy-prescription-empty-v1",
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
