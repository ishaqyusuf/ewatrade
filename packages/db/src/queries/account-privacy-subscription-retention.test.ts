import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  accountPrivacyProfileEvidence,
  accountPrivacyPseudonymousEmail,
  getApprovedAccountPrivacyProfilePolicy,
} from "./account-privacy-profile-policy"
import {
  getAccountPrivacySubscriptionInventory,
  subscriptionPrivacyDigest,
} from "./account-privacy-subscription-inventory"
import { subscriptionReviewDeadline } from "./account-privacy-subscription-policy"
import {
  accountPrivacySubscriptionRetentionIsConfirmed,
  confirmAccountPrivacySubscriptions,
  inspectAccountPrivacySubscriptionRetention,
  inspectAccountPrivacySubscriptions,
  minimizeAccountPrivacySubscriptionLinks,
  reassessAccountPrivacySubscriptions,
  reviewAccountPrivacySubscriptions,
} from "./account-privacy-subscription-retention"

const now = new Date("2026-11-08T12:00:00Z")
const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256",
  "ACCOUNT_PRIVACY_PROFILE_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256",
]
const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    if (before[key] === undefined) delete process.env[key]
    else process.env[key] = before[key]
  }
})
function enable() {
  const policy = {
    version: "approved-v1",
    mode: "MINIMUM_NECESSARY_BILLING_RETENTION",
    approvedAt: "2026-11-01T00:00:00Z",
    documentDigest: "a".repeat(64),
    maximumReviewMonths: 12,
    maximumHoldDays: 90,
  }
  for (const key of keys.slice(0, 3)) process.env[key] = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = policy.version
  process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON = JSON.stringify(policy)
  process.env.ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256 =
    subscriptionPrivacyDigest(policy)
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Fixture row missing")
  return value
}
function fixture() {
  const rows: Record<string, Record<string, unknown>[]> = {
    membership: [],
    ownerBillingAccount: [
      { id: "own-account", ownerUserId: "subject", createdAt: now },
    ],
    ownerBillingPurchase: [
      {
        id: "receipt",
        accountId: "own-account",
        provider: "APP_STORE",
        environment: "sandbox",
        latestOrderDigest: "order-digest",
        verifiedAt: now,
      },
    ],
    ownerBillingSubscription: [],
    ownerBusinessCoverage: [],
    billingCheckoutSession: [],
    storeSubscriptionPurchase: [],
    tenantSubscription: [],
    billingInvoice: [],
    billingProviderEvent: [],
    playRefundReviewCase: [],
    playRefundReviewResponse: [],
  }
  const reviews: Record<string, unknown>[] = []
  let outcome: Record<string, unknown> | null = null
  let admin = true
  let emailVerified = true
  let minimized = false
  let authAccounts = 0
  let profileOutcome: Record<string, unknown> | null = null
  const queries: Record<string, unknown[]> = {}
  const delegates = Object.fromEntries(
    Object.keys(rows).map((key) => [
      key,
      {
        findMany: async (query: unknown) => {
          const captured = queries[key] ?? []
          captured.push(query)
          queries[key] = captured
          return rows[key] ?? []
        },
      },
    ]),
  )
  const db = {
    ...delegates,
    billingCheckoutSession: {
      ...delegates.billingCheckoutSession,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        for (const row of rows.billingCheckoutSession ?? [])
          Object.assign(row, data)
        return { count: rows.billingCheckoutSession?.length ?? 0 }
      },
    },
    billingProviderEvent: {
      findMany: async (query: { where: { type?: string } }) => {
        const captured = queries.billingProviderEvent ?? []
        captured.push(query)
        queries.billingProviderEvent = captured
        return (rows.billingProviderEvent ?? []).filter(
          (row) => !query.where.type || row.type === query.where.type,
        )
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = required(
          rows.billingProviderEvent?.find((item) => item.id === where.id),
        )
        Object.assign(row, data)
        return row
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "subject"
          ? {
              email: accountPrivacyPseudonymousEmail("request", "subject"),
              name: "",
              ageBand: "UNDECLARED",
              isPlatformAdmin: false,
            }
          : { isPlatformAdmin: admin },
    },
    account: { count: async () => authAccounts },
    session: { count: async () => 0 },
    verification: { count: async () => 0 },
    legalAcceptance: { count: async () => 0 },
    membership: {
      ...delegates.membership,
      count: async () =>
        rows.membership?.filter((row) => row.status !== "REMOVED").length ?? 0,
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request",
        userId: "subject",
        verifiedSubjectUserId: "subject",
        requestKey: "account-deletion:subject",
        verifiedAt: new Date("2026-11-01"),
        contactEmail: "subject@example.test",
        status: "PROCESSING",
        user: {
          email: minimized
            ? accountPrivacyPseudonymousEmail("request", "subject")
            : "subject@example.test",
          emailVerified: minimized ? false : emailVerified,
        },
        accessRevocation: { status: "REVOKED", userId: "subject" },
      }),
    },
    accountPrivacySubscriptionReview: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        for (const row of reviews)
          if (!row.supersededAt) Object.assign(row, data)
        return { count: reviews.length }
      },
      findUnique: async ({
        where,
      }: { where: { decisionDigest?: string; id?: string } }) =>
        reviews.find((row) =>
          where.id
            ? row.id === where.id
            : row.decisionDigest === where.decisionDigest,
        ) ?? null,
      findFirst: async () => reviews.at(-1) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `review-${reviews.length}`, ...data }
        reviews.push(row)
        return row
      },
    },
    accountPrivacyDomainOutcome: {
      findUnique: async ({
        where,
      }: { where: { requestId_domain: { domain: string } } }) =>
        where.requestId_domain.domain === "ACCOUNT_PROFILE"
          ? profileOutcome
          : outcome,
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        outcome = outcome ? { ...outcome, ...update } : create
        return outcome
      },
    },
    $transaction: async (
      run: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      expect(options).toMatchObject({ isolationLevel: "Serializable" })
      return run(db)
    },
  }
  return {
    db: db as unknown as PrismaClient,
    rows,
    reviews,
    queries,
    outcome: () => outcome,
    setOutcome: (value: Record<string, unknown>) => {
      outcome = value
    },
    setMinimized: (validProof = true) => {
      minimized = true
      const policyJson = JSON.stringify({
        version: "approved-v1",
        approvalReference: "synthetic-only",
        approvedAt: "2026-11-01T00:00:00.000Z",
        mode: "PSEUDONYMIZE",
        legalAcceptanceDisposition: "RETAIN",
        retentionPurpose: "Synthetic billing linkage",
        reviewAt: "2027-11-01T00:00:00.000Z",
      })
      process.env.ACCOUNT_PRIVACY_PROFILE_POLICY_JSON = policyJson
      process.env.ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256 = createHash(
        "sha256",
      )
        .update(policyJson)
        .digest("hex")
      const policy = required(
        getApprovedAccountPrivacyProfilePolicy(process.env, now) ?? undefined,
      )
      profileOutcome = {
        userId: "subject",
        processor: "account-privacy-profile-v1",
        policyVersion: policy.version,
        disposition: "RETENTION_APPROVED",
        processedAt: now,
        nextReviewAt: new Date(policy.reviewAt),
        evidenceDigest: validProof
          ? accountPrivacyProfileEvidence({
              requestId: "request",
              subjectId: "subject",
              policy,
              legalAcceptanceCount: 0,
            })
          : "0".repeat(64),
      }
    },
    setAuthAccounts: (count: number) => {
      authAccounts = count
    },
    setAdmin: (value: boolean) => {
      admin = value
    },
    setVerified: (value: boolean) => {
      emailVerified = value
    },
  }
}
async function reviewInput(db: PrismaClient) {
  const inventory = await getAccountPrivacySubscriptionInventory(db, "subject")
  return {
    requestId: "request",
    operatorUserId: "operator",
    now,
    expectedInventoryDigest: inventory.inventoryDigest,
    policyDigest:
      process.env.ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256 ?? "",
    controllerEvidenceDigest: "b".repeat(64),
    minimumNecessaryReviewed: true as const,
    controllerAuthorityReviewed: true as const,
    shorterPoliciesAndHoldsReviewed: true as const,
    storeCancellationIsSeparate: true as const,
    decisions: [...new Set(inventory.records.map((row) => row.family))].map(
      (family) => ({
        family,
        purpose: "RECEIPT_ANTI_REPLAY" as const,
        necessityEvidenceDigest: "c".repeat(64),
        basisEvidenceDigest: "d".repeat(64),
        nextReviewAt: "2027-01-01T00:00:00Z",
        basis: { kind: "EXPIRY" as const, expiresAt: "2027-02-01T00:00:00Z" },
      }),
    ),
  }
}
const command = { requestId: "request", operatorUserId: "operator", now }
describe("paid-owner privacy review", () => {
  test("resumes billing after exact profile minimization, rejecting forged proof or reappearing authentication", async () => {
    enable()
    const f = fixture()
    f.setMinimized(false)
    await expect(
      inspectAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("NOT_READY")
    f.setMinimized(true)
    f.setAuthAccounts(1)
    await expect(
      inspectAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("NOT_READY")
    f.setAuthAccounts(0)
    const inventory = await inspectAccountPrivacySubscriptions(f.db, command)
    expect(inventory.blockers).toEqual([])
    await reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db))
    expect(
      await confirmAccountPrivacySubscriptions(f.db, command),
    ).toMatchObject({ recordsRetained: 2 })
  })
  test("replaces a stale canonical empty outcome only after fresh positive review", async () => {
    enable()
    const f = fixture()
    f.setOutcome({
      userId: "subject",
      policyVersion: "approved-v1",
      processor: "account-privacy-subscription-empty-v1",
      disposition: "NOT_APPLICABLE",
      evidenceDigest: "f".repeat(64),
    })
    await expect(
      confirmAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    await reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db))
    expect(
      await confirmAccountPrivacySubscriptions(f.db, command),
    ).toMatchObject({ replay: false })
    expect(f.outcome()?.disposition).toBe("RETENTION_APPROVED")
  })
  test("supports independent earlier/annual reassessment and supersedes old evidence without changing access or subscription", async () => {
    enable()
    const f = fixture()
    const original = JSON.stringify(f.rows)
    const input = await reviewInput(f.db)
    const initial = await reviewAccountPrivacySubscriptions(f.db, input)
    const reviewId = required(initial.reviewId)
    const { requestId: _, ...decision } = input
    expect(
      (
        await inspectAccountPrivacySubscriptionRetention(f.db, {
          reviewId,
          operatorUserId: "operator",
        })
      ).inventoryDigest,
    ).toBe(input.expectedInventoryDigest)
    const later = {
      ...decision,
      reviewId,
      controllerEvidenceDigest: "e".repeat(64),
    }
    const next = await reassessAccountPrivacySubscriptions(f.db, later)
    expect(next.replay).toBe(false)
    expect(f.reviews[0]?.supersededAt).toEqual(now)
    await expect(
      reassessAccountPrivacySubscriptions(f.db, later),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    expect(JSON.stringify(f.rows)).toBe(original)
    f.setAdmin(false)
    await expect(
      inspectAccountPrivacySubscriptionRetention(f.db, {
        reviewId: required(next.reviewId),
        operatorUserId: "operator",
      }),
    ).rejects.toThrow("OPERATOR_REQUIRED")
  })
  test("clears only terminal checkout links under the exact source digest, then requires a fresh review", async () => {
    enable()
    const f = fixture()
    f.rows.billingCheckoutSession?.push({
      id: "checkout",
      requestedByUserId: "subject",
      status: "COMPLETED",
      providerSessionId: "keep-reference",
      metadata: { ownerWeb: { accountId: "own-account" } },
      checkoutUrl: "https://pay.example/secret",
      successUrl: "https://return.example",
      cancelUrl: "https://cancel.example",
    })
    f.rows.billingProviderEvent?.push({
      id: "journal",
      type: "owner_paystack_checkout",
      status: "PROCESSED",
      metadata: {
        ownerWeb: {
          accountId: "own-account",
          environment: "sandbox",
          state: "paid",
          customerCode: "keep-customer",
        },
      },
      payload: {
        session: {
          id: "checkout",
          requestedByUserId: "subject",
          providerSessionId: "keep-reference",
          checkoutUrl: "https://pay.example/secret",
        },
      },
    })
    const input = await reviewInput(f.db)
    await expect(
      reviewAccountPrivacySubscriptions(f.db, input),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    await expect(
      minimizeAccountPrivacySubscriptionLinks(f.db, {
        ...command,
        expectedInventoryDigest: "f".repeat(64),
      }),
    ).rejects.toThrow("SOURCE_CHANGED")
    const minimized = await minimizeAccountPrivacySubscriptionLinks(f.db, {
      ...command,
      expectedInventoryDigest: input.expectedInventoryDigest,
    })
    expect(minimized.blockers).toEqual([])
    expect(f.rows.billingCheckoutSession?.[0]).toMatchObject({
      providerSessionId: "keep-reference",
      checkoutUrl: null,
      successUrl: null,
      cancelUrl: null,
    })
    expect(JSON.stringify(f.rows.billingProviderEvent)).toContain(
      "keep-customer",
    )
    expect(JSON.stringify(f.rows.billingProviderEvent)).not.toContain(
      "https://pay.example/secret",
    )
    await expect(
      reviewAccountPrivacySubscriptions(f.db, input),
    ).rejects.toThrow("SOURCE_CHANGED")
    await reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db))
    await confirmAccountPrivacySubscriptions(f.db, command)
  })
  test("requires approval/config, admin and independently verified subject", async () => {
    const f = fixture()
    await expect(
      reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db)),
    ).rejects.toThrow("DISABLED")
    enable()
    f.setAdmin(false)
    await expect(
      inspectAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("OPERATOR_REQUIRED")
    f.setAdmin(true)
    f.setVerified(false)
    await expect(
      reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db)),
    ).rejects.toThrow("NOT_READY")
  })
  test("reviews mobile receipts; normal advance consumes proof, preserves billing and replays", async () => {
    enable()
    const f = fixture()
    await expect(
      confirmAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    const input = await reviewInput(f.db)
    const original = JSON.stringify(f.rows)
    expect(await reviewAccountPrivacySubscriptions(f.db, input)).toMatchObject({
      replay: false,
      recordsReviewed: 2,
    })
    expect(await reviewAccountPrivacySubscriptions(f.db, input)).toMatchObject({
      replay: true,
    })
    expect(
      await confirmAccountPrivacySubscriptions(f.db, command),
    ).toMatchObject({ replay: false, recordsRetained: 2 })
    expect(
      await confirmAccountPrivacySubscriptions(f.db, command),
    ).toMatchObject({ replay: true })
    expect(JSON.stringify(f.rows)).toBe(original)
    expect(f.outcome()).toMatchObject({
      disposition: "RETENTION_APPROVED",
      processor: "account-privacy-subscription-retention-v1",
    })
    expect(JSON.stringify(f.reviews)).not.toContain("example.test")
  })
  test("late receipt, changed environment, or refund invalidates reviewed inventory and completion proof", async () => {
    enable()
    const f = fixture()
    await reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db))
    await confirmAccountPrivacySubscriptions(f.db, command)
    const outcome = f.outcome() as unknown as Parameters<
      typeof accountPrivacySubscriptionRetentionIsConfirmed
    >[1]["outcome"]
    expect(
      await accountPrivacySubscriptionRetentionIsConfirmed(f.db, {
        requestId: "request",
        subjectId: "subject",
        outcome,
        now,
      }),
    ).toBe(true)
    f.rows.ownerBillingPurchase?.push({
      id: "late-receipt",
      accountId: "own-account",
      environment: "production",
    })
    expect(
      await accountPrivacySubscriptionRetentionIsConfirmed(f.db, {
        requestId: "request",
        subjectId: "subject",
        outcome,
        now,
      }),
    ).toBe(false)
    await expect(
      confirmAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
  })
  test("rejects stale digest, duplicate/missing categories, expired evidence and annual/hold violations", async () => {
    enable()
    const f = fixture()
    const input = await reviewInput(f.db)
    await expect(
      reviewAccountPrivacySubscriptions(f.db, {
        ...input,
        expectedInventoryDigest: "e".repeat(64),
      }),
    ).rejects.toThrow("SOURCE_CHANGED")
    await expect(
      reviewAccountPrivacySubscriptions(f.db, {
        ...input,
        decisions: [required(input.decisions[0]), required(input.decisions[0])],
      }),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    const decision = required(input.decisions[0])
    expect(
      subscriptionReviewDeadline(
        [{ ...decision, nextReviewAt: "2028-01-01T00:00:00Z" }],
        now,
      ),
    ).toBeNull()
    expect(
      subscriptionReviewDeadline(
        [
          {
            ...decision,
            basis: { kind: "EXPIRY", expiresAt: "2026-01-01T00:00:00Z" },
          },
        ],
        now,
      ),
    ).toBeNull()
    expect(
      subscriptionReviewDeadline(
        [
          {
            ...decision,
            basis: {
              kind: "HOLD",
              reason: "LEGAL_HOLD",
              reviewAt: "2027-03-01T00:00:00Z",
            },
          },
        ],
        now,
      ),
    ).toBeNull()
  })
  test("includes paid Paystack journal, charge/refund and released coverage without legacy checkout", async () => {
    enable()
    const f = fixture()
    f.rows.ownerBusinessCoverage?.push({
      id: "released",
      accountId: "own-account",
      tenantId: "old-tenant",
      releasedAt: now,
      enrolledByUserId: "subject",
    })
    f.rows.billingProviderEvent?.push(
      {
        id: "journal",
        type: "owner_paystack_checkout",
        status: "PROCESSED",
        metadata: {
          ownerWeb: {
            accountId: "own-account",
            environment: "sandbox",
            state: "paid",
            customerCode: "secret-customer",
          },
        },
        payload: {
          session: {
            id: "checkout",
            requestedByUserId: "subject",
            providerSessionId: "secret-ref",
            checkoutUrl: null,
          },
        },
      },
      {
        id: "charge",
        type: "owner_paystack_charge",
        status: "PROCESSED",
        payload: { accountId: "own-account", orderDigest: "paid-order" },
      },
      {
        id: "refund",
        type: "owner_paystack_refund",
        status: "PROCESSED",
        payload: { orderDigest: "paid-order" },
      },
    )
    const inventory = await getAccountPrivacySubscriptionInventory(
      f.db,
      "subject",
    )
    expect(inventory.blockers).toEqual([])
    expect(inventory.counts.PROVIDER_EVENT).toBe(3)
    expect(JSON.stringify(inventory)).not.toContain("secret-")
    expect(JSON.stringify(f.queries.billingProviderEvent)).toContain("ownerWeb")
    await reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db))
    await confirmAccountPrivacySubscriptions(f.db, command)
    required(f.rows.billingProviderEvent?.[0]).metadata = {
      ownerWeb: {
        accountId: "own-account",
        environment: "sandbox",
        state: "uncertain",
      },
    }
    await expect(
      confirmAccountPrivacySubscriptions(f.db, command),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
  })
  test("cannot certify another owner's coverage, unallocated legacy rows, pending or oversized source", async () => {
    enable()
    for (const [family, row] of [
      ["ownerBusinessCoverage", { id: "other", accountId: "other-account" }],
      ["billingInvoice", { id: "legacy" }],
      [
        "billingProviderEvent",
        {
          id: "pending",
          status: "PENDING",
          type: "owner_subscription_updated",
          payload: { accountId: "own-account" },
        },
      ],
    ] as const) {
      const f = fixture()
      f.rows[family]?.push(row)
      await expect(
        reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db)),
      ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
    }
    const f = fixture()
    f.rows.ownerBillingPurchase = Array.from({ length: 501 }, (_, i) => ({
      id: `receipt-${i}`,
    }))
    await expect(
      reviewAccountPrivacySubscriptions(f.db, await reviewInput(f.db)),
    ).rejects.toThrow("SUBSCRIPTION_REVIEW_REQUIRED")
  })
  test("forged or unsupported positive outcome never substitutes for the canonical review", async () => {
    enable()
    const f = fixture()
    expect(
      await accountPrivacySubscriptionRetentionIsConfirmed(f.db, {
        requestId: "request",
        subjectId: "subject",
        now,
        outcome: {
          userId: "subject",
          policyVersion: "approved-v1",
          disposition: "RETENTION_APPROVED",
          processor: "manual-ledger",
          evidenceDigest: "f".repeat(64),
          nextReviewAt: new Date("2027-01-01"),
          processedAt: now,
        },
      }),
    ).toBe(false)
  })
})
