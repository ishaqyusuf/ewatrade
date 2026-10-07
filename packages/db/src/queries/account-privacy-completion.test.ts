import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  ACCOUNT_PRIVACY_REQUIRED_DOMAINS,
  assessAccountPrivacyCompletion,
  completeAccountPrivacyRequest,
} from "./account-privacy-completion"
import {
  accountPrivacyProfileEvidence,
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"

const now = new Date("2026-09-25T00:00:00.000Z")
const digest = "a".repeat(64)
const policyVersion = "approved-retention-v1"
const serviceAttributionModels = [
  "serviceWorkEvent",
  "serviceWorkAssignment",
  "serviceDueCommitment",
  "serviceInternalNote",
  "serviceException",
  "serviceEvidence",
  "serviceEvidenceAuditEvent",
  "serviceRequestForm",
  "customerTrackingAccess",
  "serviceNotificationIntent",
  "serviceManualShare",
  "commerceInquiryAuditEvent",
] as const
const directConversationModels = [
  "storeConversationAccountLinkCommand",
  "storeConversationAccountDeviceCommand",
  "storeConversationAccountAuditEvent",
  "storeConversationActionMessage",
  "storeConversationAccountWatermark",
  "storeConversationAccountNotificationPreference",
  "storeConversationNotificationCommand",
  "storeConversationNotificationIntent",
  "storeConversationNotificationAuditEvent",
  "storeConversationWhatsAppBridgeAuditEvent",
  "storeConversationModerationCommand",
  "storeConversationModerationAuditEvent",
  "storeConversationSensitiveReadAuditEvent",
  "storeConversationAvailabilityConfiguration",
  "storeConversationAvailabilityAuditEvent",
  "storeConversationChannelConfiguration",
  "storeConversationChannelConfigurationAuditEvent",
] as const

function outcomes() {
  return ACCOUNT_PRIVACY_REQUIRED_DOMAINS.map((domain) => ({
    userId: "user-1",
    domain,
    disposition:
      domain === "IDENTITY_ACCESS" || domain === "MEMBERSHIP"
        ? "ACCESS_REVOKED"
        : domain === "ACCOUNT_PROFILE"
          ? "RETENTION_APPROVED"
          : domain === "OUTCOME_NOTICE"
            ? "NOTICE_DELIVERED"
            : "NOT_APPLICABLE",
    processor: `ewatrade:${domain.toLowerCase()}:v1`,
    policyVersion,
    evidenceDigest: digest,
    processedAt: new Date("2026-09-24T12:01:00.000Z"),
    nextReviewAt:
      domain === "ACCOUNT_PROFILE"
        ? new Date("2026-10-25T00:00:00.000Z")
        : (null as Date | null),
  }))
}

function fixture(
  overrides: Record<string, unknown> = {},
  live: {
    memberships?: number
    sessions?: number
    activeMobileOtp?: number
    storedMobileOtp?: number
    appleTokens?: number
    identityTokens?: number
    otherProviderTokens?: number
    pushEndpoints?: number
    staffProfiles?: number
    openInvites?: number
    teamAssignments?: number
    conversationAssignments?: number
    bookingResources?: number
    linkedConversations?: number
    historicalLinkedConversations?: number
    accountConversationPrivacyRequests?: number
    historicalAccountCandidates?: number
    directConversationAttribution?: Record<string, number>
    pendingBridgeCapabilities?: number
    nonRevokedBridges?: number
    pendingAccountCandidates?: number
    unresolvedBridgePrompts?: number
    unresolvedCandidatePrompts?: number
    unresolvedOutboundSends?: number
    initiatedCheckouts?: number
    refundReviewActions?: number
    commercialOrders?: number
    commercialPayments?: number
    commercialFulfillments?: number
    productReturns?: number
    serviceJobs?: number
    serviceIntakes?: number
    createdServiceRequests?: number
    legacyServiceQuotes?: number
    legacyServiceQuoteVersions?: number
    commerceQuotes?: number
    commerceQuoteVersions?: number
    customerDirectoryMatches?: number
    customerOrderMatches?: number
    serviceRequestMatches?: number
    commerceInquiryMatches?: number
    createdCommerceInquiries?: number
    serviceAttribution?: Record<string, number>
    pharmacyRoles?: number
    pharmacyRoleAuditEvents?: number
    staffAssistedPrescriptionRequests?: number
    pharmacistReviews?: number
    prescriptionRequestAuditEvents?: number
    prescriptionPrivacyRequests?: number
    prescriptionCustomerEmailMatches?: number
    prescriptionMediaAccessEvents?: number
    survivingUsers?: number
    unchangedProfileEmail?: number
    linkedAuthAccounts?: number
    legalAcceptances?: number
    profileFields?: Record<string, unknown> | null
    additional?: string
  } = {},
) {
  const linkedConversationQueries: unknown[] = []
  const privacyRequestQueries: unknown[] = []
  const bridgeQueries: unknown[] = []
  const invitationQueries: unknown[] = []
  const checkoutQueries: unknown[] = []
  const refundReviewQueries: unknown[] = []
  const commercialQueries: Record<string, unknown[]> = {
    orders: [],
    payments: [],
    fulfillments: [],
    returns: [],
    serviceJobs: [],
    serviceIntakes: [],
    serviceQuotes: [],
    serviceQuoteVersions: [],
    commerceQuotes: [],
    commerceQuoteVersions: [],
    customers: [],
    serviceRequests: [],
    commerceInquiries: [],
  }
  const expandedCommercialQueries: Record<string, unknown[]> = {}
  const directConversationQueries: Record<string, unknown[]> = {}
  const userQueries: unknown[] = []
  const profileQueries: unknown[] = []
  const verificationQueries: unknown[] = []
  const request = {
    id: "request-1",
    requestKey: "account-deletion:user-1",
    userId: "user-1",
    contactEmail: "user@example.test",
    user: { email: "user@example.test", emailVerified: true },
    verifiedSubjectUserId: "user-1",
    verifiedAt: new Date("2026-09-24T12:00:00.000Z"),
    status: "PROCESSING",
    completedAt: null as Date | null,
    accessRevocation: { status: "REVOKED", userId: "user-1" },
    domainOutcomes: outcomes(),
    noticeAttempts: [
      {
        userId: "user-1",
        status: "DELIVERED",
        policyVersion,
        contentDigest: digest,
        recipientDigest: digest,
        providerMessageId: "provider-message-1",
        providerEventId: "provider-event-1",
        deliveryEvidenceDigest: digest,
        deliveredAt: new Date("2026-09-24T12:00:30.000Z"),
      },
    ],
    ...overrides,
  }
  const db = {
    ...Object.fromEntries(
      [
        "assistantConversation",
        "assistantRun",
        "message",
        "automationEvent",
        "productAnalyticsEvent",
      ].map((model) => [
        model,
        { count: async () => (live.additional === model ? 1 : 0) },
      ]),
    ),
    accountPrivacyRequest: { findUnique: async () => request },
    user: {
      findUnique: async (query: unknown) => {
        profileQueries.push(query)
        return live.profileFields === undefined
          ? {
              name: "",
              image: null,
              phone: null,
              firstName: null,
              lastName: null,
              displayName: null,
              avatarUrl: null,
              metadata: null,
              emailVerified: false,
              emailVerifiedAt: null,
              phoneVerifiedAt: null,
              isPlatformAdmin: false,
              ageBand: "UNDECLARED",
              ageDeclaredAt: null,
            }
          : live.profileFields
      },
      count: async (query: unknown) => {
        userQueries.push(query)
        return (query as { where: { email?: unknown } }).where.email
          ? (live.unchangedProfileEmail ?? 1)
          : (live.survivingUsers ?? 1)
      },
    },
    legalAcceptance: { count: async () => live.legalAcceptances ?? 0 },
    membership: { count: async () => live.memberships ?? 0 },
    session: { count: async () => live.sessions ?? 0 },
    verification: {
      count: async (query: unknown) => {
        verificationQueries.push(query)
        return (query as { where: { expiresAt?: unknown } }).where.expiresAt
          ? (live.activeMobileOtp ?? 0)
          : (live.storedMobileOtp ?? 0)
      },
    },
    account: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        where.idToken
          ? (live.identityTokens ?? 0)
          : where.OR
            ? (live.appleTokens ?? 0) + (live.otherProviderTokens ?? 0)
            : (live.linkedAuthAccounts ?? live.appleTokens ?? 0),
    },
    storeConversationPushEndpoint: {
      count: async (query: { where: { status?: string } }) =>
        query.where.status === "ACTIVE"
          ? (live.pushEndpoints ?? 0)
          : (live.directConversationAttribution
              ?.storeConversationPushEndpoint ??
            live.pushEndpoints ??
            0),
    },
    retailOpsStaffProfile: { count: async () => live.staffProfiles ?? 0 },
    retailOpsStaffInviteToken: {
      count: async (query: unknown) => {
        invitationQueries.push(query)
        return live.openInvites ?? 0
      },
    },
    serviceCommerceStoreTeamAssignment: {
      count: async () => live.teamAssignments ?? 0,
    },
    storeConversation: {
      count: async () => live.conversationAssignments ?? 0,
    },
    serviceBookingResource: {
      count: async () => live.bookingResources ?? 0,
    },
    storeConversationAccountAccess: {
      count: async (query: unknown) => {
        linkedConversationQueries.push(query)
        const where = (query as { where: { status?: string } }).where
        return where.status === "ACTIVE"
          ? (live.linkedConversations ?? 0)
          : (live.historicalLinkedConversations ??
              live.linkedConversations ??
              0)
      },
    },
    storeConversationPrivacyRequest: {
      count: async (query: unknown) => {
        privacyRequestQueries.push(query)
        return live.accountConversationPrivacyRequests ?? 0
      },
    },
    ...Object.fromEntries(
      directConversationModels.map((name) => [
        name,
        {
          count: async (query: unknown) => {
            if (!directConversationQueries[name])
              directConversationQueries[name] = []
            directConversationQueries[name].push(query)
            return live.directConversationAttribution?.[name] ?? 0
          },
        },
      ]),
    ),
    storeConversationWhatsAppBridgeCapability: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        return live.pendingBridgeCapabilities ?? 0
      },
    },
    storeConversationWhatsAppBridge: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        return live.nonRevokedBridges ?? 0
      },
    },
    storeConversationWhatsAppCandidate: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        const where = (query as { where: { status?: string } }).where
        return where.status === "PENDING"
          ? (live.pendingAccountCandidates ?? 0)
          : (live.historicalAccountCandidates ??
              live.pendingAccountCandidates ??
              0)
      },
    },
    storeConversationWhatsAppBridgeAttempt: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        return live.unresolvedBridgePrompts ?? 0
      },
    },
    storeConversationWhatsAppCandidateAttempt: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        return live.unresolvedCandidatePrompts ?? 0
      },
    },
    storeConversationWhatsAppOutboundAttempt: {
      count: async (query: unknown) => {
        bridgeQueries.push(query)
        return live.unresolvedOutboundSends ?? 0
      },
    },
    billingCheckoutSession: {
      count: async (query: unknown) => {
        checkoutQueries.push(query)
        return live.initiatedCheckouts ?? 0
      },
    },
    playRefundReviewResponse: {
      count: async (query: unknown) => {
        refundReviewQueries.push(query)
        return live.refundReviewActions ?? 0
      },
    },
    commercialOrder: {
      count: async (query: unknown) => {
        commercialQueries.orders?.push(query)
        return (query as { where: { customerEmail?: unknown } }).where
          .customerEmail
          ? (live.customerOrderMatches ?? 0)
          : (live.commercialOrders ?? 0)
      },
    },
    customer: {
      count: async (query: unknown) => {
        commercialQueries.customers?.push(query)
        return live.customerDirectoryMatches ?? 0
      },
    },
    serviceRequest: {
      count: async (query: unknown) => {
        commercialQueries.serviceRequests?.push(query)
        return (query as { where: { customerEmail?: unknown } }).where
          .customerEmail
          ? (live.serviceRequestMatches ?? 0)
          : (live.createdServiceRequests ?? 0)
      },
    },
    serviceIntake: {
      count: async (query: unknown) => {
        commercialQueries.serviceIntakes?.push(query)
        return live.serviceIntakes ?? 0
      },
    },
    serviceQuote: {
      count: async (query: unknown) => {
        commercialQueries.serviceQuotes?.push(query)
        return live.legacyServiceQuotes ?? 0
      },
    },
    serviceQuoteVersion: {
      count: async (query: unknown) => {
        commercialQueries.serviceQuoteVersions?.push(query)
        return live.legacyServiceQuoteVersions ?? 0
      },
    },
    commerceQuote: {
      count: async (query: unknown) => {
        commercialQueries.commerceQuotes?.push(query)
        return live.commerceQuotes ?? 0
      },
    },
    commerceQuoteVersion: {
      count: async (query: unknown) => {
        commercialQueries.commerceQuoteVersions?.push(query)
        return live.commerceQuoteVersions ?? 0
      },
    },
    commerceInquiry: {
      count: async (query: unknown) => {
        commercialQueries.commerceInquiries?.push(query)
        return (query as { where: { customerEmail?: unknown } }).where
          .customerEmail
          ? (live.commerceInquiryMatches ?? 0)
          : (live.createdCommerceInquiries ?? 0)
      },
    },
    ...Object.fromEntries(
      serviceAttributionModels.map((name) => [
        name,
        {
          count: async (query: unknown) => {
            if (!expandedCommercialQueries[name])
              expandedCommercialQueries[name] = []
            expandedCommercialQueries[name].push(query)
            return live.serviceAttribution?.[name] ?? 0
          },
        },
      ]),
    ),
    commercialOrderPayment: {
      count: async (query: unknown) => {
        commercialQueries.payments?.push(query)
        return live.commercialPayments ?? 0
      },
    },
    commercialOrderFulfillmentCommand: {
      count: async (query: unknown) => {
        commercialQueries.fulfillments?.push(query)
        return live.commercialFulfillments ?? 0
      },
    },
    productReturn: {
      count: async (query: unknown) => {
        commercialQueries.returns?.push(query)
        return live.productReturns ?? 0
      },
    },
    serviceJob: {
      count: async (query: unknown) => {
        commercialQueries.serviceJobs?.push(query)
        return live.serviceJobs ?? 0
      },
    },
    prescriptionStoreRole: { count: async () => live.pharmacyRoles ?? 0 },
    prescriptionStoreAuditEvent: {
      count: async () => live.pharmacyRoleAuditEvents ?? 0,
    },
    prescriptionPharmacistReview: {
      count: async () => live.pharmacistReviews ?? 0,
    },
    prescriptionRequestAuditEvent: {
      count: async () => live.prescriptionRequestAuditEvents ?? 0,
    },
    prescriptionRequest: {
      count: async ({ where }: { where: Record<string, unknown> }) =>
        where.customerEmail
          ? (live.prescriptionCustomerEmailMatches ?? 0)
          : (live.staffAssistedPrescriptionRequests ?? 0),
    },
    prescriptionPrivacyRequest: {
      count: async () => live.prescriptionPrivacyRequests ?? 0,
    },
    ...Object.fromEntries(
      [
        "prescriptionStoreSettings",
        "prescriptionChannel",
        "prescriptionMedia",
        "prescriptionMediaAccessEvent",
        "prescriptionTranscription",
        "prescriptionTranscriptionLine",
        "prescriptionLineMapping",
        "prescriptionPaymentRefund",
        "prescriptionPickupFulfillment",
        "prescriptionPickupEvent",
        "prescriptionDeliveryZone",
        "prescriptionDeliveryAddress",
        "prescriptionDeliveryAssignment",
        "prescriptionDeliveryEvent",
        "prescriptionRetentionPolicy",
        "prescriptionIncidentControl",
        "prescriptionSensitiveAccessEvent",
      ].map((name) => [
        name,
        {
          count: async () =>
            name === "prescriptionMediaAccessEvent"
              ? (live.prescriptionMediaAccessEvents ?? 0)
              : 0,
        },
      ]),
    ),
  } as unknown as PrismaClient
  return {
    db,
    request,
    linkedConversationQueries,
    privacyRequestQueries,
    bridgeQueries,
    directConversationQueries,
    invitationQueries,
    checkoutQueries,
    refundReviewQueries,
    commercialQueries,
    expandedCommercialQueries,
    userQueries,
    profileQueries,
    verificationQueries,
  }
}

describe("account privacy completion assessment", () => {
  test.each([
    ["pharmacy role", { pharmacyRoles: 1 }],
    ["pharmacy role audit", { pharmacyRoleAuditEvents: 1 }],
    ["staff-assisted request", { staffAssistedPrescriptionRequests: 1 }],
    ["pharmacist review", { pharmacistReviews: 1 }],
    ["request audit", { prescriptionRequestAuditEvents: 1 }],
    ["pharmacy privacy request", { prescriptionPrivacyRequests: 1 }],
    ["customer email match", { prescriptionCustomerEmailMatches: 1 }],
    ["clinical media access", { prescriptionMediaAccessEvents: 1 }],
  ])("rejects prescription NOT_APPLICABLE for a %s", async (_label, live) => {
    const { db } = fixture({ userId: null, user: null }, live)
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "PRESCRIPTION_RECORDS_REVIEW_REQUIRED",
    )
  })

  test("requires one durable delivery attempt for the notice outcome", async () => {
    const missing = fixture({ noticeAttempts: [] })
    const withoutAttempt = await assessAccountPrivacyCompletion(
      missing.db,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(withoutAttempt.blockers).toContain("NOTICE_DELIVERY_UNCONFIRMED")

    const wrongRecipient = fixture({
      noticeAttempts: [
        {
          userId: "another-user",
          status: "DELIVERED",
          policyVersion,
          contentDigest: digest,
          recipientDigest: digest,
          providerMessageId: "provider-message-1",
          providerEventId: "provider-event-1",
          deliveryEvidenceDigest: digest,
          deliveredAt: new Date("2026-09-24T12:00:30.000Z"),
        },
      ],
    })
    const mismatched = await assessAccountPrivacyCompletion(
      wrongRecipient.db,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(mismatched.blockers).toContain("NOTICE_DELIVERY_UNCONFIRMED")
  })
  test("blocks live mobile OTP access and leftover profile verification data", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ERASURE_CONFIRMED"
    profile.nextReviewAt = null
    const { db, verificationQueries } = fixture(
      { domainOutcomes: rows },
      { survivingUsers: 0, activeMobileOtp: 1, storedMobileOtp: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("IDENTITY_VERIFICATION_REMAINS")
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_VERIFICATION_REMAINS",
    )
    expect(verificationQueries).toEqual([
      {
        where: {
          identifier: {
            in: [
              "mobile-auth:login:user@example.test",
              "mobile-auth:sign_up:user@example.test",
            ],
          },
          expiresAt: { gt: now },
        },
      },
      {
        where: {
          identifier: {
            in: [
              "mobile-auth:login:user@example.test",
              "mobile-auth:sign_up:user@example.test",
            ],
          },
        },
      },
    ])
  })

  test("retained expired OTP does not certify profile erasure", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    const { db } = fixture(
      { domainOutcomes: rows },
      { activeMobileOtp: 0, storedMobileOtp: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).not.toContain("IDENTITY_VERIFICATION_REMAINS")
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_VERIFICATION_REMAINS",
    )
  })
  test("fails closed when scope or policy is incomplete", async () => {
    const { db } = fixture({ domainOutcomes: outcomes().slice(0, 2) })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1")
    expect(assessment.eligible).toBe(false)
    expect(assessment.blockers).toContain("POLICY_NOT_APPROVED")
    expect(assessment.missingDomains).toContain("PRESCRIPTIONS")
    expect(assessment.missingDomains).toContain("OUTCOME_NOTICE")
  })

  test("refuses forged scope, weak evidence and an unrevoked access stage", async () => {
    const rows = outcomes()
    const pharmacy = rows.find((row) => row.domain === "PRESCRIPTIONS")
    if (!pharmacy) throw new Error("Missing pharmacy fixture")
    pharmacy.userId = "another-user"
    pharmacy.evidenceDigest = "raw clinical data"
    const { db } = fixture({
      accessRevocation: { status: "FAILED" },
      domainOutcomes: rows,
    })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.eligible).toBe(false)
    expect(assessment.blockers).toContain("ACCESS_NOT_REVOKED")
    expect(assessment.blockers).toContain("INVALID_OUTCOME:PRESCRIPTIONS")
  })

  test("retained records require a future review date and matching approved policy", async () => {
    const rows = outcomes()
    const commercial = rows.find((row) => row.domain === "COMMERCIAL_RECORDS")
    if (!commercial) throw new Error("Missing commercial fixture")
    commercial.disposition = "RETENTION_APPROVED"
    commercial.nextReviewAt = new Date("2026-09-24T00:00:00.000Z")
    const { db } = fixture({ domainOutcomes: rows })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("INVALID_OUTCOME:COMMERCIAL_RECORDS")
    commercial.nextReviewAt = new Date("2026-10-25T00:00:00.000Z")
    commercial.policyVersion = "different-policy"
    const mismatch = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(mismatch.blockers).toContain("INVALID_OUTCOME:COMMERCIAL_RECORDS")
  })

  test("requires domain evidence after verification and notice after all outcomes", async () => {
    const rows = outcomes()
    const pharmacy = rows.find((row) => row.domain === "PRESCRIPTIONS")
    const notice = rows.find((row) => row.domain === "OUTCOME_NOTICE")
    if (!pharmacy || !notice) throw new Error("Missing outcome fixture")
    pharmacy.processedAt = new Date("2026-09-24T11:59:00.000Z")
    const { db } = fixture({ domainOutcomes: rows })
    const beforeVerification = await assessAccountPrivacyCompletion(
      db,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(beforeVerification.blockers).toContain(
      "INVALID_OUTCOME:PRESCRIPTIONS",
    )

    pharmacy.processedAt = new Date("2026-09-24T12:02:00.000Z")
    const prematureNotice = await assessAccountPrivacyCompletion(
      db,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(prematureNotice.blockers).toContain("INVALID_OUTCOME:OUTCOME_NOTICE")

    notice.processedAt = new Date("2026-09-25T00:01:00.000Z")
    const futureNotice = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(futureNotice.blockers).toContain("INVALID_OUTCOME:OUTCOME_NOTICE")

    notice.processedAt = new Date("2026-09-24T12:02:00.000Z")
    const ordered = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(ordered.eligible).toBe(true)
  })

  test("recognizes a complete evidence set without mutating the request", async () => {
    const { db, request } = fixture()
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment).toEqual({
      eligible: true,
      blockers: [],
      missingDomains: [],
    })
    expect(request.status).toBe("PROCESSING")
  })

  test("checks the verified intake email after the User relation is cleared", async () => {
    const { db, invitationQueries } = fixture({ userId: null, user: null })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.eligible).toBe(true)
    expect(invitationQueries).toEqual([
      {
        where: {
          status: "ACTIVE",
          OR: [
            { invitedUserId: "user-1" },
            { membership: { is: { userId: "user-1" } } },
            {
              invitedUserId: null,
              email: { equals: "user@example.test", mode: "insensitive" },
            },
          ],
        },
      },
    ])
  })

  test("refuses to complete a removed User's request when invitation email provenance is missing", async () => {
    const { db } = fixture({
      userId: null,
      user: null,
      requestKey: "external-deletion:legacy",
    })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("EMAIL_INVITATION_REVIEW_REQUIRED")
  })

  test("rejects an unclaimed email invitation after the User relation is cleared", async () => {
    const { db } = fixture({ userId: null, user: null }, { openInvites: 1 })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("MEMBERSHIP_DEPENDENCIES_REMAIN")
  })

  test("rejects a live User relation that points to another subject", async () => {
    const { db } = fixture({ userId: "another-user" })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("SUBJECT_MISMATCH")
  })

  test("rejects an access stage bound to another subject", async () => {
    const { db } = fixture({
      accessRevocation: { status: "REVOKED", userId: "another-user" },
    })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("ACCESS_NOT_REVOKED")
  })

  test("rejects stale outcome rows while membership or access remains live", async () => {
    const { db } = fixture({}, { memberships: 1, sessions: 1, appleTokens: 1 })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.eligible).toBe(false)
    expect(assessment.blockers).toContain("MEMBERSHIP_ACCESS_REMAINS")
    expect(assessment.blockers).toContain("IDENTITY_ACCESS_REMAINS")
  })

  test("rejects stored identity and unhandled provider tokens despite outcomes", async () => {
    const { db } = fixture({}, { identityTokens: 1, otherProviderTokens: 1 })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("IDENTITY_ACCESS_REMAINS")
  })

  test("does not accept account-profile erasure while the verified User survives", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ERASURE_CONFIRMED"
    profile.nextReviewAt = null
    const { db, userQueries } = fixture(
      { domainOutcomes: rows, userId: null, user: null },
      { survivingUsers: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("ACCOUNT_PROFILE_ERASURE_UNCONFIRMED")
    expect(userQueries).toEqual([{ where: { id: "user-1" } }])

    const { db: erasedDb } = fixture(
      { domainOutcomes: rows, userId: null, user: null },
      { survivingUsers: 0 },
    )
    const erased = await assessAccountPrivacyCompletion(erasedDb, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(erased.blockers).not.toContain("ACCOUNT_PROFILE_ERASURE_UNCONFIRMED")
  })

  test("does not accept profile anonymization while the original email remains", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    const { db, userQueries } = fixture({ domainOutcomes: rows })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED",
    )
    expect(userQueries).toEqual([
      {
        where: {
          id: "user-1",
          email: { equals: "user@example.test", mode: "insensitive" },
        },
      },
    ])

    const {
      db: anonymizedDb,
      invitationQueries,
      verificationQueries,
    } = fixture(
      {
        domainOutcomes: rows,
        user: { email: "anonymous-user-1@example.test", emailVerified: false },
      },
      { unchangedProfileEmail: 0 },
    )
    const anonymized = await assessAccountPrivacyCompletion(
      anonymizedDb,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(anonymized.blockers).not.toContain(
      "ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED",
    )
    expect(anonymized.blockers).not.toContain(
      "EMAIL_INVITATION_REVIEW_REQUIRED",
    )
    expect(JSON.stringify(invitationQueries)).toContain("user@example.test")
    expect(JSON.stringify(invitationQueries)).not.toContain(
      "anonymous-user-1@example.test",
    )
    expect(JSON.stringify(verificationQueries)).toContain("user@example.test")
  })

  test("does not trust a stale profile outcome to replace email review scope", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    profile.processedAt = new Date("2026-09-24T11:59:00.000Z")
    const { db } = fixture({
      domainOutcomes: rows,
      user: { email: "anonymous-user-1@example.test", emailVerified: false },
    })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("EMAIL_INVITATION_REVIEW_REQUIRED")
  })

  test("does not accept profile anonymization while a password or provider account remains", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    const { db } = fixture(
      { domainOutcomes: rows },
      { unchangedProfileEmail: 0, linkedAuthAccounts: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_AUTH_ACCOUNT_REMAINS",
    )
    expect(assessment.blockers).not.toContain(
      "ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED",
    )
  })

  test("does not claim anonymization for a removed User", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    const { db } = fixture(
      { domainOutcomes: rows, userId: null, user: null },
      { profileFields: null, unchangedProfileEmail: 0 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_ANONYMIZATION_USER_MISSING",
    )
  })

  test("does not accept profile anonymization while personal profile fields remain", async () => {
    const rows = outcomes()
    const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
    if (!profile) throw new Error("Missing profile fixture")
    profile.disposition = "ANONYMIZATION_CONFIRMED"
    profile.nextReviewAt = null
    const { db } = fixture(
      { domainOutcomes: rows },
      {
        unchangedProfileEmail: 0,
        profileFields: {
          name: "An Old Name",
          image: null,
          phone: null,
          firstName: null,
          lastName: null,
          displayName: null,
          avatarUrl: null,
          metadata: null,
          emailVerified: false,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          isPlatformAdmin: false,
        },
      },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "ACCOUNT_PROFILE_PERSONAL_FIELDS_REMAIN",
    )
    expect(assessment.blockers).not.toContain(
      "ACCOUNT_PROFILE_ANONYMIZATION_UNCONFIRMED",
    )
  })

  test.each([
    ["younger teen band", "AGE_13_TO_15", null],
    ["older teen band", "AGE_16_TO_17", null],
    ["adult band", "ADULT", null],
    ["declaration timestamp", "UNDECLARED", new Date("2026-09-01T00:00:00Z")],
    ["cleared declaration", "UNDECLARED", null],
  ])(
    "anonymization checks %s independently of identity fields",
    async (_label, ageBand, ageDeclaredAt) => {
      const rows = outcomes()
      const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
      if (!profile) throw new Error("Missing profile fixture")
      profile.disposition = "ANONYMIZATION_CONFIRMED"
      profile.nextReviewAt = null
      const { db, profileQueries } = fixture(
        { domainOutcomes: rows },
        {
          unchangedProfileEmail: 0,
          profileFields: {
            name: "",
            image: null,
            phone: null,
            firstName: null,
            lastName: null,
            displayName: null,
            avatarUrl: null,
            metadata: null,
            emailVerifiedAt: null,
            phoneVerifiedAt: null,
            isPlatformAdmin: false,
            ageBand,
            ageDeclaredAt,
          },
        },
      )
      const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
        approvedPolicyVersion: policyVersion,
        now,
      })
      expect(
        assessment.blockers.includes("ACCOUNT_PROFILE_PERSONAL_FIELDS_REMAIN"),
      ).toBe(ageBand !== "UNDECLARED" || ageDeclaredAt !== null)
      expect(profileQueries).toContainEqual(
        expect.objectContaining({
          select: expect.objectContaining({
            ageBand: true,
            ageDeclaredAt: true,
          }),
        }),
      )
    },
  )

  test.each([
    "clean",
    "age remains",
    "auth remains",
    "OTP remains",
    "bad digest",
    "wrong email",
    "missing policy",
  ])(
    "minimized retention outcome requires current proof: %s",
    async (scenario) => {
      const envKeys = [
        "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
        "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
        "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
      ]
      const previous = Object.fromEntries(
        envKeys.map((key) => [key, process.env[key]]),
      )
      try {
        const source = JSON.stringify({
          version: policyVersion,
          approvalReference: "qa-only-profile-review",
          approvedAt: "2026-09-24T00:00:00.000Z",
          mode: "PSEUDONYMIZE",
          legalAcceptanceDisposition: "RETAIN",
          retentionPurpose: "QA retained linkage",
          reviewAt: "2026-10-25T00:00:00.000Z",
        })
        process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
        process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = source
        process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = createHash(
          "sha256",
        )
          .update(source)
          .digest("hex")
        const policy = getApprovedAccountPrivacyProfilePolicy(process.env, now)
        if (!policy) throw new Error("QA profile policy missing")
        const rows = outcomes()
        const profile = rows.find((row) => row.domain === "ACCOUNT_PROFILE")
        if (!profile) throw new Error("Profile outcome missing")
        profile.processor = "account-privacy-profile-v1"
        profile.evidenceDigest =
          scenario === "bad digest"
            ? "b".repeat(64)
            : accountPrivacyProfileEvidence({
                requestId: "request-1",
                subjectId: "user-1",
                policy,
                legalAcceptanceCount: 2,
              })
        const email =
          scenario === "wrong email"
            ? "different@example.test"
            : accountPrivacyPseudonymousEmail("request-1", "user-1")
        const { db } = fixture(
          { domainOutcomes: rows, user: { email, emailVerified: false } },
          {
            unchangedProfileEmail: 0,
            linkedAuthAccounts: scenario === "auth remains" ? 1 : 0,
            storedMobileOtp: scenario === "OTP remains" ? 1 : 0,
            legalAcceptances: 2,
            profileFields: {
              email,
              name: "",
              image: null,
              phone: null,
              firstName: null,
              lastName: null,
              displayName: null,
              avatarUrl: null,
              metadata: null,
              emailVerifiedAt: null,
              phoneVerifiedAt: null,
              isPlatformAdmin: false,
              ageBand: scenario === "age remains" ? "ADULT" : "UNDECLARED",
              ageDeclaredAt: null,
            },
          },
        )
        if (scenario === "missing policy")
          Reflect.deleteProperty(
            process.env,
            "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
          )
        const assessment = await assessAccountPrivacyCompletion(
          db,
          "request-1",
          { approvedPolicyVersion: policyVersion, now },
        )
        expect(
          assessment.blockers.includes(
            "ACCOUNT_PROFILE_MINIMIZATION_UNCONFIRMED",
          ),
        ).toBe(scenario !== "clean")
        expect(assessment.eligible).toBe(scenario === "clean")
      } finally {
        for (const key of envKeys) {
          if (previous[key] === undefined)
            Reflect.deleteProperty(process.env, key)
          else process.env[key] = previous[key]
        }
      }
    },
  )

  test("requires a real subscription outcome when the subject initiated checkout", async () => {
    const rows = outcomes()
    const subscription = rows.find(
      (row) => row.domain === "SOFTWARE_SUBSCRIPTIONS",
    )
    if (!subscription) throw new Error("Missing subscription fixture")
    const { db, checkoutQueries, refundReviewQueries } = fixture(
      { domainOutcomes: rows, userId: null, user: null },
      { initiatedCheckouts: 1 },
    )
    const notApplicable = await assessAccountPrivacyCompletion(
      db,
      "request-1",
      { approvedPolicyVersion: policyVersion, now },
    )
    expect(notApplicable.blockers).toContain(
      "SOFTWARE_SUBSCRIPTION_REVIEW_REQUIRED",
    )
    expect(checkoutQueries).toEqual([
      { where: { requestedByUserId: "user-1" } },
    ])
    expect(refundReviewQueries).toEqual([{ where: { actorUserId: "user-1" } }])
    subscription.disposition = "RETENTION_APPROVED"
    subscription.nextReviewAt = new Date("2026-10-25T00:00:00.000Z")
    const reviewed = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(reviewed.eligible).toBe(true)
  })

  test("requires subscription review for a historical refund action after User removal", async () => {
    const { db } = fixture(
      { userId: null, user: null },
      { refundReviewActions: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "SOFTWARE_SUBSCRIPTION_REVIEW_REQUIRED",
    )
  })

  test.each([
    ["order", { commercialOrders: 1 }],
    ["payment", { commercialPayments: 1 }],
    ["fulfillment", { commercialFulfillments: 1 }],
    ["return", { productReturns: 1 }],
    ["service job", { serviceJobs: 1 }],
    ["service intake", { serviceIntakes: 1 }],
    ["service request creator", { createdServiceRequests: 1 }],
    ["legacy service quote", { legacyServiceQuotes: 1 }],
    ["legacy service quote version", { legacyServiceQuoteVersions: 1 }],
    ["commerce quote", { commerceQuotes: 1 }],
    ["commerce quote version", { commerceQuoteVersions: 1 }],
    ["customer directory", { customerDirectoryMatches: 1 }],
    ["customer order", { customerOrderMatches: 1 }],
    ["service request", { serviceRequestMatches: 1 }],
    ["commerce inquiry", { commerceInquiryMatches: 1 }],
    ["commerce inquiry creator", { createdCommerceInquiries: 1 }],
  ])(
    "requires a commercial outcome for a historical %s actor",
    async (_label, live) => {
      const rows = outcomes()
      const commercial = rows.find((row) => row.domain === "COMMERCIAL_RECORDS")
      if (!commercial) throw new Error("Missing commercial fixture")
      const { db, commercialQueries } = fixture(
        { domainOutcomes: rows, userId: null, user: null },
        live,
      )
      const notApplicable = await assessAccountPrivacyCompletion(
        db,
        "request-1",
        { approvedPolicyVersion: policyVersion, now },
      )
      expect(notApplicable.blockers).toContain(
        "COMMERCIAL_RECORDS_REVIEW_REQUIRED",
      )
      expect(commercialQueries).toEqual({
        orders: [
          { where: { createdByUserId: "user-1" } },
          {
            where: {
              customerEmail: {
                equals: "user@example.test",
                mode: "insensitive",
              },
            },
          },
        ],
        payments: [{ where: { recordedByUserId: "user-1" } }],
        fulfillments: [{ where: { actorUserId: "user-1" } }],
        returns: [{ where: { actorUserId: "user-1" } }],
        serviceJobs: [
          {
            where: {
              OR: [
                { createdByUserId: "user-1" },
                { handedOffByUserId: "user-1" },
                { currentAssigneeUserId: "user-1" },
              ],
            },
          },
        ],
        serviceIntakes: [{ where: { createdByUserId: "user-1" } }],
        serviceQuotes: [{ where: { createdByUserId: "user-1" } }],
        serviceQuoteVersions: [{ where: { createdByUserId: "user-1" } }],
        commerceQuotes: [{ where: { createdByUserId: "user-1" } }],
        commerceQuoteVersions: [{ where: { createdByUserId: "user-1" } }],
        customers: [
          {
            where: {
              OR: [
                { normalizedEmail: "user@example.test" },
                {
                  email: {
                    equals: "user@example.test",
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        ],
        serviceRequests: [
          { where: { createdByUserId: "user-1" } },
          {
            where: {
              customerEmail: {
                equals: "user@example.test",
                mode: "insensitive",
              },
            },
          },
        ],
        commerceInquiries: [
          { where: { createdByUserId: "user-1" } },
          {
            where: {
              customerEmail: {
                equals: "user@example.test",
                mode: "insensitive",
              },
            },
          },
        ],
      })
      commercial.disposition = "RETENTION_APPROVED"
      commercial.nextReviewAt = new Date("2026-10-25T00:00:00.000Z")
      const reviewed = await assessAccountPrivacyCompletion(db, "request-1", {
        approvedPolicyVersion: policyVersion,
        now,
      })
      expect(reviewed.blockers).not.toContain(
        "COMMERCIAL_RECORDS_REVIEW_REQUIRED",
      )
    },
  )

  test.each([
    ["serviceWorkEvent", { actorUserId: "user-1" }],
    [
      "serviceWorkAssignment",
      {
        OR: [
          { assignedUserId: "user-1" },
          { previousUserId: "user-1" },
          { assignedByUserId: "user-1" },
        ],
      },
    ],
    ["serviceDueCommitment", { createdByUserId: "user-1" }],
    ["serviceInternalNote", { actorUserId: "user-1" }],
    [
      "serviceException",
      {
        OR: [{ actorUserId: "user-1" }, { resolvedByUserId: "user-1" }],
      },
    ],
    ["serviceEvidence", { uploaderUserId: "user-1" }],
    ["serviceEvidenceAuditEvent", { actorUserId: "user-1" }],
    ["serviceRequestForm", { createdByUserId: "user-1" }],
    [
      "customerTrackingAccess",
      {
        OR: [{ createdByUserId: "user-1" }, { revokedByUserId: "user-1" }],
      },
    ],
    ["serviceNotificationIntent", { createdByUserId: "user-1" }],
    ["serviceManualShare", { sharedByUserId: "user-1" }],
    ["commerceInquiryAuditEvent", { actorUserId: "user-1" }],
  ] as const)(
    "requires commercial review for %s attribution after User removal",
    async (delegate, where) => {
      const { db, expandedCommercialQueries } = fixture(
        { userId: null, user: null },
        { serviceAttribution: { [delegate]: 1 } },
      )
      const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
        approvedPolicyVersion: policyVersion,
        now,
      })
      expect(assessment.blockers).toContain(
        "COMMERCIAL_RECORDS_REVIEW_REQUIRED",
      )
      expect(expandedCommercialQueries[delegate]).toEqual([{ where }])
    },
  )

  test("rejects unfinished staff, invitation and work handover", async () => {
    const { db } = fixture(
      {},
      { staffProfiles: 1, openInvites: 1, conversationAssignments: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("MEMBERSHIP_DEPENDENCIES_REMAIN")
  })

  test("rejects active Customer Account conversation links despite outcome rows", async () => {
    const { db, linkedConversationQueries } = fixture(
      {},
      { linkedConversations: 1 },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("ACCOUNT_CONVERSATION_ACCESS_REMAINS")
    expect(linkedConversationQueries).toEqual([
      { where: { accountUserId: "user-1", status: "ACTIVE" } },
      { where: { accountUserId: "user-1" } },
    ])
  })

  test.each([
    ["revoked account link", { historicalLinkedConversations: 1 }],
    ["privacy request", { accountConversationPrivacyRequests: 1 }],
    ["resolved WhatsApp candidate", { historicalAccountCandidates: 1 }],
  ])(
    "requires a conversation outcome for a historical %s",
    async (_label, live) => {
      const rows = outcomes()
      const conversation = rows.find((row) => row.domain === "CONVERSATIONS")
      if (!conversation) throw new Error("Missing conversation fixture")
      const {
        db,
        linkedConversationQueries,
        privacyRequestQueries,
        bridgeQueries,
      } = fixture({ domainOutcomes: rows, userId: null, user: null }, live)
      const notApplicable = await assessAccountPrivacyCompletion(
        db,
        "request-1",
        {
          approvedPolicyVersion: policyVersion,
          now,
        },
      )
      expect(notApplicable.blockers).toContain("CONVERSATION_REVIEW_REQUIRED")
      expect(linkedConversationQueries.at(-1)).toEqual({
        where: { accountUserId: "user-1" },
      })
      expect(privacyRequestQueries.at(-1)).toEqual({
        where: { accountUserId: "user-1" },
      })
      expect(bridgeQueries.at(-1)).toEqual({
        where: {
          OR: [
            { accountUserId: "user-1" },
            { accountAccess: { is: { accountUserId: "user-1" } } },
          ],
        },
      })
      conversation.disposition = "RETENTION_APPROVED"
      conversation.nextReviewAt = new Date("2026-10-25T00:00:00.000Z")
      const reviewed = await assessAccountPrivacyCompletion(db, "request-1", {
        approvedPolicyVersion: policyVersion,
        now,
      })
      expect(reviewed.blockers).not.toContain("CONVERSATION_REVIEW_REQUIRED")
    },
  )

  test.each([
    ["storeConversationAccountLinkCommand", "accountUserId"],
    ["storeConversationAccountDeviceCommand", "accountUserId"],
    ["storeConversationAccountAuditEvent", "actorAccountUserId"],
    ["storeConversationActionMessage", "createdByUserId"],
    ["storeConversationAccountWatermark", "accountUserId"],
    ["storeConversationAccountNotificationPreference", "accountUserId"],
    ["storeConversationNotificationCommand", "accountUserId"],
    ["storeConversationNotificationIntent", "accountUserId"],
    ["storeConversationNotificationAuditEvent", "actorAccountUserId"],
    ["storeConversationWhatsAppBridgeAuditEvent", "accountUserId"],
    ["storeConversationModerationCommand", "actorUserId"],
    ["storeConversationModerationAuditEvent", "actorUserId"],
    ["storeConversationSensitiveReadAuditEvent", "actorUserId"],
    ["storeConversationAvailabilityAuditEvent", "actorUserId"],
    ["storeConversationChannelConfiguration", "updatedByUserId"],
    ["storeConversationChannelConfigurationAuditEvent", "actorUserId"],
  ])(
    "rejects a conversation no-data claim for %s after User removal",
    async (delegate, userField) => {
      const rows = outcomes()
      const conversation = rows.find((row) => row.domain === "CONVERSATIONS")
      if (!conversation) throw new Error("Missing conversation fixture")
      const { db, directConversationQueries } = fixture(
        { domainOutcomes: rows, userId: null, user: null },
        { directConversationAttribution: { [delegate]: 1 } },
      )
      const notApplicable = await assessAccountPrivacyCompletion(
        db,
        "request-1",
        { approvedPolicyVersion: policyVersion, now },
      )
      expect(notApplicable.blockers).toContain("CONVERSATION_REVIEW_REQUIRED")
      expect(directConversationQueries[delegate]).toEqual([
        { where: { [userField]: "user-1" } },
      ])
      conversation.disposition = "RETENTION_APPROVED"
      conversation.nextReviewAt = new Date("2026-10-25T00:00:00.000Z")
      const reviewed = await assessAccountPrivacyCompletion(db, "request-1", {
        approvedPolicyVersion: policyVersion,
        now,
      })
      expect(reviewed.blockers).not.toContain("CONVERSATION_REVIEW_REQUIRED")
    },
  )

  test("rejects a no-data claim for historical account push endpoints", async () => {
    const { db } = fixture(
      { userId: null, user: null },
      {
        pushEndpoints: 0,
        directConversationAttribution: { storeConversationPushEndpoint: 1 },
      },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("CONVERSATION_REVIEW_REQUIRED")
    expect(assessment.blockers).not.toContain("IDENTITY_ACCESS_REMAINS")
  })

  test("rejects a no-data claim when a prior pause or resume remains", async () => {
    const { db, directConversationQueries } = fixture(
      { userId: null, user: null },
      {
        directConversationAttribution: {
          storeConversationAvailabilityConfiguration: 1,
        },
      },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("CONVERSATION_REVIEW_REQUIRED")
    expect(
      directConversationQueries.storeConversationAvailabilityConfiguration,
    ).toEqual([
      {
        where: {
          OR: [{ pausedByUserId: "user-1" }, { resumedByUserId: "user-1" }],
        },
      },
    ])
  })

  test("rejects account-bound WhatsApp bridge state after the account link is inactive", async () => {
    const { db, bridgeQueries } = fixture(
      {},
      {
        linkedConversations: 0,
        pendingBridgeCapabilities: 1,
        nonRevokedBridges: 1,
        pendingAccountCandidates: 1,
      },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("ACCOUNT_CONVERSATION_BRIDGE_REMAINS")
    expect(assessment.blockers).not.toContain(
      "ACCOUNT_CONVERSATION_ACCESS_REMAINS",
    )
    expect(bridgeQueries.slice(0, 3)).toEqual([
      {
        where: {
          accountAccess: { is: { accountUserId: "user-1" } },
          status: "PENDING",
          expiresAt: { gt: now },
        },
      },
      {
        where: {
          accountAccess: { is: { accountUserId: "user-1" } },
          status: { not: "REVOKED" },
        },
      },
      {
        where: {
          OR: [
            { accountUserId: "user-1" },
            { accountAccess: { is: { accountUserId: "user-1" } } },
          ],
          status: "PENDING",
          expiresAt: { gt: now },
        },
      },
    ])
  })

  test("requires provider reconciliation for account-bound claimed or unknown sends", async () => {
    const { db, bridgeQueries } = fixture(
      {},
      {
        unresolvedBridgePrompts: 1,
        unresolvedCandidatePrompts: 1,
        unresolvedOutboundSends: 1,
      },
    )
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain(
      "ACCOUNT_CONVERSATION_PROVIDER_RECONCILIATION_REQUIRED",
    )
    expect(bridgeQueries.slice(3, 6)).toHaveLength(3)
  })

  test("requires manual invitation review when the current User email is unverified", async () => {
    const { db } = fixture({
      user: { email: "user@example.test", emailVerified: false },
    })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("EMAIL_INVITATION_REVIEW_REQUIRED")
  })

  test("requires manual invitation review when the verified contact differs", async () => {
    const { db } = fixture({ contactEmail: "other@example.test" })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.blockers).toContain("EMAIL_INVITATION_REVIEW_REQUIRED")
  })
})

test.each([
  "assistantConversation",
  "assistantRun",
  "message",
  "automationEvent",
  "productAnalyticsEvent",
])(
  "completion refuses unhandled %s records despite a complete ledger",
  async (model) => {
    const { db } = fixture({}, { additional: model })
    const assessment = await assessAccountPrivacyCompletion(db, "request-1", {
      approvedPolicyVersion: policyVersion,
      now,
    })
    expect(assessment.eligible).toBe(false)
    expect(assessment.blockers).toContain(
      "ADDITIONAL_PERSONAL_DATA_REVIEW_REQUIRED",
    )
  },
)

function completionFixture(
  live: { otherProviderTokens?: number; linkedConversations?: number } = {},
  operatorIsAdmin = true,
) {
  const { db: base, request } = fixture({}, live)
  let conflict = false
  let transactionOptions: unknown
  const client = {
    ...base,
    user: { findUnique: async () => ({ isPlatformAdmin: operatorIsAdmin }) },
    accountPrivacyRequest: {
      findUnique: async () => request,
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string; verifiedSubjectUserId: string }
        data: { status: string; completedAt: Date }
      }) => {
        if (
          conflict ||
          request.status !== where.status ||
          request.verifiedSubjectUserId !== where.verifiedSubjectUserId
        )
          return { count: 0 }
        request.status = data.status
        request.completedAt = data.completedAt
        return { count: 1 }
      },
    },
    $transaction: async (
      operation: (tx: PrismaClient) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options
      return operation(client as unknown as PrismaClient)
    },
  } as unknown as PrismaClient
  return {
    client,
    request,
    conflictNextUpdate: () => {
      conflict = true
    },
    getTransactionOptions: () => transactionOptions,
  }
}

describe("account privacy completion transition", () => {
  const previous = {
    processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
    completion: process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED,
    policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
  }
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }

  test("requires both processing switches and an approved policy version", async () => {
    const { client } = completionFixture()
    try {
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "false"
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
      await expect(
        completeAccountPrivacyRequest(client, {
          requestId: "request-1",
          operatorUserId: "operator-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "DISABLED" })
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "false"
      await expect(
        completeAccountPrivacyRequest(client, {
          requestId: "request-1",
          operatorUserId: "operator-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "DISABLED" })
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
      await expect(
        completeAccountPrivacyRequest(client, {
          requestId: "request-1",
          operatorUserId: "operator-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
    } finally {
      restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
      restore("ACCOUNT_PRIVACY_COMPLETION_ENABLED", previous.completion)
      restore("ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy)
    }
  })

  test("atomically completes only a currently eligible request and replays cleanly", async () => {
    const { client, request, getTransactionOptions } = completionFixture()
    try {
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
      const command = {
        requestId: "request-1",
        operatorUserId: "operator-1",
        now,
      }
      expect(await completeAccountPrivacyRequest(client, command)).toEqual({
        requestId: "request-1",
        status: "COMPLETED",
        completedAt: now,
        replay: false,
      })
      expect(request.status).toBe("COMPLETED")
      expect(
        await completeAccountPrivacyRequest(client, command),
      ).toMatchObject({
        status: "COMPLETED",
        replay: true,
      })
      expect(getTransactionOptions()).toEqual({
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      })
    } finally {
      restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
      restore("ACCOUNT_PRIVACY_COMPLETION_ENABLED", previous.completion)
      restore("ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy)
    }
  })

  test("refuses residual provider access and a stale completion claim", async () => {
    const live = completionFixture({ otherProviderTokens: 1 })
    const stale = completionFixture()
    try {
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
      const command = {
        requestId: "request-1",
        operatorUserId: "operator-1",
        now,
      }
      await expect(
        completeAccountPrivacyRequest(live.client, command),
      ).rejects.toMatchObject({ code: "NOT_READY" })
      expect(live.request.status).toBe("PROCESSING")
      stale.conflictNextUpdate()
      await expect(
        completeAccountPrivacyRequest(stale.client, command),
      ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
      expect(stale.request.status).toBe("PROCESSING")
    } finally {
      restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
      restore("ACCOUNT_PRIVACY_COMPLETION_ENABLED", previous.completion)
      restore("ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy)
    }
  })

  test("rejects a non-admin operator and self-processing", async () => {
    const outsider = completionFixture({}, false)
    const self = completionFixture()
    try {
      process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_COMPLETION_ENABLED = "true"
      process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policyVersion
      await expect(
        completeAccountPrivacyRequest(outsider.client, {
          requestId: "request-1",
          operatorUserId: "operator-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
      await expect(
        completeAccountPrivacyRequest(self.client, {
          requestId: "request-1",
          operatorUserId: "user-1",
          now,
        }),
      ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
      expect(self.request.status).toBe("PROCESSING")
    } finally {
      restore("ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing)
      restore("ACCOUNT_PRIVACY_COMPLETION_ENABLED", previous.completion)
      restore("ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy)
    }
  })
})
