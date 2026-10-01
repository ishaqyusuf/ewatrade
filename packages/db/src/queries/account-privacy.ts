import { createHmac, randomInt, timingSafeEqual } from "node:crypto"
import { isAccountPrivacyOtpSecretConfigured } from "@ewatrade/utils/account-privacy-intake"
import {
  assertLegalVersionHash,
  canAcceptLegalVersion,
  currentEffectiveLegalPublication,
  currentLegalPublicationDigest,
} from "@ewatrade/utils/legal-approval"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyCommercialInventory } from "./account-privacy-commercial-inventory"
import { getAccountPrivacyConversationInventory } from "./account-privacy-conversation-inventory"
import { getAccountPrivacyPrescriptionInventory } from "./account-privacy-prescription-inventory"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import { assessAccountPrivacyProfilePrerequisites } from "./account-privacy-profile-prerequisites"
import type { DbClient } from "./types"

const requestProjection = {
  id: true,
  status: true,
  requestedAt: true,
  updatedAt: true,
  completedAt: true,
} as const

export async function requestAccountDeletion(
  db: PrismaClient,
  userId: string,
  contactEmail?: string,
) {
  // One active account-wide command, stable across retried client requests.
  return db.accountPrivacyRequest.upsert({
    where: { requestKey: `account-deletion:${userId}` },
    create: {
      userId,
      verifiedSubjectUserId: userId,
      contactEmail: contactEmail ? normalizePrivacyEmail(contactEmail) : null,
      requestKey: `account-deletion:${userId}`,
      verifiedAt: new Date(),
    },
    // A retry must not rewrite the verified subject/contact after review or
    // processing has begun. A legacy incomplete row needs operator review.
    update: {},
    select: requestProjection,
  })
}

const challengeLifetimeMs = 10 * 60_000
const resendIntervalMs = 2 * 60_000
const dailyWindowMs = 24 * 60 * 60_000
const maxDailySends = 5
const maxAttempts = 5

function privacySecret() {
  const secret = process.env.ACCOUNT_PRIVACY_OTP_SECRET
  if (!secret || !isAccountPrivacyOtpSecretConfigured(secret))
    throw new Error("Account privacy verification is not configured.")
  return secret
}

function privacyDigest(purpose: string, value: string) {
  return createHmac("sha256", privacySecret())
    .update(`${purpose}:${value}`)
    .digest("hex")
}

export function normalizePrivacyEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function createExternalDeletionChallenge(
  db: PrismaClient,
  rawEmail: string,
  sourceIp: string,
) {
  if (!sourceIp.trim()) throw new Error("A trusted request source is required.")
  const email = normalizePrivacyEmail(rawEmail)
  const emailDigest = privacyDigest("account-deletion-email", email)
  const sourceDigest = privacyDigest("account-deletion-ip", sourceIp)
  const globalDigest = privacyDigest("account-deletion-global", "all")
  const now = new Date()
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
  const codeDigest = privacyDigest(
    "account-deletion-code",
    `${emailDigest}:${code}`,
  )
  const issued = await db.$transaction(
    async (tx) => {
      const existing = await tx.accountPrivacyChallenge.findUnique({
        where: { emailDigest },
      })
      if (
        existing &&
        now.getTime() - existing.sentAt.getTime() < resendIntervalMs
      )
        return false
      const sameWindow =
        existing &&
        now.getTime() - existing.windowStartedAt.getTime() < dailyWindowMs
      if (sameWindow && existing.sentCount >= maxDailySends) return false
      const limits = [
        { digest: sourceDigest, windowMs: 60 * 60_000, maximum: 10 },
        { digest: globalDigest, windowMs: dailyWindowMs, maximum: 500 },
      ]
      const buckets: Array<
        Awaited<ReturnType<typeof tx.accountPrivacyRateBucket.findUnique>>
      > = []
      for (const limit of limits) {
        buckets.push(
          await tx.accountPrivacyRateBucket.findUnique({
            where: { bucketDigest: limit.digest },
          }),
        )
      }
      if (
        buckets.some((bucket, index) => {
          const limit = limits[index]
          return Boolean(
            bucket &&
              limit &&
              now.getTime() - bucket.windowStartedAt.getTime() <
                limit.windowMs &&
              bucket.sentCount >= limit.maximum,
          )
        })
      )
        return false
      await tx.accountPrivacyChallenge.upsert({
        where: { emailDigest },
        create: {
          emailDigest,
          contactEmail: email,
          codeDigest,
          expiresAt: new Date(now.getTime() + challengeLifetimeMs),
          sentAt: now,
          windowStartedAt: now,
        },
        update: {
          contactEmail: email,
          codeDigest,
          expiresAt: new Date(now.getTime() + challengeLifetimeMs),
          sentAt: now,
          attempts: 0,
          sentCount: sameWindow ? { increment: 1 } : 1,
          windowStartedAt: sameWindow ? undefined : now,
        },
      })
      for (const [index, limit] of limits.entries()) {
        const bucket = buckets[index]
        const currentWindow =
          bucket &&
          now.getTime() - bucket.windowStartedAt.getTime() < limit.windowMs
        await tx.accountPrivacyRateBucket.upsert({
          where: { bucketDigest: limit.digest },
          create: {
            bucketDigest: limit.digest,
            sentCount: 1,
            windowStartedAt: now,
          },
          update: {
            sentCount: currentWindow ? { increment: 1 } : 1,
            windowStartedAt: currentWindow ? undefined : now,
          },
        })
      }
      return true
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
  return issued
    ? {
        code,
        email,
        sentAt: now,
        expiresAt: new Date(now.getTime() + challengeLifetimeMs),
      }
    : null
}

/** Discards only the exact code issue whose delivery failed. A later resend survives. */
export async function discardUndeliveredExternalDeletionChallenge(
  db: PrismaClient,
  issued: { email: string; code: string; sentAt: Date },
) {
  const emailDigest = privacyDigest("account-deletion-email", issued.email)
  const codeDigest = privacyDigest(
    "account-deletion-code",
    `${emailDigest}:${issued.code}`,
  )
  return db.accountPrivacyChallenge.deleteMany({
    where: { emailDigest, codeDigest, sentAt: issued.sentAt },
  })
}

export async function submitExternalDeletionRequest(
  db: PrismaClient,
  rawEmail: string,
  code: string,
) {
  const email = normalizePrivacyEmail(rawEmail)
  const emailDigest = privacyDigest("account-deletion-email", email)
  const candidate = privacyDigest(
    "account-deletion-code",
    `${emailDigest}:${code}`,
  )
  return db.$transaction(
    async (tx) => {
      const challenge = await tx.accountPrivacyChallenge.findUnique({
        where: { emailDigest },
      })
      if (
        !challenge ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= maxAttempts
      )
        return null
      const valid = timingSafeEqual(
        Buffer.from(candidate, "hex"),
        Buffer.from(challenge.codeDigest, "hex"),
      )
      if (!valid) {
        await tx.accountPrivacyChallenge.updateMany({
          where: { id: challenge.id, attempts: { lt: maxAttempts } },
          data: { attempts: { increment: 1 } },
        })
        return null
      }
      const consumed = await tx.accountPrivacyChallenge.deleteMany({
        where: {
          id: challenge.id,
          codeDigest: candidate,
          expiresAt: { gt: new Date() },
          attempts: { lt: maxAttempts },
        },
      })
      if (consumed.count !== 1) return null
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, emailVerified: true },
      })
      const userId = user?.emailVerified ? user.id : null
      return tx.accountPrivacyRequest.upsert({
        where: {
          requestKey: userId
            ? `account-deletion:${userId}`
            : `external-deletion:${emailDigest}`,
        },
        create: {
          requestKey: userId
            ? `account-deletion:${userId}`
            : `external-deletion:${emailDigest}`,
          userId,
          verifiedSubjectUserId: userId,
          contactEmail: email,
          verifiedAt: new Date(),
        },
        // The challenge proves this attempt owns the email, but a prior
        // request's reviewed contact and subject remain immutable on replay.
        update: {},
        select: requestProjection,
      })
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function purgeExpiredAccountPrivacyVerification(
  db: PrismaClient,
  now = new Date(),
) {
  const [challenges, buckets] = await Promise.all([
    db.accountPrivacyChallenge.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
    db.accountPrivacyRateBucket.deleteMany({
      where: {
        windowStartedAt: { lte: new Date(now.getTime() - dailyWindowMs) },
      },
    }),
  ])
  return { challengesRemoved: challenges.count, bucketsRemoved: buckets.count }
}

export async function getAccountDeletionRequest(
  db: PrismaClient,
  userId: string,
) {
  return db.accountPrivacyRequest.findFirst({
    where: { userId, requestKey: `account-deletion:${userId}` },
    select: requestProjection,
  })
}

// Platform operators need an account-wide queue; tenant managers must not see it.
// This projection never equates review with erasure or exposes clinical records.
export async function listAccountPrivacyRequests(
  db: PrismaClient,
  input: {
    cursor?: string
    status?:
      | "RECEIVED"
      | "UNDER_REVIEW"
      | "PROCESSING"
      | "COMPLETED"
      | "FAILED"
      | "CANCELLED"
  },
) {
  return db.accountPrivacyRequest.findMany({
    where: input.status ? { status: input.status } : undefined,
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    take: 51,
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
    select: {
      ...requestProjection,
      userId: true,
      verifiedSubjectUserId: true,
      contactEmail: true,
      verifiedAt: true,
    },
  })
}

export async function getAccountPrivacyReview(
  db: PrismaClient,
  requestId: string,
) {
  const request = await db.accountPrivacyRequest.findUnique({
    where: { id: requestId },
    select: {
      ...requestProjection,
      userId: true,
      verifiedSubjectUserId: true,
      requestKey: true,
      contactEmail: true,
      user: { select: { email: true, emailVerified: true } },
      verifiedAt: true,
      outcome: true,
    },
  })
  if (!request) return null
  const { user: requestUser, requestKey: _requestKey, ...safeRequest } = request
  const allMemberships = request.userId
    ? await db.membership.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          tenantId: true,
          role: true,
          status: true,
          tenant: { select: { name: true } },
        },
      })
    : []
  const memberships = allMemberships.filter(
    (membership) => membership.status !== "REMOVED",
  )
  const membershipIds = allMemberships.map((membership) => membership.id)
  const membershipTenantIds = [
    ...new Set(allMemberships.map((membership) => membership.tenantId)),
  ]
  const ownership = await Promise.all(
    memberships
      .filter((membership) => membership.role === "OWNER")
      .map(async (membership) => ({
        tenantId: membership.tenantId,
        tenantName: membership.tenant.name,
        otherActiveOwners: await db.membership.count({
          where: {
            tenantId: membership.tenantId,
            status: "ACTIVE",
            role: "OWNER",
            userId: { not: request.userId ?? "" },
          },
        }),
      })),
  )
  const domainInventory = request.userId
    ? await Promise.all([
        db.session.count({
          where: { userId: request.userId, expiresAt: { gt: new Date() } },
        }),
        db.account.count({
          where: {
            userId: request.userId,
            provider: "apple",
            refreshToken: { not: null },
          },
        }),
        db.storeConversationAccountAccess.count({
          where: { accountUserId: request.userId, status: "ACTIVE" },
        }),
        db.legalAcceptance.count({ where: { userId: request.userId } }),
        db.account.count({
          where: { userId: request.userId, idToken: { not: null } },
        }),
        db.account.count({
          where: {
            userId: request.userId,
            OR: [
              { accessToken: { not: null } },
              { refreshToken: { not: null } },
            ],
          },
        }),
      ]).then(
        ([
          activeSessions,
          appleAuthorizations,
          linkedConversations,
          legalAcceptances,
          storedIdentityTokens,
          allProviderTokens,
        ]) => ({
          activeSessions,
          appleAuthorizations,
          linkedConversations,
          legalAcceptances,
          storedIdentityTokens,
          otherProviderTokens: allProviderTokens - appleAuthorizations,
        }),
      )
    : null
  // These are risk counts, not evidence that a Guest Identity belongs to the
  // account holder. The same device identity can participate elsewhere.
  const conversationAccessInventory = request.userId
    ? await Promise.all([
        db.storeConversationGuestCredential.count({
          where: {
            guestIdentity: {
              accountAccesses: {
                some: { accountUserId: request.userId, status: "ACTIVE" },
              },
            },
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
        }),
        db.storeConversationGuestAccess.count({
          where: {
            conversation: {
              accountAccess: {
                is: { accountUserId: request.userId, status: "ACTIVE" },
              },
            },
            status: "ACTIVE",
          },
        }),
        db.storeConversationWhatsAppBridgeCapability.count({
          where: {
            accountAccess: {
              is: { accountUserId: request.userId },
            },
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }),
        db.storeConversationWhatsAppBridge.count({
          where: {
            accountAccess: {
              is: { accountUserId: request.userId },
            },
            status: { not: "REVOKED" },
          },
        }),
        db.storeConversationWhatsAppCandidate.count({
          where: {
            OR: [
              { accountUserId: request.userId },
              { accountAccess: { is: { accountUserId: request.userId } } },
            ],
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }),
      ]).then(
        ([
          activeLinkedGuestCredentials,
          activeGuestConversationGrants,
          pendingAccountBridgeCapabilities,
          nonRevokedAccountBridges,
          pendingAccountWhatsAppCandidates,
        ]) => ({
          activeLinkedGuestCredentials,
          activeGuestConversationGrants,
          pendingAccountBridgeCapabilities,
          nonRevokedAccountBridges,
          pendingAccountWhatsAppCandidates,
          guestOwnershipReviewRequired: Boolean(
            domainInventory?.linkedConversations ||
              pendingAccountBridgeCapabilities ||
              nonRevokedAccountBridges ||
              pendingAccountWhatsAppCandidates,
          ),
        }),
      )
    : null
  const membershipHandoverInventory = request.userId
    ? await Promise.all([
        db.retailOpsStaffProfile.count({
          where: {
            userId: request.userId,
            statusSnapshot: { not: "REMOVED" },
          },
        }),
        db.retailOpsStaffInviteToken.count({
          where: {
            status: "ACTIVE",
            OR: [
              { invitedUserId: request.userId },
              { membershipId: { in: membershipIds } },
              ...(requestUser?.emailVerified
                ? [
                    {
                      invitedUserId: null,
                      email: {
                        equals: requestUser.email.trim().toLowerCase(),
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
            ],
          },
        }),
        db.serviceCommerceStoreTeamAssignment.count({
          where: {
            membershipId: { in: membershipIds },
            status: { not: "REVOKED" },
          },
        }),
        db.storeConversation.count({
          where: {
            assignedMembershipId: {
              in: membershipIds,
            },
            lifecycle: "ACTIVE",
          },
        }),
        db.serviceBookingResource.count({
          where: {
            membershipId: { in: membershipIds },
            status: "ACTIVE",
          },
        }),
      ]).then(
        ([
          staffProfiles,
          openInvites,
          teamAssignments,
          conversationAssignments,
          bookingResources,
        ]) => ({
          nonRemovedMemberships: memberships.length,
          staffProfiles,
          openInvites,
          teamAssignments,
          conversationAssignments,
          bookingResources,
          emailInvitationReviewRequired: !requestUser?.emailVerified,
        }),
      )
    : null
  // A software plan belongs to the Tenant, not automatically to the person
  // who initiated checkout. Include removed memberships for historical scope.
  const billingReviewInventory = request.userId
    ? await Promise.all([
        db.billingCheckoutSession.count({
          where: { requestedByUserId: request.userId },
        }),
        db.tenantSubscription.findMany({
          where: { tenantId: { in: membershipTenantIds } },
          select: {
            tenantId: true,
            provider: true,
            status: true,
            currentPeriodEndsAt: true,
          },
        }),
        db.storeSubscriptionPurchase.count({
          where: { tenantId: { in: membershipTenantIds } },
        }),
        db.playRefundReviewResponse.count({
          where: { actorUserId: request.userId },
        }),
      ]).then(
        ([
          initiatedCheckoutSessions,
          tenantSubscriptions,
          storePurchases,
          refundReviewActions,
        ]) => ({
          initiatedCheckoutSessions,
          storePurchases,
          tenantSubscriptions,
          refundReviewActions,
        }),
      )
    : null
  // A verified subject ID remains available when physical User removal clears
  // the optional relation. A mismatched live relation must not expose another
  // account's attribution in either operator projection.
  const reviewSubjectId =
    request.verifiedAt &&
    request.verifiedSubjectUserId &&
    (!request.userId || request.userId === request.verifiedSubjectUserId)
      ? request.verifiedSubjectUserId
      : null
  const commercialVerifiedEmail =
    reviewSubjectId &&
    request.requestKey === `account-deletion:${reviewSubjectId}`
      ? request.contactEmail?.trim().toLowerCase()
      : null
  const commercialReviewInventory = reviewSubjectId
    ? await getAccountPrivacyCommercialInventory(
        db,
        reviewSubjectId,
        commercialVerifiedEmail,
      )
    : null
  const conversationReviewInventory = reviewSubjectId
    ? await getAccountPrivacyConversationInventory(db, reviewSubjectId)
    : null
  // Match the completion gate's identity boundary. An unverified live email
  // cannot link clinical patient records; after User removal, only the
  // account-derived verified intake contact can be considered a candidate.
  const prescriptionVerifiedEmail = requestUser?.emailVerified
    ? requestUser.email.trim().toLowerCase()
    : !request.userId &&
        reviewSubjectId &&
        request.requestKey === `account-deletion:${reviewSubjectId}`
      ? request.contactEmail?.trim().toLowerCase()
      : null
  const prescriptionReviewInventory = reviewSubjectId
    ? await getAccountPrivacyPrescriptionInventory(
        db,
        reviewSubjectId,
        prescriptionVerifiedEmail,
      )
    : null
  const profileReviewInventory =
    reviewSubjectId && commercialVerifiedEmail
      ? await getAccountPrivacyProfileInventory(
          db,
          reviewSubjectId,
          commercialVerifiedEmail,
        )
      : null
  const accessRevocation = await db.accountPrivacyAccessRevocation.findUnique({
    where: { requestId: request.id },
    select: {
      userId: true,
      status: true,
      attempts: true,
      reviewedAt: true,
      sessionsRevokedAt: true,
      appleRevokedAt: true,
      completedAt: true,
      failureCode: true,
      recoveryEvents: {
        orderBy: { claimedAt: "desc" },
        take: 5,
        select: {
          operatorUserId: true,
          claimedAt: true,
          activeSessions: true,
          appleAuthorizations: true,
          activePushEndpoints: true,
          storedIdentityTokens: true,
          otherProviderTokens: true,
        },
      },
    },
  })
  const domainOutcomes = await db.accountPrivacyDomainOutcome.findMany({
    where: { requestId: request.id },
    orderBy: { domain: "asc" },
    select: {
      userId: true,
      domain: true,
      disposition: true,
      processor: true,
      policyVersion: true,
      evidenceDigest: true,
      nextReviewAt: true,
      processedAt: true,
    },
  })
  const noticeAttempts = await db.accountPrivacyNoticeAttempt.findMany({
    where: { requestId: request.id },
    orderBy: { attemptNumber: "desc" },
    take: 10,
    select: {
      attemptNumber: true,
      status: true,
      policyVersion: true,
      providerMessageId: true,
      providerEventId: true,
      failureEventId: true,
      preparedAt: true,
      sentAt: true,
      deliveredAt: true,
      failedAt: true,
    },
  })
  const profilePrerequisites =
    reviewSubjectId && commercialVerifiedEmail
      ? assessAccountPrivacyProfilePrerequisites({
          requestKey: request.requestKey,
          requestUserId: request.userId,
          verifiedSubjectUserId: request.verifiedSubjectUserId,
          verifiedAt: request.verifiedAt,
          contactEmail: request.contactEmail,
          status: request.status,
          currentUser: requestUser,
          accessRevocation,
          profileUserExists: profileReviewInventory?.userExists ?? false,
          legalAcceptanceCount: profileReviewInventory?.legalAcceptances ?? 0,
          outcomes: domainOutcomes,
          approvedPolicyVersion:
            process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION ?? null,
        })
      : null
  return {
    ...safeRequest,
    identityReviewRequired: request.verifiedSubjectUserId === null,
    domainInventory,
    conversationAccessInventory,
    membershipHandoverInventory,
    billingReviewInventory,
    commercialReviewInventory,
    conversationReviewInventory,
    prescriptionReviewInventory,
    profileReviewInventory,
    profilePrerequisites,
    accessRevocation: accessRevocation
      ? (({ userId: _userId, ...safe }) => safe)(accessRevocation)
      : null,
    domainOutcomes: domainOutcomes.map(
      ({ userId: _userId, evidenceDigest: _evidenceDigest, ...safe }) => safe,
    ),
    noticeAttempts,
    activeMemberships: memberships
      .filter((membership) => membership.status === "ACTIVE")
      .map(({ tenantId, role, tenant }) => ({
        tenantId,
        role,
        tenantName: tenant.name,
      })),
    ownerHandoverRequired: ownership.filter(
      (item) => item.otherActiveOwners === 0,
    ),
  }
}

export async function recordLegalAcceptance(
  db: DbClient,
  input: { userId: string; version: string; surface: "mobile" | "web" },
) {
  if (!canAcceptLegalVersion(input.version)) {
    throw new Error(
      "This legal document version is not approved for acceptance.",
    )
  }
  const documentHash = currentLegalPublicationDigest()
  const existingVersion = await db.legalAcceptance.findFirst({
    where: { version: input.version },
    select: { documentHash: true },
  })
  assertLegalVersionHash(existingVersion?.documentHash, documentHash)
  const acceptance = await db.legalAcceptance.upsert({
    where: { userId_version: { userId: input.userId, version: input.version } },
    create: { ...input, documentHash },
    update: {},
    select: { version: true, acceptedAt: true, documentHash: true },
  })
  assertLegalVersionHash(acceptance.documentHash, documentHash)
  return acceptance
}

type EffectiveLegalPublication = {
  version: string
  documentHash: string
  effectiveDate: string
}

export async function getAccountLegalStatus(
  db: PrismaClient,
  userId: string,
  publication: EffectiveLegalPublication | null = currentEffectiveLegalPublication(),
) {
  if (!publication)
    return {
      effective: false,
      version: null,
      effectiveDate: null,
      accepted: false,
    }

  const acceptance = await db.legalAcceptance.findUnique({
    where: { userId_version: { userId, version: publication.version } },
    select: { documentHash: true },
  })
  return {
    effective: true,
    version: publication.version,
    effectiveDate: publication.effectiveDate,
    accepted: acceptance?.documentHash === publication.documentHash,
  }
}
