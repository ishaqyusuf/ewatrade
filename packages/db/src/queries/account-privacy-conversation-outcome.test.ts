import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  AccountPrivacyConversationOutcomeError,
  confirmNoAccountPrivacyConversations,
} from "./account-privacy-conversation-outcome"

const previous = {
  processing: process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED,
  conversation:
    process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED,
  policy: process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION,
}
afterEach(() => {
  for (const [key, value] of [
    ["ACCOUNT_PRIVACY_PROCESSING_ENABLED", previous.processing],
    [
      "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
      previous.conversation,
    ],
    ["ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION", previous.policy],
  ] as const) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})

function enable() {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
}

function fixture(
  input: {
    operatorIsAdmin?: boolean
    requestKey?: string
    userId?: string | null
    verifiedSubjectUserId?: string | null
    emailVerified?: boolean
    contactEmail?: string
    accessStatus?: string
    historicalLinks?: number
    privacyRequests?: number
    historicalCandidates?: number
    directModel?: string
    existing?: Record<string, unknown>
  } = {},
) {
  const queries: Record<string, unknown> = {}
  const outcomes: Record<string, unknown>[] = []
  let transactionOptions: unknown
  const delegates: Record<string, unknown> = {
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
        requestKey: input.requestKey ?? "account-deletion:user-1",
        userId: input.userId === undefined ? "user-1" : input.userId,
        verifiedSubjectUserId:
          input.verifiedSubjectUserId === undefined
            ? "user-1"
            : input.verifiedSubjectUserId,
        verifiedAt: new Date("2026-09-27T12:00:00.000Z"),
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
    accountPrivacyDomainOutcome: {
      findUnique: async () => input.existing ?? outcomes[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        outcomes.push(data)
        return data
      },
    },
  }
  const db = new Proxy(delegates, {
    get(target, property) {
      if (typeof property !== "string") return undefined
      if (property in target) return target[property]
      return {
        count: async (query: unknown) => {
          queries[property] = query
          if (property === "storeConversationAccountAccess")
            return input.historicalLinks ?? 0
          if (property === "storeConversationPrivacyRequest")
            return input.privacyRequests ?? 0
          if (property === "storeConversationWhatsAppCandidate")
            return input.historicalCandidates ?? 0
          return property === input.directModel ? 1 : 0
        },
      }
    },
  }) as unknown as PrismaClient
  return {
    db,
    queries,
    outcomes,
    getTransactionOptions: () => transactionOptions,
  }
}

const command = { requestId: "request-1", operatorUserId: "operator-1" }

describe("account privacy empty conversation outcome", () => {
  test("requires its own switch and an approved policy", async () => {
    const { db } = fixture()
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
    enable()
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  })

  test("records only an empty-data outcome and rechecks on replay", async () => {
    enable()
    const { db, queries, outcomes, getTransactionOptions } = fixture()
    expect(await confirmNoAccountPrivacyConversations(db, command)).toEqual({
      requestId: "request-1",
      outcomeRecorded: true,
      replay: false,
    })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({
      domain: "CONVERSATIONS",
      disposition: "NOT_APPLICABLE",
      userId: "user-1",
      policyVersion: "approved-v1",
      processor: "account-privacy-conversation-empty-v1",
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(Object.keys(queries)).toHaveLength(21)
    expect(queries.storeConversationAccountAccess).toEqual({
      where: { accountUserId: "user-1" },
    })
    expect(queries.storeConversationWhatsAppCandidate).toEqual({
      where: {
        OR: [
          { accountUserId: "user-1" },
          { accountAccess: { is: { accountUserId: "user-1" } } },
        ],
      },
    })
    expect(getTransactionOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    expect(
      await confirmNoAccountPrivacyConversations(db, command),
    ).toMatchObject({
      replay: true,
    })
  })

  test.each([
    ["historical link", { historicalLinks: 1 }],
    ["privacy request", { privacyRequests: 1 }],
    ["historical candidate", { historicalCandidates: 1 }],
    ["direct audit", { directModel: "storeConversationModerationAuditEvent" }],
  ])("refuses %s even after a previous empty outcome", async (_name, state) => {
    enable()
    const { db, outcomes } = fixture({
      ...state,
      existing: {
        userId: "user-1",
        disposition: "NOT_APPLICABLE",
        processor: "account-privacy-conversation-empty-v1",
        policyVersion: "approved-v1",
      },
    })
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toMatchObject({ code: "CONVERSATION_REVIEW_REQUIRED" })
    expect(outcomes).toHaveLength(0)
  })

  test.each([
    ["non-admin", { operatorIsAdmin: false }, "OPERATOR_REQUIRED"],
    ["missing subject", { userId: null }, "IDENTITY_REVIEW_REQUIRED"],
    [
      "subject mismatch",
      { verifiedSubjectUserId: "user-2" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    [
      "external request key",
      { requestKey: "external-deletion:abc" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    ["unverified email", { emailVerified: false }, "IDENTITY_REVIEW_REQUIRED"],
    [
      "different contact",
      { contactEmail: "other@example.test" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    [
      "access not revoked",
      { accessStatus: "PENDING" },
      "ACCESS_REVOCATION_REQUIRED",
    ],
  ] as const)("rejects %s", async (_name, state, code) => {
    enable()
    const { db } = fixture(state)
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toBeInstanceOf(AccountPrivacyConversationOutcomeError)
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toMatchObject({ code })
  })

  test("refuses to overwrite another processor or policy", async () => {
    enable()
    const { db } = fixture({
      existing: {
        userId: "user-1",
        disposition: "ANONYMIZATION_CONFIRMED",
        processor: "manual-review",
        policyVersion: "approved-v1",
      },
    })
    await expect(
      confirmNoAccountPrivacyConversations(db, command),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
  })
})
