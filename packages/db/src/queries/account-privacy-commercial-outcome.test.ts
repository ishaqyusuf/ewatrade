import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  AccountPrivacyCommercialOutcomeError,
  confirmNoAccountPrivacyCommercialRecords,
} from "./account-privacy-commercial-outcome"

const previous = {
  processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
  commercial: process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED,
  policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
}
afterEach(() => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previous.processing
  process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED =
    previous.commercial
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = previous.policy
})

function enable() {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_COMMERCIAL_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
}

function fixture(
  input: {
    operatorIsAdmin?: boolean
    verifiedSubjectUserId?: string | null
    accessStatus?: string
    membershipStatus?: string
    membershipOutcome?: "ACCESS_REVOKED" | "NOT_APPLICABLE" | null
    emailVerified?: boolean
    contactEmail?: string
    commercial?: Record<string, number>
  } = {},
) {
  const queries: Record<string, unknown> = {}
  const outcomes: Record<string, Record<string, unknown>> = {}
  let transactionOptions: unknown
  const countFactory = (key: string) => {
    return async (query: unknown) => {
      queries[key] = query
      return input.commercial?.[key] ?? 0
    }
  }
  const db = {
    $transaction: async (
      callback: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      transactionOptions = options
      return callback(db)
    },
    user: {
      findUnique: async () => ({
        isPlatformAdmin: input.operatorIsAdmin ?? true,
      }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request-1",
        userId: "user-1",
        verifiedSubjectUserId:
          input.verifiedSubjectUserId === undefined
            ? "user-1"
            : input.verifiedSubjectUserId,
        verifiedAt: new Date("2026-09-24T12:00:00.000Z"),
        contactEmail: input.contactEmail ?? "user@example.test",
        status: "PROCESSING",
        user: {
          email: "user@example.test",
          emailVerified: input.emailVerified ?? true,
        },
        accessRevocation: {
          status: input.accessStatus ?? "REVOKED",
          userId: "user-1",
        },
      }),
    },
    membership: {
      findMany: async () => [
        { tenantId: "tenant-1", status: input.membershipStatus ?? "REMOVED" },
      ],
    },
    commercialOrder: { count: countFactory("createdOrders") },
    commercialOrderPayment: { count: countFactory("recordedPayments") },
    commercialOrderFulfillmentCommand: {
      count: countFactory("fulfillmentCommands"),
    },
    productReturn: { count: countFactory("returns") },
    serviceJob: { count: countFactory("createdOrHandedOffServiceJobs") },
    serviceIntake: { count: countFactory("createdServiceIntakes") },
    serviceRequest: { count: countFactory("createdServiceRequests") },
    serviceQuote: { count: countFactory("createdLegacyServiceQuotes") },
    serviceQuoteVersion: {
      count: countFactory("createdLegacyServiceQuoteVersions"),
    },
    commerceQuote: { count: countFactory("createdCommerceQuotes") },
    commerceQuoteVersion: {
      count: countFactory("createdCommerceQuoteVersions"),
    },
    serviceWorkEvent: { count: countFactory("serviceWorkEvents") },
    serviceWorkAssignment: { count: countFactory("serviceWorkAssignments") },
    serviceDueCommitment: { count: countFactory("serviceDueCommitments") },
    serviceInternalNote: { count: countFactory("serviceInternalNotes") },
    serviceException: { count: countFactory("serviceExceptions") },
    serviceEvidence: { count: countFactory("serviceEvidence") },
    serviceEvidenceAuditEvent: {
      count: countFactory("serviceEvidenceAuditEvents"),
    },
    serviceRequestForm: { count: countFactory("serviceRequestForms") },
    customerTrackingAccess: {
      count: countFactory("customerTrackingAccesses"),
    },
    serviceNotificationIntent: {
      count: countFactory("serviceNotificationIntents"),
    },
    serviceManualShare: { count: countFactory("serviceManualShares") },
    commerceInquiry: { count: countFactory("createdCommerceInquiries") },
    commerceInquiryAuditEvent: {
      count: countFactory("commerceInquiryAuditEvents"),
    },
    customer: { count: countFactory("customerDirectoryMatches") },
    accountPrivacyDomainOutcome: {
      findUnique: async ({
        where,
      }: { where: { requestId_domain: { domain: string } } }) => {
        if (where.requestId_domain.domain === "MEMBERSHIP")
          return input.membershipOutcome === null
            ? null
            : {
                userId: "user-1",
                policyVersion: "approved-v1",
                disposition: input.membershipOutcome ?? "ACCESS_REVOKED",
              }
        return outcomes.COMMERCIAL_RECORDS ?? null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outcomes.COMMERCIAL_RECORDS = data
        return data
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    queries,
    outcomes,
    getTransactionOptions: () => transactionOptions,
  }
}

const command = { requestId: "request-1", operatorUserId: "operator-1" }

describe("account privacy no-commercial outcome", () => {
  test("stays disabled until both flags and approved policy are present", async () => {
    const { db } = fixture()
    await expect(
      confirmNoAccountPrivacyCommercialRecords(db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
    enable()
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
    await expect(
      confirmNoAccountPrivacyCommercialRecords(db, command),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  })

  test("records a no-data outcome once and rechecks on replay", async () => {
    enable()
    const { db, outcomes, getTransactionOptions } = fixture()
    const first = await confirmNoAccountPrivacyCommercialRecords(db, command)
    expect(first).toEqual({
      requestId: "request-1",
      outcomeRecorded: true,
      replay: false,
    })
    expect(outcomes.COMMERCIAL_RECORDS).toMatchObject({
      domain: "COMMERCIAL_RECORDS",
      disposition: "NOT_APPLICABLE",
      userId: "user-1",
      policyVersion: "approved-v1",
      processor: "account-privacy-commercial-empty-v1",
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(getTransactionOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    const replay = await confirmNoAccountPrivacyCommercialRecords(db, command)
    expect(replay.replay).toBe(true)
  })

  test("requires review when a commercial record matches", async () => {
    enable()
    const { db, outcomes } = fixture({ commercial: { createdOrders: 1 } })
    await expect(
      confirmNoAccountPrivacyCommercialRecords(db, command),
    ).rejects.toMatchObject({ code: "COMMERCIAL_RECORDS_REVIEW_REQUIRED" })
    expect(outcomes.COMMERCIAL_RECORDS).toBeUndefined()
  })

  test.each([
    ["non-admin", { operatorIsAdmin: false }, "OPERATOR_REQUIRED"],
    [
      "unverified subject",
      { verifiedSubjectUserId: null },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    ["unverified email", { emailVerified: false }, "IDENTITY_REVIEW_REQUIRED"],
    [
      "different contact",
      { contactEmail: "other@example.test" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    ["no contact", { contactEmail: "" }, "IDENTITY_REVIEW_REQUIRED"],
    [
      "access not revoked",
      { accessStatus: "PENDING" },
      "ACCESS_REVOCATION_REQUIRED",
    ],
    [
      "membership active",
      { membershipStatus: "ACTIVE" },
      "MEMBERSHIP_REVOCATION_REQUIRED",
    ],
    [
      "membership outcome missing",
      { membershipOutcome: null },
      "MEMBERSHIP_REVOCATION_REQUIRED",
    ],
    [
      "membership outcome contradicts historical access",
      { membershipOutcome: "NOT_APPLICABLE" },
      "MEMBERSHIP_REVOCATION_REQUIRED",
    ],
  ] as const)("rejects %s", async (_name, state, code) => {
    enable()
    const { db } = fixture(state)
    await expect(
      confirmNoAccountPrivacyCommercialRecords(db, command),
    ).rejects.toBeInstanceOf(AccountPrivacyCommercialOutcomeError)
    await expect(
      confirmNoAccountPrivacyCommercialRecords(db, command),
    ).rejects.toMatchObject({ code })
  })
})
