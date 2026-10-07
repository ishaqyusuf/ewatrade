import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyAdditionalInventory } from "./account-privacy-additional-inventory"
import { getAccountPrivacyCommercialInventory } from "./account-privacy-commercial-inventory"
import { getAccountPrivacyConversationInventory } from "./account-privacy-conversation-inventory"
import { getAccountPrivacyPrescriptionInventory } from "./account-privacy-prescription-inventory"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import {
  getApprovedAccountPrivacyProfilePolicy,
  isAccountPrivacyProfileMinimizationConfirmed,
} from "./account-privacy-profile-policy"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"

export type AccountPrivacyCompletionCode =
  | "DISABLED"
  | "POLICY_NOT_APPROVED"
  | "OPERATOR_REQUIRED"
  | "NOT_FOUND"
  | "NOT_READY"
  | "CLAIM_CONFLICT"

export class AccountPrivacyCompletionError extends Error {
  constructor(readonly code: AccountPrivacyCompletionCode) {
    super(code.replaceAll("_", " ").toLowerCase())
    this.name = "AccountPrivacyCompletionError"
  }
}

export const ACCOUNT_PRIVACY_REQUIRED_DOMAINS = [
  "IDENTITY_ACCESS",
  "MEMBERSHIP",
  "CONVERSATIONS",
  "PRESCRIPTIONS",
  "COMMERCIAL_RECORDS",
  "SOFTWARE_SUBSCRIPTIONS",
  "EXTERNAL_PROCESSORS",
  "ACCOUNT_PROFILE",
  "OUTCOME_NOTICE",
] as const

type Domain = (typeof ACCOUNT_PRIVACY_REQUIRED_DOMAINS)[number]
type Disposition =
  | "ACCESS_REVOKED"
  | "ERASURE_CONFIRMED"
  | "ANONYMIZATION_CONFIRMED"
  | "RETENTION_APPROVED"
  | "NOT_APPLICABLE"
  | "NOTICE_DELIVERED"

export const ACCOUNT_PRIVACY_ALLOWED_DISPOSITIONS: Record<
  Domain,
  readonly Disposition[]
> = {
  IDENTITY_ACCESS: ["ACCESS_REVOKED"],
  MEMBERSHIP: ["ACCESS_REVOKED", "NOT_APPLICABLE"],
  CONVERSATIONS: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
    "NOT_APPLICABLE",
  ],
  PRESCRIPTIONS: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
    "NOT_APPLICABLE",
  ],
  COMMERCIAL_RECORDS: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
    "NOT_APPLICABLE",
  ],
  SOFTWARE_SUBSCRIPTIONS: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
    "NOT_APPLICABLE",
  ],
  EXTERNAL_PROCESSORS: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
    "NOT_APPLICABLE",
  ],
  ACCOUNT_PROFILE: [
    "ERASURE_CONFIRMED",
    "ANONYMIZATION_CONFIRMED",
    "RETENTION_APPROVED",
  ],
  OUTCOME_NOTICE: ["NOTICE_DELIVERED"],
}

/** Read-only gate. No caller may infer erasure from a received or processing request. */
export async function assessAccountPrivacyCompletion(
  db: Pick<
    PrismaClient,
    | "accountPrivacyRequest"
    | "legalAcceptance"
    | "assistantConversation"
    | "assistantRun"
    | "message"
    | "automationEvent"
    | "productAnalyticsEvent"
    | "user"
    | "membership"
    | "session"
    | "verification"
    | "account"
    | "storeConversationPushEndpoint"
    | "retailOpsStaffProfile"
    | "retailOpsStaffInviteToken"
    | "serviceCommerceStoreTeamAssignment"
    | "storeConversation"
    | "serviceBookingResource"
    | "storeConversationAccountAccess"
    | "storeConversationPrivacyRequest"
    | "storeConversationWhatsAppBridgeCapability"
    | "storeConversationWhatsAppBridge"
    | "storeConversationWhatsAppCandidate"
    | "storeConversationWhatsAppBridgeAttempt"
    | "storeConversationWhatsAppCandidateAttempt"
    | "storeConversationWhatsAppOutboundAttempt"
    | "storeConversationAccountLinkCommand"
    | "storeConversationAccountDeviceCommand"
    | "storeConversationAccountAuditEvent"
    | "storeConversationActionMessage"
    | "storeConversationAccountWatermark"
    | "storeConversationAccountNotificationPreference"
    | "storeConversationNotificationCommand"
    | "storeConversationNotificationIntent"
    | "storeConversationNotificationAuditEvent"
    | "storeConversationWhatsAppBridgeAuditEvent"
    | "storeConversationModerationCommand"
    | "storeConversationModerationAuditEvent"
    | "storeConversationSensitiveReadAuditEvent"
    | "storeConversationAvailabilityConfiguration"
    | "storeConversationAvailabilityAuditEvent"
    | "storeConversationChannelConfiguration"
    | "storeConversationChannelConfigurationAuditEvent"
    | "billingCheckoutSession"
    | "playRefundReviewResponse"
    | "commercialOrder"
    | "commercialOrderPayment"
    | "commercialOrderFulfillmentCommand"
    | "productReturn"
    | "serviceJob"
    | "serviceIntake"
    | "serviceQuote"
    | "serviceQuoteVersion"
    | "commerceQuote"
    | "commerceQuoteVersion"
    | "serviceWorkEvent"
    | "serviceWorkAssignment"
    | "serviceDueCommitment"
    | "serviceInternalNote"
    | "serviceException"
    | "serviceEvidence"
    | "serviceEvidenceAuditEvent"
    | "serviceRequestForm"
    | "customerTrackingAccess"
    | "serviceNotificationIntent"
    | "serviceManualShare"
    | "commerceInquiryAuditEvent"
    | "customer"
    | "serviceRequest"
    | "commerceInquiry"
    | "prescriptionRequest"
    | "prescriptionStoreRole"
    | "prescriptionStoreAuditEvent"
    | "prescriptionPharmacistReview"
    | "prescriptionRequestAuditEvent"
    | "prescriptionPrivacyRequest"
    | "prescriptionStoreSettings"
    | "prescriptionChannel"
    | "prescriptionMedia"
    | "prescriptionMediaAccessEvent"
    | "prescriptionTranscription"
    | "prescriptionTranscriptionLine"
    | "prescriptionLineMapping"
    | "prescriptionPaymentRefund"
    | "prescriptionPickupFulfillment"
    | "prescriptionPickupEvent"
    | "prescriptionDeliveryZone"
    | "prescriptionDeliveryAddress"
    | "prescriptionDeliveryAssignment"
    | "prescriptionDeliveryEvent"
    | "prescriptionRetentionPolicy"
    | "prescriptionIncidentControl"
    | "prescriptionSensitiveAccessEvent"
  >,
  requestId: string,
  input: { approvedPolicyVersion?: string; now?: Date } = {},
) {
  const request = await db.accountPrivacyRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestKey: true,
      userId: true,
      contactEmail: true,
      user: { select: { email: true, emailVerified: true } },
      verifiedSubjectUserId: true,
      status: true,
      verifiedAt: true,
      accessRevocation: { select: { status: true, userId: true } },
      noticeAttempts: {
        select: {
          userId: true,
          status: true,
          policyVersion: true,
          contentDigest: true,
          recipientDigest: true,
          providerMessageId: true,
          providerEventId: true,
          deliveryEvidenceDigest: true,
          deliveredAt: true,
        },
      },
      domainOutcomes: {
        select: {
          userId: true,
          domain: true,
          disposition: true,
          processor: true,
          policyVersion: true,
          evidenceDigest: true,
          processedAt: true,
          nextReviewAt: true,
        },
      },
    },
  })
  if (!request)
    return {
      eligible: false,
      blockers: ["REQUEST_NOT_FOUND"],
      missingDomains: [...ACCOUNT_PRIVACY_REQUIRED_DOMAINS],
    }

  const blockers: string[] = []
  if (!request.verifiedSubjectUserId || !request.verifiedAt)
    blockers.push("IDENTITY_UNVERIFIED")
  if (request.userId && request.userId !== request.verifiedSubjectUserId)
    blockers.push("SUBJECT_MISMATCH")
  if (request.status !== "PROCESSING") blockers.push("REQUEST_NOT_PROCESSING")
  if (
    request.accessRevocation?.status !== "REVOKED" ||
    request.accessRevocation.userId !== request.verifiedSubjectUserId
  )
    blockers.push("ACCESS_NOT_REVOKED")
  if (!input.approvedPolicyVersion?.trim()) blockers.push("POLICY_NOT_APPROVED")

  const now = input.now ?? new Date()
  if (request.verifiedSubjectUserId) {
    const subjectId = request.verifiedSubjectUserId
    const additional = await getAccountPrivacyAdditionalInventory(db, subjectId)
    if (Object.values(additional).some((count) => count > 0))
      blockers.push("ADDITIONAL_PERSONAL_DATA_REVIEW_REQUIRED")
    const profileOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "ACCOUNT_PROFILE",
    )
    const matchedRequestContact =
      request.requestKey === `account-deletion:${subjectId}` &&
      request.verifiedAt &&
      request.contactEmail
        ? request.contactEmail.trim().toLowerCase()
        : null
    // After a policy-matched profile anonymization, the surviving User has a
    // replacement email. Keep reviewing invitations and OTPs against the
    // verified intake contact instead of silently switching identity scope.
    const profileAnonymized =
      request.userId === subjectId &&
      !!request.user &&
      !!matchedRequestContact &&
      profileOutcome?.disposition === "ANONYMIZATION_CONFIRMED" &&
      profileOutcome.policyVersion === input.approvedPolicyVersion &&
      !!request.verifiedAt &&
      profileOutcome.processedAt >= request.verifiedAt
    let profileMinimized = false
    if (profileOutcome?.processor === "account-privacy-profile-v1") {
      const policy = getApprovedAccountPrivacyProfilePolicy(process.env, now)
      const inventory = matchedRequestContact
        ? await getAccountPrivacyProfileInventory(
            db,
            subjectId,
            matchedRequestContact,
          )
        : null
      profileMinimized = Boolean(
        policy &&
          policy.version === input.approvedPolicyVersion &&
          inventory &&
          isAccountPrivacyProfileMinimizationConfirmed({
            request,
            outcome: profileOutcome,
            inventory,
            policy,
            now,
          }),
      )
      if (!profileMinimized)
        blockers.push("ACCOUNT_PROFILE_MINIMIZATION_UNCONFIRMED")
    }
    const profileContactReplaced = profileAnonymized || profileMinimized
    if (
      (!profileContactReplaced && request.user?.emailVerified === false) ||
      (!profileContactReplaced &&
        request.contactEmail &&
        request.user?.email &&
        request.contactEmail.trim().toLowerCase() !==
          request.user.email.trim().toLowerCase())
    )
      blockers.push("EMAIL_INVITATION_REVIEW_REQUIRED")
    // The User relation is cleared by physical deletion. A matched account
    // request can still use its email-verified intake contact for invitation
    // review; an unmatched/external request cannot establish that scope.
    const verifiedEmail = profileContactReplaced
      ? matchedRequestContact
      : request.user?.emailVerified
        ? request.user.email.trim().toLowerCase()
        : !request.user && request.userId === null
          ? matchedRequestContact
          : null
    if (
      (!verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) &&
      !blockers.includes("EMAIL_INVITATION_REVIEW_REQUIRED")
    )
      blockers.push("EMAIL_INVITATION_REVIEW_REQUIRED")
    if (verifiedEmail) {
      const otpIdentifiers = mobileOtpIdentifiersForEmail(verifiedEmail)
      const liveMobileOtp = await db.verification.count({
        where: {
          identifier: { in: otpIdentifiers },
          expiresAt: { gt: now },
        },
      })
      if (liveMobileOtp > 0) blockers.push("IDENTITY_VERIFICATION_REMAINS")
      if (
        profileOutcome &&
        (profileMinimized ||
          ["ERASURE_CONFIRMED", "ANONYMIZATION_CONFIRMED"].includes(
            profileOutcome.disposition,
          ))
      ) {
        const storedMobileOtp = await db.verification.count({
          where: { identifier: { in: otpIdentifiers } },
        })
        if (storedMobileOtp > 0)
          blockers.push("ACCOUNT_PROFILE_VERIFICATION_REMAINS")
      }
    }
    // These reads also run inside the final serializable transaction. Query
    // sequentially so a single PostgreSQL transaction connection is not used
    // concurrently by the adapter.
    const memberships = await db.membership.count({
      where: { userId: subjectId, status: { not: "REMOVED" } },
    })
    const sessions = await db.session.count({
      where: { userId: subjectId, expiresAt: { gt: now } },
    })
    const identityTokens = await db.account.count({
      where: { userId: subjectId, idToken: { not: null } },
    })
    const allProviderTokens = await db.account.count({
      where: {
        userId: subjectId,
        OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
      },
    })
    const pushEndpoints = await db.storeConversationPushEndpoint.count({
      where: { accountUserId: subjectId, status: "ACTIVE" },
    })
    const staffProfiles = await db.retailOpsStaffProfile.count({
      where: { userId: subjectId, statusSnapshot: { not: "REMOVED" } },
    })
    const openInvites = await db.retailOpsStaffInviteToken.count({
      where: {
        status: "ACTIVE",
        OR: [
          { invitedUserId: subjectId },
          { membership: { is: { userId: subjectId } } },
          ...(verifiedEmail
            ? [
                {
                  invitedUserId: null,
                  email: {
                    equals: verifiedEmail,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      },
    })
    const teamAssignments = await db.serviceCommerceStoreTeamAssignment.count({
      where: {
        membership: { is: { userId: subjectId } },
        status: { not: "REVOKED" },
      },
    })
    const conversationAssignments = await db.storeConversation.count({
      where: {
        assignedMembership: { is: { userId: subjectId } },
        lifecycle: "ACTIVE",
      },
    })
    const bookingResources = await db.serviceBookingResource.count({
      where: {
        membership: { is: { userId: subjectId } },
        status: "ACTIVE",
      },
    })
    const linkedConversations = await db.storeConversationAccountAccess.count({
      where: { accountUserId: subjectId, status: "ACTIVE" },
    })
    const pendingBridgeCapabilities =
      await db.storeConversationWhatsAppBridgeCapability.count({
        where: {
          accountAccess: { is: { accountUserId: subjectId } },
          status: "PENDING",
          expiresAt: { gt: now },
        },
      })
    const nonRevokedBridges = await db.storeConversationWhatsAppBridge.count({
      where: {
        accountAccess: { is: { accountUserId: subjectId } },
        status: { not: "REVOKED" },
      },
    })
    const pendingAccountCandidates =
      await db.storeConversationWhatsAppCandidate.count({
        where: {
          OR: [
            { accountUserId: subjectId },
            { accountAccess: { is: { accountUserId: subjectId } } },
          ],
          status: "PENDING",
          expiresAt: { gt: now },
        },
      })
    const unresolvedBridgePrompts =
      await db.storeConversationWhatsAppBridgeAttempt.count({
        where: {
          bridge: {
            is: { accountAccess: { is: { accountUserId: subjectId } } },
          },
          status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
        },
      })
    const unresolvedCandidatePrompts =
      await db.storeConversationWhatsAppCandidateAttempt.count({
        where: {
          candidate: {
            is: {
              OR: [
                { accountUserId: subjectId },
                { accountAccess: { is: { accountUserId: subjectId } } },
              ],
            },
          },
          status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
        },
      })
    const unresolvedOutboundSends =
      await db.storeConversationWhatsAppOutboundAttempt.count({
        where: {
          bridge: {
            is: { accountAccess: { is: { accountUserId: subjectId } } },
          },
          status: { in: ["CLAIMED", "OUTCOME_UNKNOWN"] },
        },
      })
    const softwareSubscriptionOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "SOFTWARE_SUBSCRIPTIONS",
    )
    const conversationOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "CONVERSATIONS",
    )
    const commercialOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "COMMERCIAL_RECORDS",
    )
    const prescriptionOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "PRESCRIPTIONS",
    )
    const accountProfileOutcome = request.domainOutcomes.find(
      (outcome) => outcome.domain === "ACCOUNT_PROFILE",
    )
    if (accountProfileOutcome?.disposition === "ERASURE_CONFIRMED") {
      // A removed request relation is not proof that the verified subject's
      // account was erased. Check the immutable subject identifier directly.
      const survivingUsers = await db.user.count({
        where: { id: subjectId },
      })
      if (survivingUsers > 0)
        blockers.push("ACCOUNT_PROFILE_ERASURE_UNCONFIRMED")
    }
    if (accountProfileOutcome?.disposition === "ANONYMIZATION_CONFIRMED") {
      // A Better Auth Account may retain a password hash or stable provider
      // identity even after the User email changes and tokens are cleared.
      const linkedAuthAccounts = await db.account.count({
        where: { userId: subjectId },
      })
      if (linkedAuthAccounts > 0)
        blockers.push("ACCOUNT_PROFILE_AUTH_ACCOUNT_REMAINS")
      const profile = await db.user.findUnique({
        where: { id: subjectId },
        select: {
          name: true,
          image: true,
          phone: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          metadata: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          isPlatformAdmin: true,
          ageBand: true,
          ageDeclaredAt: true,
        },
      })
      if (!profile) blockers.push("ACCOUNT_PROFILE_ANONYMIZATION_USER_MISSING")
      if (
        profile &&
        (profile.name.trim() ||
          profile.image?.trim() ||
          profile.phone?.trim() ||
          profile.firstName?.trim() ||
          profile.lastName?.trim() ||
          profile.displayName?.trim() ||
          profile.avatarUrl?.trim() ||
          profile.metadata !== null ||
          profile.emailVerifiedAt ||
          profile.phoneVerifiedAt ||
          profile.isPlatformAdmin ||
          profile.ageBand !== "UNDECLARED" ||
          profile.ageDeclaredAt)
      )
        blockers.push("ACCOUNT_PROFILE_PERSONAL_FIELDS_REMAIN")
      if (verifiedEmail) {
        // The verified contact remaining on the User is direct identity data;
        // an outcome digest alone cannot establish anonymization.
        const unchangedEmail = await db.user.count({
          where: {
            id: subjectId,
            email: { equals: verifiedEmail, mode: "insensitive" },
          },
        })
        if (unchangedEmail > 0)
          blockers.push("ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED")
      }
    }
    if (softwareSubscriptionOutcome?.disposition === "NOT_APPLICABLE") {
      // Checkout attribution is retained by user ID even if the User row is
      // later removed. A recorded checkout needs a reviewed outcome.
      const initiatedCheckouts = await db.billingCheckoutSession.count({
        where: { requestedByUserId: subjectId },
      })
      const refundReviewActions = await db.playRefundReviewResponse.count({
        where: { actorUserId: subjectId },
      })
      if (initiatedCheckouts > 0 || refundReviewActions > 0)
        blockers.push("SOFTWARE_SUBSCRIPTION_REVIEW_REQUIRED")
    }
    if (conversationOutcome?.disposition === "NOT_APPLICABLE") {
      // Revoking a link or expiring a WhatsApp candidate does not make the
      // subject's historical conversation data disappear. These records need
      // a domain-specific disposition even when no access remains active.
      const historicalLinks = await db.storeConversationAccountAccess.count({
        where: { accountUserId: subjectId },
      })
      const privacyRequests = await db.storeConversationPrivacyRequest.count({
        where: { accountUserId: subjectId },
      })
      const historicalCandidates =
        await db.storeConversationWhatsAppCandidate.count({
          where: {
            OR: [
              { accountUserId: subjectId },
              { accountAccess: { is: { accountUserId: subjectId } } },
            ],
          },
        })
      const directAttribution = await getAccountPrivacyConversationInventory(
        db,
        subjectId,
      )
      if (
        historicalLinks ||
        privacyRequests ||
        historicalCandidates ||
        Object.values(directAttribution).some((count) => count > 0)
      )
        blockers.push("CONVERSATION_REVIEW_REQUIRED")
    }
    if (commercialOutcome?.disposition === "NOT_APPLICABLE") {
      // Merchant transaction/actor facts survive User removal. Even a former
      // staff member's attribution needs a reviewed disposition, not a claim
      // that this domain held no data about the verified subject.
      const inventory = await getAccountPrivacyCommercialInventory(
        db,
        subjectId,
        request.requestKey === `account-deletion:${subjectId}`
          ? request.contactEmail
          : null,
      )
      if (Object.values(inventory).some((count) => count > 0))
        blockers.push("COMMERCIAL_RECORDS_REVIEW_REQUIRED")
    }
    if (prescriptionOutcome?.disposition === "NOT_APPLICABLE") {
      // A matching email is a review candidate, not automatic proof of
      // ownership or authority over another pharmacy's clinical records.
      const inventory = await getAccountPrivacyPrescriptionInventory(
        db,
        subjectId,
        verifiedEmail,
      )
      if (Object.values(inventory).some((count) => count > 0))
        blockers.push("PRESCRIPTION_RECORDS_REVIEW_REQUIRED")
    }
    if (memberships > 0) blockers.push("MEMBERSHIP_ACCESS_REMAINS")
    if (
      sessions > 0 ||
      identityTokens > 0 ||
      allProviderTokens > 0 ||
      pushEndpoints > 0
    )
      blockers.push("IDENTITY_ACCESS_REMAINS")
    if (
      staffProfiles > 0 ||
      openInvites > 0 ||
      teamAssignments > 0 ||
      conversationAssignments > 0 ||
      bookingResources > 0
    )
      blockers.push("MEMBERSHIP_DEPENDENCIES_REMAIN")
    if (linkedConversations > 0)
      blockers.push("ACCOUNT_CONVERSATION_ACCESS_REMAINS")
    if (
      pendingBridgeCapabilities > 0 ||
      nonRevokedBridges > 0 ||
      pendingAccountCandidates > 0
    )
      blockers.push("ACCOUNT_CONVERSATION_BRIDGE_REMAINS")
    if (
      unresolvedBridgePrompts > 0 ||
      unresolvedCandidatePrompts > 0 ||
      unresolvedOutboundSends > 0
    )
      blockers.push("ACCOUNT_CONVERSATION_PROVIDER_RECONCILIATION_REQUIRED")
  }
  const outcomes = new Map(
    request.domainOutcomes.map((outcome) => [outcome.domain, outcome]),
  )
  const latestDomainOutcomeAt = request.domainOutcomes.reduce<Date | null>(
    (latest, outcome) =>
      outcome.domain !== "OUTCOME_NOTICE" &&
      (!latest || outcome.processedAt > latest)
        ? outcome.processedAt
        : latest,
    null,
  )
  const noticeOutcome = outcomes.get("OUTCOME_NOTICE")
  if (noticeOutcome) {
    const matchingDeliveries = request.noticeAttempts.filter(
      (attempt) =>
        attempt.status === "DELIVERED" &&
        attempt.userId === request.verifiedSubjectUserId &&
        attempt.policyVersion === input.approvedPolicyVersion &&
        /^[a-f0-9]{64}$/i.test(attempt.contentDigest) &&
        /^[a-f0-9]{64}$/i.test(attempt.recipientDigest) &&
        attempt.providerMessageId?.trim() &&
        attempt.providerEventId?.trim() &&
        attempt.deliveryEvidenceDigest === noticeOutcome.evidenceDigest &&
        attempt.deliveredAt &&
        request.verifiedAt &&
        attempt.deliveredAt >= request.verifiedAt &&
        attempt.deliveredAt <= noticeOutcome.processedAt &&
        attempt.deliveredAt <= now,
    )
    if (matchingDeliveries.length !== 1)
      blockers.push("NOTICE_DELIVERY_UNCONFIRMED")
  }
  const missingDomains: Domain[] = []
  for (const domain of ACCOUNT_PRIVACY_REQUIRED_DOMAINS) {
    const outcome = outcomes.get(domain)
    if (!outcome) {
      missingDomains.push(domain)
      continue
    }
    if (
      !request.verifiedSubjectUserId ||
      outcome.userId !== request.verifiedSubjectUserId ||
      outcome.policyVersion !== input.approvedPolicyVersion ||
      !outcome.processor.trim() ||
      !/^[a-f0-9]{64}$/i.test(outcome.evidenceDigest) ||
      !request.verifiedAt ||
      outcome.processedAt < request.verifiedAt ||
      outcome.processedAt > now ||
      (domain === "OUTCOME_NOTICE" &&
        latestDomainOutcomeAt !== null &&
        outcome.processedAt < latestDomainOutcomeAt) ||
      !ACCOUNT_PRIVACY_ALLOWED_DISPOSITIONS[domain].includes(
        outcome.disposition,
      ) ||
      (outcome.disposition === "RETENTION_APPROVED" &&
        (!outcome.nextReviewAt || outcome.nextReviewAt <= now))
    ) {
      blockers.push(`INVALID_OUTCOME:${domain}`)
    }
  }
  return {
    eligible: blockers.length === 0 && missingDomains.length === 0,
    blockers,
    missingDomains,
  }
}

/** Final status transition after every domain outcome and current-state check. */
export async function completeAccountPrivacyRequest(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED !== "true"
  )
    throw new AccountPrivacyCompletionError("DISABLED")
  const approvedPolicyVersion =
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION?.trim()
  if (!approvedPolicyVersion)
    throw new AccountPrivacyCompletionError("POLICY_NOT_APPROVED")
  const now = input.now ?? new Date()
  return db.$transaction(
    async (tx) => {
      const operator = await tx.user.findUnique({
        where: { id: input.operatorUserId },
        select: { isPlatformAdmin: true },
      })
      if (!operator?.isPlatformAdmin)
        throw new AccountPrivacyCompletionError("OPERATOR_REQUIRED")
      const request = await tx.accountPrivacyRequest.findUnique({
        where: { id: input.requestId },
        select: {
          status: true,
          verifiedSubjectUserId: true,
          completedAt: true,
        },
      })
      if (!request) throw new AccountPrivacyCompletionError("NOT_FOUND")
      if (request.verifiedSubjectUserId === input.operatorUserId)
        throw new AccountPrivacyCompletionError("OPERATOR_REQUIRED")
      const assessment = await assessAccountPrivacyCompletion(
        tx,
        input.requestId,
        { approvedPolicyVersion, now },
      )
      const blockers = assessment.blockers.filter(
        (blocker) =>
          blocker !== "REQUEST_NOT_PROCESSING" ||
          request.status !== "COMPLETED",
      )
      if (blockers.length || assessment.missingDomains.length)
        throw new AccountPrivacyCompletionError("NOT_READY")
      if (request.status === "COMPLETED") {
        if (!request.completedAt)
          throw new AccountPrivacyCompletionError("NOT_READY")
        return {
          requestId: input.requestId,
          status: "COMPLETED" as const,
          completedAt: request.completedAt,
          replay: true,
        }
      }
      const completed = await tx.accountPrivacyRequest.updateMany({
        where: {
          id: input.requestId,
          status: "PROCESSING",
          verifiedSubjectUserId: request.verifiedSubjectUserId,
        },
        data: { status: "COMPLETED", completedAt: now },
      })
      if (completed.count !== 1)
        throw new AccountPrivacyCompletionError("CLAIM_CONFLICT")
      return {
        requestId: input.requestId,
        status: "COMPLETED" as const,
        completedAt: now,
        replay: false,
      }
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}
