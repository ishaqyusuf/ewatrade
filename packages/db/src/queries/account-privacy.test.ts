import { describe, expect, test } from "bun:test"
import { LEGAL_DOCUMENT_VERSION } from "@ewatrade/utils/legal-documents"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  createExternalDeletionChallenge,
  discardUndeliveredExternalDeletionChallenge,
  getAccountDeletionRequest,
  getAccountLegalStatus,
  getAccountPrivacyReview,
  purgeExpiredAccountPrivacyVerification,
  recordLegalAcceptance,
  requestAccountDeletion,
  submitExternalDeletionRequest,
} from "./account-privacy"

type ChallengeStub = {
  id: string
  emailDigest: string
  codeDigest: string
  contactEmail: string
  expiresAt: Date
  sentAt: Date
  windowStartedAt: Date
  sentCount: number
  attempts: number
}

type BucketStub = {
  bucketDigest: string
  windowStartedAt: Date
  sentCount: number
}

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
  "assistantActionProposal",
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

function directConversationStub(
  queries: Array<[string, unknown]>,
  count: (name: string, query: unknown) => number = () => 0,
) {
  return Object.fromEntries(
    directConversationModels.map((name) => [
      name,
      {
        count: async (query: unknown) => {
          queries.push([name, query])
          return count(name, query)
        },
      },
    ]),
  )
}

const prescriptionInventoryModels = [
  "prescriptionStoreRole",
  "prescriptionStoreAuditEvent",
  "prescriptionRequest",
  "prescriptionPharmacistReview",
  "prescriptionRequestAuditEvent",
  "prescriptionPrivacyRequest",
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
] as const

function prescriptionInventoryStub(
  queries: Array<[string, unknown]>,
  count: (name: string, query: unknown) => number = () => 0,
) {
  return Object.fromEntries(
    prescriptionInventoryModels.map((name) => [
      name,
      {
        count: async (query: unknown) => {
          queries.push([name, query])
          return count(name, query)
        },
      },
    ]),
  )
}

describe("account privacy authority boundaries", () => {
  test("rejects a whitespace-only verification secret before touching the database", async () => {
    const previous = process.env.ACCOUNT_PRIVACY_OTP_SECRET
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = " ".repeat(32)
    try {
      await expect(
        createExternalDeletionChallenge(
          {} as PrismaClient,
          "owner@example.com",
          "192.0.2.10",
        ),
      ).rejects.toThrow("not configured")
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, "ACCOUNT_PRIVACY_OTP_SECRET")
      else process.env.ACCOUNT_PRIVACY_OTP_SECRET = previous
    }
  })

  test("retries use an account-scoped command without claiming erasure", async () => {
    let command: unknown
    const db = {
      accountPrivacyRequest: {
        upsert: async (args: unknown) => {
          command = args
          return { status: "RECEIVED" }
        },
      },
    } as unknown as PrismaClient
    expect(await requestAccountDeletion(db, "user-one")).toMatchObject({
      status: "RECEIVED",
    })
    expect(command).toMatchObject({
      where: { requestKey: "account-deletion:user-one" },
      create: {
        userId: "user-one",
        verifiedSubjectUserId: "user-one",
      },
      update: {},
    })
  })
  test("status reads cannot cross account boundaries", async () => {
    let command: unknown
    const db = {
      accountPrivacyRequest: {
        findFirst: async (args: unknown) => {
          command = args
          return null
        },
      },
    } as unknown as PrismaClient
    await getAccountDeletionRequest(db, "user-two")
    expect(command).toMatchObject({
      where: { userId: "user-two", requestKey: "account-deletion:user-two" },
    })
  })
  test("draft acceptance fails before any persistence", async () => {
    await expect(
      recordLegalAcceptance({} as PrismaClient, {
        userId: "user-one",
        version: LEGAL_DOCUMENT_VERSION,
        surface: "mobile",
      }),
    ).rejects.toThrow("not approved")
  })
  test("legal status is account-scoped and exact-hash", async () => {
    let where: unknown
    const db = {
      legalAcceptance: {
        findUnique: async (args: { where: unknown }) => {
          where = args.where
          return { documentHash: "approved-hash" }
        },
      },
    } as unknown as PrismaClient
    expect(await getAccountLegalStatus(db, "user-one", null)).toEqual({
      effective: false,
      version: null,
      effectiveDate: null,
      accepted: false,
    })
    expect(where).toBeUndefined()
    const publication = {
      version: "2026-10-01",
      documentHash: "approved-hash",
      effectiveDate: "2026-10-01",
    }
    expect(
      await getAccountLegalStatus(db, "user-one", publication),
    ).toMatchObject({
      effective: true,
      accepted: true,
      version: publication.version,
    })
    expect(where).toEqual({
      userId_version: { userId: "user-one", version: publication.version },
    })
    expect(
      await getAccountLegalStatus(db, "user-two", {
        ...publication,
        documentHash: "changed-hash",
      }),
    ).toMatchObject({ effective: true, accepted: false })
  })
})

describe("external account deletion verification", () => {
  const original = process.env.ACCOUNT_PRIVACY_OTP_SECRET
  test("a code is hashed, throttled and can create only one verified request", async () => {
    process.env.ACCOUNT_PRIVACY_OTP_SECRET =
      "test-only-privacy-secret-with-at-least-32-characters"
    try {
      let challenge: ChallengeStub | null = null
      let request: {
        id: string
        status: string
        requestKey: string
        userId: string | null
      } | null = null
      const buckets = new Map<string, BucketStub>()
      let requestUpsertUpdate: unknown = null
      const tx = {
        accountPrivacyRateBucket: {
          findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
            buckets.get(where.bucketDigest) ?? null,
          upsert: async ({
            where,
            create,
            update,
          }: {
            where: { bucketDigest: string }
            create: BucketStub
            update: { windowStartedAt?: Date }
          }) => {
            const previous = buckets.get(where.bucketDigest)
            const next: BucketStub = previous
              ? { ...previous, ...update, sentCount: previous.sentCount + 1 }
              : create
            buckets.set(where.bucketDigest, next)
            return next
          },
        },
        accountPrivacyChallenge: {
          findUnique: async () => challenge,
          upsert: async ({
            create,
            update,
          }: {
            create: Omit<ChallengeStub, "id" | "attempts" | "sentCount">
            update: Partial<ChallengeStub>
          }) => {
            challenge = challenge
              ? { ...challenge, ...update }
              : { id: "challenge-1", attempts: 0, sentCount: 1, ...create }
            return challenge
          },
          updateMany: async ({
            data,
          }: { data: { attempts: { increment: number } } }) => {
            if (challenge) challenge.attempts += data.attempts.increment
            return { count: 1 }
          },
          deleteMany: async ({ where }: { where: { codeDigest: string } }) => {
            if (
              !challenge ||
              challenge.codeDigest !== where.codeDigest ||
              challenge.attempts >= 5
            )
              return { count: 0 }
            challenge = null
            return { count: 1 }
          },
        },
        user: {
          findUnique: async () => ({ id: "known-user", emailVerified: true }),
        },
        accountPrivacyRequest: {
          upsert: async ({
            create,
            update,
          }: {
            create: { requestKey: string; userId: string | null }
            update: unknown
          }) => {
            requestUpsertUpdate = update
            request ??= { id: "request-1", status: "RECEIVED", ...create }
            return request
          },
        },
      }
      const db = {
        $transaction: (fn: (transaction: typeof tx) => unknown) => fn(tx),
      } as unknown as PrismaClient
      const issued = await createExternalDeletionChallenge(
        db,
        "  MEMBER@example.com ",
        "203.0.113.7",
      )
      if (!issued) throw new Error("Expected a verification code")
      expect(issued?.email).toBe("member@example.com")
      expect((challenge as ChallengeStub | null)?.codeDigest).not.toContain(
        issued.code,
      )
      expect(
        await createExternalDeletionChallenge(
          db,
          "member@example.com",
          "203.0.113.7",
        ),
      ).toBeNull()
      expect(
        await submitExternalDeletionRequest(
          db,
          "member@example.com",
          "999999" === issued.code ? "111111" : "999999",
        ),
      ).toBeNull()
      expect((challenge as ChallengeStub | null)?.attempts).toBe(1)
      expect(
        await submitExternalDeletionRequest(
          db,
          "member@example.com",
          issued.code,
        ),
      ).toMatchObject({ id: "request-1", userId: "known-user" })
      expect(
        await submitExternalDeletionRequest(
          db,
          "member@example.com",
          issued.code,
        ),
      ).toBeNull()
      expect((request as { requestKey: string } | null)?.requestKey).toBe(
        "account-deletion:known-user",
      )
      expect(requestUpsertUpdate).toEqual({})
    } finally {
      process.env.ACCOUNT_PRIVACY_OTP_SECRET = original
    }
  })
})

test("external code sends stop across distinct recipient addresses from one trusted source", async () => {
  const original = process.env.ACCOUNT_PRIVACY_OTP_SECRET
  process.env.ACCOUNT_PRIVACY_OTP_SECRET =
    "test-only-privacy-secret-with-at-least-32-characters"
  try {
    const challenges = new Map<string, ChallengeStub>()
    const buckets = new Map<string, BucketStub>()
    const tx = {
      accountPrivacyChallenge: {
        findUnique: async ({ where }: { where: { emailDigest: string } }) =>
          challenges.get(where.emailDigest) ?? null,
        upsert: async ({
          where,
          create,
        }: {
          where: { emailDigest: string }
          create: Omit<ChallengeStub, "id" | "attempts" | "sentCount">
        }) => {
          const next = {
            id: where.emailDigest,
            attempts: 0,
            sentCount: 1,
            ...create,
          }
          challenges.set(where.emailDigest, next)
          return next
        },
      },
      accountPrivacyRateBucket: {
        findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
          buckets.get(where.bucketDigest) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { bucketDigest: string }
          create: BucketStub
          update: { sentCount: { increment: number } }
        }) => {
          const previous = buckets.get(where.bucketDigest)
          const next = previous
            ? {
                ...previous,
                sentCount: previous.sentCount + update.sentCount.increment,
              }
            : create
          buckets.set(where.bucketDigest, next)
          return next
        },
      },
    }
    const db = {
      $transaction: (fn: (transaction: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaClient
    for (let index = 0; index < 10; index++) {
      expect(
        await createExternalDeletionChallenge(
          db,
          `recipient-${index}@example.test`,
          "203.0.113.8",
        ),
      ).not.toBeNull()
    }
    expect(
      await createExternalDeletionChallenge(
        db,
        "eleventh@example.test",
        "203.0.113.8",
      ),
    ).toBeNull()
    expect(challenges.size).toBe(10)
  } finally {
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = original
  }
})

test("failed delivery cleanup cannot remove a newer verification code", async () => {
  const original = process.env.ACCOUNT_PRIVACY_OTP_SECRET
  process.env.ACCOUNT_PRIVACY_OTP_SECRET =
    "test-only-privacy-secret-with-at-least-32-characters"
  try {
    type ChallengeIdentity = {
      emailDigest: string
      codeDigest: string
      sentAt: Date
    }
    let current: ChallengeIdentity | null = null
    let lastWhere: ChallengeIdentity | null = null
    const db = {
      accountPrivacyChallenge: {
        deleteMany: async ({ where }: { where: ChallengeIdentity }) => {
          lastWhere = where
          if (
            !current ||
            current.emailDigest !== where.emailDigest ||
            current.codeDigest !== where.codeDigest ||
            current.sentAt.getTime() !== where.sentAt.getTime()
          )
            return { count: 0 }
          current = null
          return { count: 1 }
        },
      },
    } as unknown as PrismaClient
    const issued = {
      email: "member@example.test",
      code: "123456",
      sentAt: new Date("2026-09-24T16:00:00.000Z"),
    }
    expect(
      await discardUndeliveredExternalDeletionChallenge(db, issued),
    ).toEqual({ count: 0 })
    const oldWhere = lastWhere as ChallengeIdentity | null
    if (!oldWhere) throw new Error("Expected scoped cleanup predicate")
    current = {
      ...oldWhere,
      codeDigest: "newer-code",
      sentAt: new Date("2026-09-24T16:01:00.000Z"),
    }
    expect(
      await discardUndeliveredExternalDeletionChallenge(db, issued),
    ).toEqual({ count: 0 })
    expect(current).not.toBeNull()
    current = oldWhere
    expect(
      await discardUndeliveredExternalDeletionChallenge(db, issued),
    ).toEqual({ count: 1 })
    expect(current).toBeNull()
  } finally {
    process.env.ACCOUNT_PRIVACY_OTP_SECRET = original
  }
})

test("operator review identifies an unmatched email and a sole owner without exposing records", async () => {
  const inventoryQueries: unknown[] = []
  const conversationQueries: unknown[] = []
  const handoverQueries: unknown[] = []
  const billingQueries: unknown[] = []
  const commercialQueries: unknown[] = []
  const directConversationQueries: Array<[string, unknown]> = []
  const prescriptionQueries: Array<[string, unknown]> = []
  let membershipQuery: unknown
  let outcomeQuery: unknown
  let noticeQuery: unknown
  let accessStageQuery: unknown
  let emailVerified = true
  let verifiedSubjectUserId = "user-1"
  const db = {
    accountPrivacyAccessRevocation: {
      findUnique: async (query: unknown) => {
        accessStageQuery = query
        return null
      },
    },
    accountPrivacyDomainOutcome: {
      findMany: async (query: unknown) => {
        outcomeQuery = query
        return [
          {
            userId: "user-1",
            domain: "IDENTITY_ACCESS",
            disposition: "ACCESS_REVOKED",
            processor: "account-access:v1",
            policyVersion: "policy-v1",
            evidenceDigest: "a".repeat(64),
            nextReviewAt: null,
            processedAt: new Date("2026-09-25T00:00:00.000Z"),
          },
        ]
      },
    },
    accountPrivacyNoticeAttempt: {
      findMany: async (query: unknown) => {
        noticeQuery = query
        return [
          {
            attemptNumber: 1,
            status: "UNCERTAIN",
            policyVersion: "policy-v1",
            providerMessageId: null,
            providerEventId: null,
            failureEventId: null,
            preparedAt: new Date("2026-09-27T00:00:00.000Z"),
            sentAt: null,
            deliveredAt: null,
            failedAt: null,
          },
        ]
      },
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request-1",
        userId: "user-1",
        verifiedSubjectUserId,
        verifiedAt: new Date("2026-09-24T12:00:00.000Z"),
        user: { email: "member@example.test", emailVerified },
        contactEmail: "member@example.test",
        status: "RECEIVED",
      }),
    },
    membership: {
      findMany: async (query: unknown) => {
        membershipQuery = query
        return [
          {
            id: "membership-1",
            tenantId: "tenant-1",
            role: "OWNER",
            status: "ACTIVE",
            tenant: { name: "Market Store" },
          },
          {
            id: "membership-old",
            tenantId: "tenant-2",
            role: "MEMBER",
            status: "REMOVED",
            tenant: { name: "Old Store" },
          },
        ]
      },
      count: async () => 0,
    },
    session: {
      count: async (query: unknown) => {
        inventoryQueries.push(query)
        return 2
      },
    },
    account: {
      count: async (query: unknown) => {
        inventoryQueries.push(query)
        return (query as { where?: { OR?: unknown } }).where?.OR ? 2 : 1
      },
    },
    storeConversationAccountAccess: {
      count: async (query: unknown) => {
        inventoryQueries.push(query)
        return 3
      },
    },
    storeConversationGuestCredential: {
      count: async (query: unknown) => {
        conversationQueries.push(query)
        return 4
      },
    },
    storeConversationGuestAccess: {
      count: async (query: unknown) => {
        conversationQueries.push(query)
        return 5
      },
    },
    assistantActionProposal: { count: async () => 0 },
    storeConversationPushEndpoint: { count: async () => 0 },
    storeConversationWhatsAppBridgeCapability: {
      count: async (query: unknown) => {
        conversationQueries.push(query)
        return 1
      },
    },
    storeConversationWhatsAppBridge: {
      count: async (query: unknown) => {
        conversationQueries.push(query)
        return 2
      },
    },
    storeConversationWhatsAppCandidate: {
      count: async (query: unknown) => {
        conversationQueries.push(query)
        return 3
      },
    },
    legalAcceptance: {
      count: async (query: unknown) => {
        inventoryQueries.push(query)
        return 1
      },
    },
    retailOpsStaffProfile: {
      count: async (query: unknown) => {
        handoverQueries.push(query)
        return 1
      },
    },
    retailOpsStaffInviteToken: {
      count: async (query: unknown) => {
        handoverQueries.push(query)
        return 0
      },
    },
    serviceCommerceStoreTeamAssignment: {
      count: async (query: unknown) => {
        handoverQueries.push(query)
        return 2
      },
    },
    storeConversation: {
      count: async (query: unknown) => {
        handoverQueries.push(query)
        return 1
      },
    },
    serviceBookingResource: {
      count: async (query: unknown) => {
        handoverQueries.push(query)
        return 1
      },
    },
    billingCheckoutSession: {
      count: async (query: unknown) => {
        billingQueries.push(query)
        return 2
      },
    },
    tenantSubscription: {
      findMany: async (query: unknown) => {
        billingQueries.push(query)
        return [
          {
            tenantId: "tenant-1",
            provider: "PLAY_STORE",
            status: "ACTIVE",
            currentPeriodEndsAt: new Date("2026-10-25T00:00:00.000Z"),
          },
        ]
      },
    },
    storeSubscriptionPurchase: {
      count: async (query: unknown) => {
        billingQueries.push(query)
        return 1
      },
    },
    playRefundReviewResponse: {
      count: async (query: unknown) => {
        billingQueries.push(query)
        return 3
      },
    },
    commercialOrder: {
      count: async (query: unknown) => {
        commercialQueries.push(query)
        return 2
      },
    },
    commercialOrderPayment: {
      count: async (query: unknown) => {
        commercialQueries.push(query)
        return 3
      },
    },
    commercialOrderFulfillmentCommand: {
      count: async (query: unknown) => {
        commercialQueries.push(query)
        return 4
      },
    },
    productReturn: {
      count: async (query: unknown) => {
        commercialQueries.push(query)
        return 5
      },
    },
    serviceJob: {
      count: async (query: unknown) => {
        commercialQueries.push(query)
        return 6
      },
    },
    serviceIntake: { count: async () => 0 },
    serviceRequest: { count: async () => 0 },
    serviceQuote: { count: async () => 0 },
    serviceQuoteVersion: { count: async () => 0 },
    commerceQuote: { count: async () => 0 },
    commerceQuoteVersion: { count: async () => 0 },
    commerceInquiry: { count: async () => 0 },
    ...Object.fromEntries(
      serviceAttributionModels.map((name) => [name, { count: async () => 0 }]),
    ),
    ...directConversationStub(directConversationQueries, (name) =>
      name === "storeConversationAccountAuditEvent" ? 2 : 0,
    ),
    ...prescriptionInventoryStub(prescriptionQueries, (name, query) =>
      name === "prescriptionMediaAccessEvent"
        ? 2
        : name === "prescriptionRequest" &&
            Boolean(
              (query as { where?: { customerEmail?: unknown } }).where
                ?.customerEmail,
            )
          ? 1
          : 0,
    ),
  } as unknown as PrismaClient
  const review = await getAccountPrivacyReview(db, "request-1")
  expect(review?.domainOutcomes[0]).not.toHaveProperty("userId")
  expect(review?.domainOutcomes[0]).not.toHaveProperty("evidenceDigest")
  expect(review).toMatchObject({
    identityReviewRequired: false,
    verifiedSubjectUserId: "user-1",
    domainOutcomes: [{ domain: "IDENTITY_ACCESS" }],
    noticeAttempts: [{ attemptNumber: 1, status: "UNCERTAIN" }],
    membershipHandoverInventory: {
      nonRemovedMemberships: 1,
      staffProfiles: 1,
      openInvites: 0,
      teamAssignments: 2,
      conversationAssignments: 1,
      bookingResources: 1,
      emailInvitationReviewRequired: false,
    },
    domainInventory: {
      activeSessions: 2,
      appleAuthorizations: 1,
      linkedConversations: 3,
      legalAcceptances: 1,
      storedIdentityTokens: 1,
      otherProviderTokens: 1,
    },
    conversationAccessInventory: {
      activeLinkedGuestCredentials: 4,
      activeGuestConversationGrants: 5,
      pendingAccountBridgeCapabilities: 1,
      nonRevokedAccountBridges: 2,
      pendingAccountWhatsAppCandidates: 3,
      guestOwnershipReviewRequired: true,
    },
    conversationReviewInventory: { accountAuditEvents: 2, linkCommands: 0 },
    billingReviewInventory: {
      initiatedCheckoutSessions: 2,
      storePurchases: 1,
      refundReviewActions: 3,
      tenantSubscriptions: [
        {
          tenantId: "tenant-1",
          provider: "PLAY_STORE",
          status: "ACTIVE",
        },
      ],
    },
    commercialReviewInventory: {
      createdOrders: 2,
      recordedPayments: 3,
      fulfillmentCommands: 4,
      returns: 5,
      createdOrHandedOffServiceJobs: 6,
      customerDirectoryMatches: 0,
      customerOrderMatches: 0,
      serviceRequestMatches: 0,
      commerceInquiryMatches: 0,
    },
    prescriptionReviewInventory: {
      mediaAccessEvents: 2,
      customerEmailMatches: 1,
    },
    ownerHandoverRequired: [{ tenantId: "tenant-1", otherActiveOwners: 0 }],
  })
  expect(outcomeQuery).toEqual({
    where: { requestId: "request-1" },
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
  expect(noticeQuery).toMatchObject({
    where: { requestId: "request-1" },
    orderBy: { attemptNumber: "desc" },
    take: 10,
  })
  expect(JSON.stringify(noticeQuery)).not.toContain("recipientDigest")
  expect(JSON.stringify(noticeQuery)).not.toContain("contentDigest")
  expect(accessStageQuery).toMatchObject({
    where: { requestId: "request-1" },
    select: {
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
  expect(membershipQuery).toMatchObject({
    where: { userId: "user-1" },
  })
  expect(inventoryQueries).toEqual([
    { where: { userId: "user-1", expiresAt: { gt: expect.any(Date) } } },
    {
      where: {
        userId: "user-1",
        provider: "apple",
        refreshToken: { not: null },
      },
    },
    { where: { accountUserId: "user-1", status: "ACTIVE" } },
    { where: { userId: "user-1" } },
    { where: { userId: "user-1", idToken: { not: null } } },
    {
      where: {
        userId: "user-1",
        OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }],
      },
    },
  ])
  expect(conversationQueries).toEqual([
    {
      where: {
        guestIdentity: {
          accountAccesses: {
            some: { accountUserId: "user-1", status: "ACTIVE" },
          },
        },
        status: "ACTIVE",
        expiresAt: { gt: expect.any(Date) },
      },
    },
    {
      where: {
        conversation: {
          accountAccess: {
            is: { accountUserId: "user-1", status: "ACTIVE" },
          },
        },
        status: "ACTIVE",
      },
    },
    {
      where: {
        accountAccess: {
          is: { accountUserId: "user-1" },
        },
        status: "PENDING",
        expiresAt: { gt: expect.any(Date) },
      },
    },
    {
      where: {
        accountAccess: {
          is: { accountUserId: "user-1" },
        },
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
        expiresAt: { gt: expect.any(Date) },
      },
    },
  ])
  expect(handoverQueries).toEqual([
    { where: { userId: "user-1", statusSnapshot: { not: "REMOVED" } } },
    {
      where: {
        status: "ACTIVE",
        OR: [
          { invitedUserId: "user-1" },
          { membershipId: { in: ["membership-1", "membership-old"] } },
          {
            invitedUserId: null,
            email: {
              equals: "member@example.test",
              mode: "insensitive",
            },
          },
        ],
      },
    },
    {
      where: {
        membershipId: { in: ["membership-1", "membership-old"] },
        status: { not: "REVOKED" },
      },
    },
    {
      where: {
        assignedMembershipId: { in: ["membership-1", "membership-old"] },
        lifecycle: "ACTIVE",
      },
    },
    {
      where: {
        membershipId: { in: ["membership-1", "membership-old"] },
        status: "ACTIVE",
      },
    },
  ])
  expect(billingQueries).toEqual([
    { where: { requestedByUserId: "user-1" } },
    {
      where: { tenantId: { in: ["tenant-1", "tenant-2"] } },
      select: {
        tenantId: true,
        provider: true,
        status: true,
        currentPeriodEndsAt: true,
      },
    },
    { where: { tenantId: { in: ["tenant-1", "tenant-2"] } } },
    { where: { actorUserId: "user-1" } },
  ])
  expect(commercialQueries.slice(0, 5)).toEqual([
    { where: { createdByUserId: "user-1" } },
    { where: { recordedByUserId: "user-1" } },
    { where: { actorUserId: "user-1" } },
    { where: { actorUserId: "user-1" } },
    {
      where: {
        OR: [
          { createdByUserId: "user-1" },
          { handedOffByUserId: "user-1" },
          { currentAssigneeUserId: "user-1" },
        ],
      },
    },
  ])
  expect(prescriptionQueries).toContainEqual([
    "prescriptionRequest",
    {
      where: {
        customerEmail: { equals: "member@example.test", mode: "insensitive" },
      },
    },
  ])
  emailVerified = false
  handoverQueries.length = 0
  prescriptionQueries.length = 0
  const unverifiedUserReview = await getAccountPrivacyReview(db, "request-1")
  expect(unverifiedUserReview?.membershipHandoverInventory).toMatchObject({
    emailInvitationReviewRequired: true,
  })
  expect(
    (handoverQueries[1] as { where: { OR: unknown[] } }).where.OR,
  ).toHaveLength(2)
  expect(
    unverifiedUserReview?.prescriptionReviewInventory?.customerEmailMatches,
  ).toBe(0)
  expect(
    prescriptionQueries.filter(
      ([name, query]) =>
        name === "prescriptionRequest" &&
        Boolean(
          (query as { where?: { customerEmail?: unknown } }).where
            ?.customerEmail,
        ),
    ),
  ).toHaveLength(0)
  verifiedSubjectUserId = "different-user"
  const commercialQueryCount = commercialQueries.length
  const directConversationQueryCount = directConversationQueries.length
  const prescriptionQueryCount = prescriptionQueries.length
  const mismatched = await getAccountPrivacyReview(db, "request-1")
  expect(mismatched?.commercialReviewInventory).toBeNull()
  expect(mismatched?.conversationReviewInventory).toBeNull()
  expect(mismatched?.prescriptionReviewInventory).toBeNull()
  expect(mismatched?.profileReviewInventory).toBeNull()
  expect(mismatched?.profilePrerequisites).toBeNull()
  expect(commercialQueries).toHaveLength(commercialQueryCount)
  expect(directConversationQueries).toHaveLength(directConversationQueryCount)
  expect(prescriptionQueries).toHaveLength(prescriptionQueryCount)
  const unmatched = await getAccountPrivacyReview(
    {
      accountPrivacyAccessRevocation: { findUnique: async () => null },
      accountPrivacyDomainOutcome: { findMany: async () => [] },
      accountPrivacyNoticeAttempt: { findMany: async () => [] },
      accountPrivacyRequest: {
        findUnique: async () => ({
          id: "external-1",
          userId: null,
          verifiedSubjectUserId: null,
          status: "RECEIVED",
        }),
      },
    } as unknown as PrismaClient,
    "external-1",
  )
  expect(unmatched).toMatchObject({
    identityReviewRequired: true,
    domainInventory: null,
    conversationAccessInventory: null,
    membershipHandoverInventory: null,
    billingReviewInventory: null,
    commercialReviewInventory: null,
    conversationReviewInventory: null,
    prescriptionReviewInventory: null,
    profileReviewInventory: null,
    profilePrerequisites: null,
    activeMemberships: [],
    ownerHandoverRequired: [],
  })
})

test("commercial and clinical review use the verified subject after User removal", async () => {
  const queries: unknown[] = []
  const directConversationQueries: Array<[string, unknown]> = []
  const prescriptionQueries: Array<[string, unknown]> = []
  let verifiedAt: Date | null = new Date("2026-09-24T12:00:00.000Z")
  const count = async (query: unknown) => {
    queries.push(query)
    return 1
  }
  const db = {
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request-1",
        requestKey: "account-deletion:verified-user",
        userId: null,
        verifiedSubjectUserId: "verified-user",
        verifiedAt,
        contactEmail: "Verified@Example.Test",
        status: "PROCESSING",
      }),
    },
    accountPrivacyAccessRevocation: { findUnique: async () => null },
    accountPrivacyDomainOutcome: { findMany: async () => [] },
    accountPrivacyNoticeAttempt: { findMany: async () => [] },
    user: { findUnique: async () => null },
    account: { count },
    session: { count },
    legalAcceptance: { count },
    verification: { count },
    commercialOrder: { count },
    commercialOrderPayment: { count },
    commercialOrderFulfillmentCommand: { count },
    productReturn: { count },
    serviceJob: { count },
    serviceIntake: { count },
    serviceQuote: { count },
    serviceQuoteVersion: { count },
    commerceQuote: { count },
    commerceQuoteVersion: { count },
    ...Object.fromEntries(
      serviceAttributionModels.map((name) => [name, { count }]),
    ),
    customer: { count },
    serviceRequest: { count },
    commerceInquiry: { count },
    ...directConversationStub(directConversationQueries, () => 1),
    assistantActionProposal: { count },
    storeConversationPushEndpoint: { count },
    ...prescriptionInventoryStub(prescriptionQueries, () => 1),
  } as unknown as PrismaClient
  const removed = await getAccountPrivacyReview(db, "request-1")
  expect(removed?.conversationReviewInventory?.linkCommands).toBe(1)
  expect(directConversationQueries[0]).toEqual([
    "storeConversationAccountLinkCommand",
    { where: { accountUserId: "verified-user" } },
  ])
  expect(removed?.commercialReviewInventory).toEqual({
    createdOrders: 1,
    recordedPayments: 1,
    fulfillmentCommands: 1,
    returns: 1,
    createdOrHandedOffServiceJobs: 1,
    createdServiceIntakes: 1,
    createdServiceRequests: 1,
    createdLegacyServiceQuotes: 1,
    createdLegacyServiceQuoteVersions: 1,
    createdCommerceQuotes: 1,
    createdCommerceQuoteVersions: 1,
    serviceWorkEvents: 1,
    serviceWorkAssignments: 1,
    serviceDueCommitments: 1,
    serviceInternalNotes: 1,
    serviceExceptions: 1,
    serviceEvidence: 1,
    serviceEvidenceAuditEvents: 1,
    serviceRequestForms: 1,
    customerTrackingAccesses: 1,
    serviceNotificationIntents: 1,
    serviceManualShares: 1,
    createdCommerceInquiries: 1,
    commerceInquiryAuditEvents: 1,
    customerDirectoryMatches: 1,
    customerOrderMatches: 1,
    serviceRequestMatches: 1,
    commerceInquiryMatches: 1,
  })
  expect(queries[0]).toEqual({
    where: { createdByUserId: "verified-user" },
  })
  expect(removed?.prescriptionReviewInventory).toMatchObject({
    pharmacyRoles: 1,
    mediaAccessEvents: 1,
    sensitiveAccessEvents: 1,
    customerEmailMatches: 1,
  })
  expect(removed?.profileReviewInventory).toEqual({
    userExists: false,
    originalEmailRemains: false,
    personalFieldCount: 0,
    authAccounts: 1,
    sessions: 1,
    legalAcceptances: 1,
    verificationRows: 1,
  })
  expect(removed?.profilePrerequisites).toMatchObject({
    prerequisitesSatisfied: false,
    blockers: expect.arrayContaining([
      "IDENTITY_REVIEW_REQUIRED",
      "SUBJECT_USER_MISSING",
      "LEGAL_ACCEPTANCE_DISPOSITION_REQUIRED",
    ]),
    missingDomains: expect.arrayContaining(["EXTERNAL_PROCESSORS"]),
  })
  expect(prescriptionQueries).toContainEqual([
    "prescriptionRequest",
    {
      where: {
        customerEmail: { equals: "verified@example.test", mode: "insensitive" },
      },
    },
  ])
  verifiedAt = null
  queries.length = 0
  prescriptionQueries.length = 0
  const unverified = await getAccountPrivacyReview(db, "request-1")
  expect(unverified?.commercialReviewInventory).toBeNull()
  expect(unverified?.prescriptionReviewInventory).toBeNull()
  expect(unverified?.profileReviewInventory).toBeNull()
  expect(unverified?.profilePrerequisites).toBeNull()
  expect(queries).toEqual([])
  expect(prescriptionQueries).toEqual([])
})

test("verification cleanup targets only expired challenges and elapsed rate windows", async () => {
  const calls: unknown[] = []
  const db = {
    accountPrivacyChallenge: {
      deleteMany: async (args: unknown) => {
        calls.push(args)
        return { count: 2 }
      },
    },
    accountPrivacyRateBucket: {
      deleteMany: async (args: unknown) => {
        calls.push(args)
        return { count: 3 }
      },
    },
  } as unknown as PrismaClient
  const now = new Date("2026-09-24T16:00:00.000Z")
  expect(await purgeExpiredAccountPrivacyVerification(db, now)).toEqual({
    challengesRemoved: 2,
    bucketsRemoved: 3,
  })
  expect(calls).toEqual([
    { where: { expiresAt: { lte: now } } },
    {
      where: { windowStartedAt: { lte: new Date("2026-09-23T16:00:00.000Z") } },
    },
  ])
})
