import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { processAccountPrivacyProfile } from "./account-privacy-profile"
import {
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"

const now = new Date("2026-10-07T12:00:00.000Z")
const command = { requestId: "request-1", operatorUserId: "operator-1", now }
const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
]
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
})

function enable(disposition = "RETAIN") {
  const source = JSON.stringify({
    version: "policy-1",
    approvalReference: "qa-only-owner-policy",
    approvedAt: "2026-10-07T11:00:00.000Z",
    mode: "PSEUDONYMIZE",
    legalAcceptanceDisposition: disposition,
    retentionPurpose: "QA-only retained transaction linkage",
    reviewAt: "2027-10-07T00:00:00.000Z",
  })
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "policy-1"
  process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = source
  process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = createHash(
    "sha256",
  )
    .update(source)
    .digest("hex")
}

function fixture(
  options: {
    admin?: boolean
    missingPrior?: boolean
    sessions?: number
    providerTokens?: number
    memberships?: number
    failOutcome?: boolean
    wrongSubject?: boolean
    additional?: string
  } = {},
) {
  let state = {
    profile: {
      email: "member@example.test",
      name: "Member",
      image: "private-avatar",
      phone: "+2348000000000",
      firstName: "First",
      lastName: "Last",
      displayName: "Display",
      avatarUrl: "private-url",
      metadata: { sensitive: "value" },
      emailVerified: true,
      emailVerifiedAt: now,
      phoneVerifiedAt: now,
      isPlatformAdmin: false,
      ageBand: "AGE_13_TO_15",
      ageDeclaredAt: now,
    },
    accounts: 1,
    sessions: options.sessions ?? 0,
    otp: 1,
    acceptances: 2,
    outcomes: [
      ["IDENTITY_ACCESS", "ACCESS_REVOKED"],
      ["MEMBERSHIP", "ACCESS_REVOKED"],
      ["CONVERSATIONS", "NOT_APPLICABLE"],
      ["PRESCRIPTIONS", "NOT_APPLICABLE"],
      ["COMMERCIAL_RECORDS", "NOT_APPLICABLE"],
      ["SOFTWARE_SUBSCRIPTIONS", "NOT_APPLICABLE"],
      ["EXTERNAL_PROCESSORS", "NOT_APPLICABLE"],
    ].map(([domain, disposition]) => ({
      domain,
      disposition,
      userId: "user-1",
      policyVersion: "policy-1",
      processor: "qa-domain",
      evidenceDigest: "a".repeat(64),
      processedAt: new Date("2026-10-07T10:00:00.000Z"),
      nextReviewAt: null as Date | null,
    })),
  }
  if (options.missingPrior) state.outcomes.pop()
  let mutations = 0
  let transactionOptions: unknown
  const queries: Record<string, unknown> = {}
  const db = {
    ...Object.fromEntries(
      [
        "assistantConversation",
        "assistantRun",
        "assistantAttachment",
        "assistantUsageEvent",
        "message",
        "automationEvent",
        "productAnalyticsEvent",
      ].map((model) => [
        model,
        { count: async () => (options.additional === model ? 1 : 0) },
      ]),
    ),
    $transaction: async (
      callback: (tx: unknown) => Promise<unknown>,
      opts: unknown,
    ) => {
      transactionOptions = opts
      const before = structuredClone(state)
      try {
        return await callback(db)
      } catch (error) {
        state = before
        throw error
      }
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "operator-1"
          ? { isPlatformAdmin: options.admin ?? true }
          : state.profile,
      update: async ({ data }: { data: Partial<typeof state.profile> }) => {
        mutations++
        state.profile = { ...state.profile, ...data, metadata: null as never }
        return state.profile
      },
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request-1",
        requestKey: "account-deletion:user-1",
        userId: "user-1",
        verifiedSubjectUserId: options.wrongSubject ? "other-user" : "user-1",
        verifiedAt: new Date("2026-10-07T09:00:00.000Z"),
        contactEmail: "member@example.test",
        status: "PROCESSING",
        user: state.profile,
        accessRevocation: { status: "REVOKED", userId: "user-1" },
        domainOutcomes: state.outcomes,
      }),
    },
    account: {
      count: async ({ where }: { where: { OR?: unknown } }) =>
        where.OR ? (options.providerTokens ?? 0) : state.accounts,
      deleteMany: async (query: unknown) => {
        mutations++
        queries.accounts = query
        state.accounts = 0
      },
    },
    session: {
      count: async () => state.sessions,
      deleteMany: async () => {
        mutations++
        state.sessions = 0
      },
    },
    verification: {
      count: async () => state.otp,
      deleteMany: async (query: unknown) => {
        mutations++
        queries.otp = query
        state.otp = 0
      },
    },
    membership: { count: async () => options.memberships ?? 0 },
    storeConversationPushEndpoint: { count: async () => 0 },
    legalAcceptance: {
      count: async () => state.acceptances,
      deleteMany: async (query: unknown) => {
        mutations++
        queries.acceptances = query
        state.acceptances = 0
      },
    },
    accountPrivacyDomainOutcome: {
      create: async ({ data }: { data: (typeof state.outcomes)[number] }) => {
        if (options.failOutcome) throw new Error("Simulated outcome failure")
        mutations++
        state.outcomes.push(data)
        return data
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    state: () => state,
    mutations: () => mutations,
    options: () => transactionOptions,
    queries,
  }
}

test("profile processing never touches persistence without both flags and exact policy authority", async () => {
  enable()
  process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "false"
  const f = fixture()
  await expect(
    processAccountPrivacyProfile(f.db, command),
  ).rejects.toMatchObject({ code: "DISABLED" })
  process.env.ACCOUNT_PRIVACY_PROFILE_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = "a".repeat(64)
  await expect(
    processAccountPrivacyProfile(f.db, command),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  expect(f.options()).toBeUndefined()
  expect(f.mutations()).toBe(0)
})

test.each(["RETAIN", "ERASE"])(
  "minimizes profile with explicit %s acceptance policy and rechecks replay",
  async (mode) => {
    enable(mode)
    const f = fixture()
    const result = await processAccountPrivacyProfile(f.db, command)
    expect(result).toEqual({
      requestId: "request-1",
      profileMinimized: true,
      retainedLinkage: true,
      replay: false,
    })
    expect(f.state().profile).toMatchObject({
      email: accountPrivacyPseudonymousEmail("request-1", "user-1"),
      name: "",
      phone: null,
      image: null,
      metadata: null,
      emailVerified: false,
      isPlatformAdmin: false,
      ageBand: "UNDECLARED",
      ageDeclaredAt: null,
    })
    expect(f.state().acceptances).toBe(mode === "RETAIN" ? 2 : 0)
    expect(f.state().accounts).toBe(0)
    expect(f.state().otp).toBe(0)
    expect({ ...f.state().outcomes.at(-1) }).toMatchObject({
      domain: "ACCOUNT_PROFILE",
      disposition: "RETENTION_APPROVED",
      processor: "account-privacy-profile-v1",
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      nextReviewAt: new Date("2027-10-07T00:00:00.000Z"),
    })
    expect(f.options()).toEqual({
      isolationLevel: "Serializable",
      maxWait: 10_000,
      timeout: 30_000,
    })
    expect(JSON.stringify(f.queries.otp)).toContain(
      "mobile-auth:login:member@example.test",
    )
    const mutations = f.mutations()
    expect((await processAccountPrivacyProfile(f.db, command)).replay).toBe(
      true,
    )
    expect(f.mutations()).toBe(mutations)
    f.state().profile.ageBand = "ADULT"
    await expect(
      processAccountPrivacyProfile(f.db, command),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
  },
)

test.each([
  { admin: false },
  { wrongSubject: true },
  { missingPrior: true },
  { memberships: 1 },
  { sessions: 1 },
  { providerTokens: 1 },
  { additional: "assistantConversation" },
  { additional: "assistantRun" },
  { additional: "assistantAttachment" },
  { additional: "assistantUsageEvent" },
  { additional: "message" },
  { additional: "automationEvent" },
  { additional: "productAnalyticsEvent" },
])(
  "denies unready or unauthorized profile processing %j before writes",
  async (options) => {
    enable()
    const f = fixture(options)
    await expect(
      processAccountPrivacyProfile(f.db, command),
    ).rejects.toMatchObject({
      code: options.admin === false ? "OPERATOR_REQUIRED" : "NOT_READY",
    })
    expect(f.mutations()).toBe(0)
  },
)

test("a failed outcome write rolls back profile and credential changes", async () => {
  enable("ERASE")
  const f = fixture({ failOutcome: true })
  const before = structuredClone(f.state())
  await expect(processAccountPrivacyProfile(f.db, command)).rejects.toThrow(
    "Simulated outcome failure",
  )
  expect(f.state()).toEqual(before)
})

test("review authority rejects missing fields, unknown modes, expiry and mismatched versions", () => {
  enable()
  const valid = JSON.parse(
    process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON ?? "{}",
  )
  for (const changed of [
    { ...valid, mode: "ERASE_ALL" },
    { ...valid, version: "other" },
    { ...valid, approvalReference: "" },
    { ...valid, reviewAt: now.toISOString() },
    { ...valid, approvedAt: "2026-10-08T00:00:00.000Z" },
    { ...valid, extra: "unreviewed" },
  ]) {
    const source = JSON.stringify(changed)
    expect(
      getApprovedAccountPrivacyProfilePolicy(
        {
          ...process.env,
          ACCOUNT_PRIVACY_PROFILE_POLICY_JSON: source,
          ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256: createHash("sha256")
            .update(source)
            .digest("hex"),
        },
        now,
      ),
    ).toBeNull()
  }
})
