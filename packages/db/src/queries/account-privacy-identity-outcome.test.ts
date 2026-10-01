import { afterEach, describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { confirmAccountPrivacyIdentityAccessRevoked } from "./account-privacy-identity-outcome"

const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_IDENTITY_OUTCOME_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})

function enable() {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_IDENTITY_OUTCOME_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
}

function fixture(input: Record<string, unknown> = {}) {
  const outcomes: Record<string, unknown>[] = []
  const queries: Record<string, unknown> = {}
  let options: unknown
  const delegates: Record<string, unknown> = {
    $transaction: async (
      callback: (tx: unknown) => Promise<unknown>,
      txOptions: unknown,
    ) => {
      options = txOptions
      return callback(db)
    },
    user: {
      findUnique: async () => ({ isPlatformAdmin: input.admin ?? true }),
    },
    accountPrivacyRequest: {
      findUnique: async () =>
        input.missing
          ? null
          : {
              id: "request-1",
              requestKey: input.requestKey ?? "account-deletion:user-1",
              userId: input.userId === undefined ? "user-1" : input.userId,
              verifiedSubjectUserId: input.verifiedSubjectUserId ?? "user-1",
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
            },
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
          return property === input.nonzeroModel ? 1 : 0
        },
      }
    },
  }) as unknown as PrismaClient
  return { db, outcomes, queries, getOptions: () => options }
}

const command = {
  requestId: "request-1",
  operatorUserId: "operator-1",
  now: new Date("2026-09-27T13:00:00.000Z"),
}

describe("account privacy identity access outcome", () => {
  test("requires both switches and an approved policy", async () => {
    const { db } = fixture()
    await expect(
      confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).rejects.toMatchObject({ code: "DISABLED" })
    enable()
    process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = ""
    await expect(
      confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  })

  test("records one certified outcome and rechecks on replay", async () => {
    enable()
    const { db, outcomes, queries, getOptions } = fixture()
    expect(
      await confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).toMatchObject({ outcomeRecorded: true, replay: false })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({
      domain: "IDENTITY_ACCESS",
      disposition: "ACCESS_REVOKED",
      processor: "account-privacy-identity-empty-v1",
      policyVersion: "approved-v1",
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(queries.session).toEqual({
      where: { userId: "user-1", expiresAt: { gt: command.now } },
    })
    expect(queries.storeConversationPrivacyRequest).toEqual({
      where: { accountUserId: "user-1" },
    })
    expect(getOptions()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    expect(
      await confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).toMatchObject({ replay: true })
  })

  test.each([
    ["live session", "session", "IDENTITY_ACCESS_REMAINS"],
    ["provider token", "account", "IDENTITY_ACCESS_REMAINS"],
    [
      "push endpoint",
      "storeConversationPushEndpoint",
      "IDENTITY_ACCESS_REMAINS",
    ],
    ["live OTP", "verification", "IDENTITY_ACCESS_REMAINS"],
    [
      "guest link",
      "storeConversationAccountAccess",
      "GUEST_ACCESS_REVIEW_REQUIRED",
    ],
    [
      "guest privacy request",
      "storeConversationPrivacyRequest",
      "GUEST_ACCESS_REVIEW_REQUIRED",
    ],
    [
      "WhatsApp candidate",
      "storeConversationWhatsAppCandidate",
      "GUEST_ACCESS_REVIEW_REQUIRED",
    ],
    [
      "direct attribution",
      "storeConversationModerationAuditEvent",
      "GUEST_ACCESS_REVIEW_REQUIRED",
    ],
  ])("refuses %s on replay", async (_label, nonzeroModel, code) => {
    enable()
    const { db, outcomes } = fixture({
      nonzeroModel,
      existing: {
        userId: "user-1",
        disposition: "ACCESS_REVOKED",
        processor: "account-privacy-identity-empty-v1",
        policyVersion: "approved-v1",
      },
    })
    await expect(
      confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).rejects.toMatchObject({ code })
    expect(outcomes).toHaveLength(0)
  })

  test.each([
    ["non-admin", { admin: false }, "OPERATOR_REQUIRED"],
    ["missing request", { missing: true }, "NOT_FOUND"],
    [
      "unverified subject",
      { verifiedSubjectUserId: "user-2" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    [
      "external request",
      { requestKey: "external-deletion:x" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    ["unverified email", { emailVerified: false }, "IDENTITY_REVIEW_REQUIRED"],
    [
      "contact mismatch",
      { contactEmail: "other@example.test" },
      "IDENTITY_REVIEW_REQUIRED",
    ],
    [
      "access pending",
      { accessStatus: "PENDING" },
      "ACCESS_REVOCATION_REQUIRED",
    ],
  ] as const)("refuses %s", async (_label, input, code) => {
    enable()
    await expect(
      confirmAccountPrivacyIdentityAccessRevoked(fixture(input).db, command),
    ).rejects.toMatchObject({ code })
  })

  test("refuses another policy or processor", async () => {
    enable()
    const { db } = fixture({
      existing: {
        userId: "user-1",
        disposition: "ACCESS_REVOKED",
        processor: "other",
        policyVersion: "approved-v1",
      },
    })
    await expect(
      confirmAccountPrivacyIdentityAccessRevoked(db, command),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
  })
})
