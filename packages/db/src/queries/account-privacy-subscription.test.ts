import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  AccountPrivacySubscriptionError,
  confirmNoAccountPrivacySubscriptions,
} from "./account-privacy-subscription"

const previous = {
  processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
  subscription: process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED,
  policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
}
afterEach(() => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previous.processing
  process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED =
    previous.subscription
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = previous.policy
})

function enable() {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
}

function fixture(
  input: {
    operatorIsAdmin?: boolean
    userId?: string | null
    verifiedSubjectUserId?: string | null
    accessStatus?: string
    membershipStatus?: string
    membershipOutcome?: "ACCESS_REVOKED" | "NOT_APPLICABLE" | null
    checkout?: number
    refundActions?: number
    purchases?: number
    providerSubscriptions?: number
    billingInvoices?: number
    emailVerified?: boolean
    contactEmail?: string
  } = {},
) {
  const queries: Record<string, unknown> = {}
  const outcomes: Record<string, Record<string, unknown>> = {}
  let transactionOptions: unknown
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
        userId: input.userId === undefined ? "user-1" : input.userId,
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
    billingCheckoutSession: {
      count: async (query: unknown) => {
        queries.checkout = query
        return input.checkout ?? 0
      },
    },
    playRefundReviewResponse: {
      count: async (query: unknown) => {
        queries.refund = query
        return input.refundActions ?? 0
      },
    },
    storeSubscriptionPurchase: {
      count: async (query: unknown) => {
        queries.purchase = query
        return input.purchases ?? 0
      },
    },
    tenantSubscription: {
      count: async (query: unknown) => {
        queries.subscription = query
        return input.providerSubscriptions ?? 0
      },
    },
    billingInvoice: {
      count: async (query: unknown) => {
        queries.invoice = query
        return input.billingInvoices ?? 0
      },
    },
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
        return outcomes.SOFTWARE_SUBSCRIPTIONS ?? null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outcomes.SOFTWARE_SUBSCRIPTIONS = data
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

describe("account privacy no-subscription outcome", () => {
  test("stays disabled until both flags and approved policy are present", async () => {
    const { db } = fixture()
    await expect(
      confirmNoAccountPrivacySubscriptions(db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
    enable()
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
    await expect(
      confirmNoAccountPrivacySubscriptions(db, command),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  })

  test("records a no-data outcome once and rechecks on replay", async () => {
    enable()
    const { db, queries, outcomes, getTransactionOptions } = fixture()
    const first = await confirmNoAccountPrivacySubscriptions(db, command)
    expect(first).toEqual({
      requestId: "request-1",
      outcomeRecorded: true,
      replay: false,
    })
    expect(outcomes.SOFTWARE_SUBSCRIPTIONS).toMatchObject({
      domain: "SOFTWARE_SUBSCRIPTIONS",
      disposition: "NOT_APPLICABLE",
      userId: "user-1",
      policyVersion: "approved-v1",
      processor: "account-privacy-subscription-empty-v1",
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(queries).toEqual({
      checkout: { where: { requestedByUserId: "user-1" } },
      refund: { where: { actorUserId: "user-1" } },
      purchase: { where: { tenantId: { in: ["tenant-1"] } } },
      subscription: {
        where: {
          tenantId: { in: ["tenant-1"] },
          provider: { not: "NONE" },
        },
      },
      invoice: {
        where: { tenantId: { in: ["tenant-1"] } },
      },
    })
    expect(getTransactionOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    const replay = await confirmNoAccountPrivacySubscriptions(db, command)
    expect(replay.replay).toBe(true)
  })

  test.each([
    ["checkout", { checkout: 1 }],
    ["refund action", { refundActions: 1 }],
    ["store purchase", { purchases: 1 }],
    ["provider subscription", { providerSubscriptions: 1 }],
    ["billing invoice", { billingInvoices: 1 }],
  ])("requires review for %s", async (_name, live) => {
    enable()
    const { db, outcomes } = fixture(live)
    await expect(
      confirmNoAccountPrivacySubscriptions(db, command),
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_REVIEW_REQUIRED" })
    expect(outcomes.SOFTWARE_SUBSCRIPTIONS).toBeUndefined()
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
      confirmNoAccountPrivacySubscriptions(db, command),
    ).rejects.toBeInstanceOf(AccountPrivacySubscriptionError)
    await expect(
      confirmNoAccountPrivacySubscriptions(db, command),
    ).rejects.toMatchObject({ code })
  })
})
