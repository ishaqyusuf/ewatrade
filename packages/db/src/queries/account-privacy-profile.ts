import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyAdditionalInventory } from "./account-privacy-additional-inventory"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import {
  accountPrivacyProfileEvidence,
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"
import { assessAccountPrivacyProfilePrerequisites } from "./account-privacy-profile-prerequisites"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"
import { runInOwnSerializableTransaction } from "./own-transaction"

export class AccountPrivacyProfileError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "POLICY_NOT_APPROVED"
      | "OPERATOR_REQUIRED"
      | "NOT_FOUND"
      | "NOT_READY"
      | "CLAIM_CONFLICT",
  ) {
    super(code)
    this.name = "AccountPrivacyProfileError"
  }
}

/** Minimizes a profile atomically; retained linkage is reported as retention, never erasure. */
export async function processAccountPrivacyProfile(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED !== "true"
  )
    throw new AccountPrivacyProfileError("DISABLED")
  const now = input.now ?? new Date()
  const policy = getApprovedAccountPrivacyProfilePolicy(process.env, now)
  if (!policy) throw new AccountPrivacyProfileError("POLICY_NOT_APPROVED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const operator = await tx.user.findUnique({
      where: { id: input.operatorUserId },
      select: { isPlatformAdmin: true },
    })
    if (!operator?.isPlatformAdmin)
      throw new AccountPrivacyProfileError("OPERATOR_REQUIRED")
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
        domainOutcomes: {
          select: {
            domain: true,
            userId: true,
            policyVersion: true,
            disposition: true,
            processor: true,
            evidenceDigest: true,
            processedAt: true,
            nextReviewAt: true,
          },
        },
      },
    })
    if (!request) throw new AccountPrivacyProfileError("NOT_FOUND")
    const subjectId = request.verifiedSubjectUserId
    if (
      !subjectId ||
      subjectId === input.operatorUserId ||
      request.userId !== subjectId ||
      request.requestKey !== `account-deletion:${subjectId}` ||
      !request.verifiedAt ||
      request.verifiedAt > now ||
      !request.contactEmail
    )
      throw new AccountPrivacyProfileError("NOT_READY")
    const email = request.contactEmail.trim().toLowerCase()
    const inventory = await getAccountPrivacyProfileInventory(
      tx,
      subjectId,
      email,
    )
    const existing = request.domainOutcomes.find(
      (row) => row.domain === "ACCOUNT_PROFILE",
    )
    const additional = await getAccountPrivacyAdditionalInventory(tx, subjectId)
    if (Object.values(additional).some((count) => count > 0))
      throw new AccountPrivacyProfileError(
        existing ? "CLAIM_CONFLICT" : "NOT_READY",
      )
    const targetEmail = accountPrivacyPseudonymousEmail(request.id, subjectId)
    const clean = () =>
      inventory.userExists &&
      !inventory.originalEmailRemains &&
      inventory.personalFieldCount === 0 &&
      inventory.authAccounts === 0 &&
      inventory.sessions === 0 &&
      inventory.verificationRows === 0 &&
      request.user?.email === targetEmail &&
      !request.user.emailVerified &&
      (policy.legalAcceptanceDisposition === "RETAIN" ||
        inventory.legalAcceptances === 0)
    if (existing) {
      if (
        !["PROCESSING", "COMPLETED"].includes(request.status) ||
        !clean() ||
        existing.userId !== subjectId ||
        existing.policyVersion !== policy.version ||
        existing.processor !== "account-privacy-profile-v1" ||
        existing.disposition !== "RETENTION_APPROVED" ||
        existing.processedAt < request.verifiedAt ||
        existing.processedAt > now ||
        existing.nextReviewAt?.toISOString() !== policy.reviewAt ||
        existing.evidenceDigest !==
          accountPrivacyProfileEvidence({
            requestId: request.id,
            subjectId,
            policy,
            legalAcceptanceCount: inventory.legalAcceptances,
          })
      )
        throw new AccountPrivacyProfileError("CLAIM_CONFLICT")
      return {
        requestId: request.id,
        profileMinimized: true,
        retainedLinkage: true,
        replay: true,
      }
    }
    const prerequisites = assessAccountPrivacyProfilePrerequisites({
      requestKey: request.requestKey,
      requestUserId: request.userId,
      verifiedSubjectUserId: subjectId,
      verifiedAt: request.verifiedAt,
      contactEmail: request.contactEmail,
      status: request.status,
      currentUser: request.user,
      accessRevocation: request.accessRevocation,
      profileUserExists: inventory.userExists,
      legalAcceptanceCount: inventory.legalAcceptances,
      approvedLegalAcceptanceDisposition: policy.legalAcceptanceDisposition,
      outcomes: request.domainOutcomes,
      approvedPolicyVersion: policy.version,
      now,
    })
    if (!prerequisites.prerequisitesSatisfied)
      throw new AccountPrivacyProfileError("NOT_READY")
    // A domain ledger is not evidence that these access rows are gone.
    if (
      (await tx.session.count({ where: { userId: subjectId } })) ||
      (await tx.membership.count({
        where: { userId: subjectId, status: { not: "REMOVED" } },
      })) ||
      (await tx.storeConversationPushEndpoint.count({
        where: { accountUserId: subjectId, status: "ACTIVE" },
      })) ||
      (await tx.account.count({
        where: {
          userId: subjectId,
          OR: [
            { accessToken: { not: null } },
            { refreshToken: { not: null } },
            { idToken: { not: null } },
          ],
        },
      }))
    )
      throw new AccountPrivacyProfileError("NOT_READY")
    await tx.account.deleteMany({ where: { userId: subjectId } })
    await tx.session.deleteMany({ where: { userId: subjectId } })
    await tx.verification.deleteMany({
      where: { identifier: { in: mobileOtpIdentifiersForEmail(email) } },
    })
    if (policy.legalAcceptanceDisposition === "ERASE")
      await tx.legalAcceptance.deleteMany({ where: { userId: subjectId } })
    await tx.user.update({
      where: { id: subjectId },
      data: {
        email: targetEmail,
        name: "",
        image: null,
        phone: null,
        firstName: null,
        lastName: null,
        displayName: null,
        avatarUrl: null,
        metadata: Prisma.DbNull,
        emailVerified: false,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        isPlatformAdmin: false,
        ageBand: "UNDECLARED",
        ageDeclaredAt: null,
      },
    })
    const after = await getAccountPrivacyProfileInventory(tx, subjectId, email)
    const profile = await tx.user.findUnique({
      where: { id: subjectId },
      select: { email: true, emailVerified: true },
    })
    if (
      !after.userExists ||
      after.originalEmailRemains ||
      after.personalFieldCount ||
      after.authAccounts ||
      after.sessions ||
      after.verificationRows ||
      profile?.email !== targetEmail ||
      profile.emailVerified ||
      (policy.legalAcceptanceDisposition === "ERASE" &&
        after.legalAcceptances !== 0) ||
      (policy.legalAcceptanceDisposition === "RETAIN" &&
        after.legalAcceptances !== inventory.legalAcceptances)
    )
      throw new AccountPrivacyProfileError("NOT_READY")
    await tx.accountPrivacyDomainOutcome.create({
      data: {
        requestId: request.id,
        userId: subjectId,
        domain: "ACCOUNT_PROFILE",
        disposition: "RETENTION_APPROVED",
        processor: "account-privacy-profile-v1",
        policyVersion: policy.version,
        evidenceDigest: accountPrivacyProfileEvidence({
          requestId: request.id,
          subjectId,
          policy,
          legalAcceptanceCount: after.legalAcceptances,
        }),
        processedAt: now,
        nextReviewAt: new Date(policy.reviewAt),
      },
    })
    return {
      requestId: request.id,
      profileMinimized: true,
      retainedLinkage: true,
      replay: false,
    }
  })
}
