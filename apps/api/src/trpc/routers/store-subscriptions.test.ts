import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { storeSubscriptionsRouter } from "./store-subscriptions"

test("disabled or unmapped catalog does not create a store billing account", async () => {
  const previous = {
    enabled: process.env.STORE_BILLING_ENABLED,
    products: process.env.STORE_SUBSCRIPTION_PRODUCTS,
  }
  const writes: unknown[] = []
  const db = {
    storeBillingAccount: {
      upsert: async (query: unknown) => {
        writes.push(query)
        return { id: "opaque-business-binding" }
      },
    },
    tenantSubscription: { findUnique: async () => null },
  }
  const caller = createCallerFactory(storeSubscriptionsRouter)({
    db,
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "ordinary-session" },
      user: { id: "manager-1" },
    },
    tenantContext: {
      tenant: { id: "tenant-1", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role: "OWNER" },
    },
  } as never)
  try {
    process.env.STORE_BILLING_ENABLED = "false"
    process.env.STORE_SUBSCRIPTION_PRODUCTS = "[]"
    expect(await caller.catalog()).toMatchObject({
      products: [],
      purchaseAvailable: false,
      accountToken: null,
    })
    expect(writes).toHaveLength(0)

    process.env.STORE_BILLING_ENABLED = "true"
    expect(await caller.catalog()).toMatchObject({
      products: [],
      purchaseAvailable: false,
      accountToken: null,
    })
    expect(writes).toHaveLength(0)

    process.env.STORE_SUBSCRIPTION_PRODUCTS = JSON.stringify([
      { store: "app_store", productId: "growth.ios", planId: "growth" },
      { store: "play_store", productId: "growth.play", planId: "growth" },
    ])
    expect(await caller.catalog()).toMatchObject({
      purchaseAvailable: false,
      accountToken: "opaque-business-binding",
    })
    expect(writes).toHaveLength(1)
  } finally {
    for (const [key, value] of [
      ["STORE_BILLING_ENABLED", previous.enabled],
      ["STORE_SUBSCRIPTION_PRODUCTS", previous.products],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})

test("only platform admins can inspect token-free Play refund reviews", async () => {
  const options: unknown[] = []
  const countOptions: unknown[] = []
  const db = {
    playRefundReviewCase: {
      findMany: async (input: unknown) => {
        options.push(input)
        return [
          {
            id: "review-1",
            tenantId: null,
            refundReason: 7,
            occurredAt: new Date(0),
            responseDueAt: new Date(86_400_000),
            receivedAt: new Date(0),
            response: { status: "UNCERTAIN" },
          },
        ]
      },
      count: async (input: unknown) => {
        countOptions.push(input)
        return 1
      },
    },
  }
  const caller = (isPlatformAdmin: boolean) =>
    createCallerFactory(storeSubscriptionsRouter)({
      db,
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "ordinary-session" },
        user: { id: "operator-1", isPlatformAdmin },
      },
    } as never)
  await expect(caller(false).refundReviewQueue()).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(options).toHaveLength(0)
  const queue = await caller(true).refundReviewQueue()
  expect(queue.cases).toHaveLength(1)
  expect(queue.cases[0]?.responseStatus).toBe("UNCERTAIN")
  expect(JSON.stringify(options)).toContain("CONFIRMED")
  expect(JSON.stringify(countOptions)).toContain("CONFIRMED")
  expect(JSON.stringify(queue)).not.toContain("encryptedPendingToken")
  expect(JSON.stringify(options)).not.toContain("encryptedPendingToken")
})

test("Play response preparation requires an admin and an enabled sandbox profile", async () => {
  const keys = [
    "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
    "STORE_BILLING_ENVIRONMENT",
    "APP_ENV",
    "DEV_PROFILE",
    "PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED",
    "PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION",
  ] as const
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  const writes: unknown[] = []
  const response = {
    id: "response-1",
    caseId: "case-1",
    actorUserId: "operator-1",
    preference: "NEUTRAL",
    sampleContentProvided: false,
    policyVersion: "sandbox-refund-review-v1",
    decisionEvidenceDigest: "a".repeat(64),
    status: "PREPARED",
    preparedAt: new Date(),
  }
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: { findUnique: async () => ({ isPlatformAdmin: true }) },
        playRefundReviewCase: {
          findUnique: async () => ({
            tenantId: "tenant-1",
            encryptedPendingToken: "encrypted-token",
            encryptedOrderId: "encrypted-order",
            encryptionKeyId: "key-1",
            tokenDigest: "token-digest",
            orderDigest: "order-digest",
            responseDueAt: new Date(Date.now() + 86_400_000),
          }),
        },
        playRefundReviewResponse: {
          upsert: async (input: unknown) => {
            writes.push(input)
            return response
          },
        },
      }),
  }
  const caller = (isPlatformAdmin: boolean) =>
    createCallerFactory(storeSubscriptionsRouter)({
      db,
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "operator-session" },
        user: { id: "operator-1", isPlatformAdmin },
      },
    } as never)
  const decision = {
    caseId: "case-1",
    preference: "NEUTRAL" as const,
    sampleContentProvided: false,
    decisionEvidenceDigest: "a".repeat(64),
  }
  try {
    process.env.PLAY_REFUND_REVIEW_SUBMISSION_ENABLED = "false"
    process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
    process.env.APP_ENV = "local"
    process.env.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION =
      "sandbox-refund-review-v1"
    await expect(
      caller(true).prepareRefundReviewResponse(decision),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.PLAY_REFUND_REVIEW_SUBMISSION_ENABLED = "true"
    process.env.STORE_BILLING_ENVIRONMENT = "production"
    await expect(
      caller(true).prepareRefundReviewResponse(decision),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
    process.env.APP_ENV = "production"
    await expect(
      caller(true).prepareRefundReviewResponse(decision),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.APP_ENV = "local"
    await expect(
      caller(false).prepareRefundReviewResponse(decision),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(writes).toHaveLength(0)
    const prepared = await caller(true).prepareRefundReviewResponse(decision)
    expect(prepared).toMatchObject({
      caseId: decision.caseId,
      preference: decision.preference,
      sampleContentProvided: decision.sampleContentProvided,
      policyVersion: "sandbox-refund-review-v1",
    })
    expect(writes).toHaveLength(1)
    expect(JSON.stringify(writes)).toContain("operator-1")
    expect(JSON.stringify(writes)).toContain(decision.decisionEvidenceDigest)
    expect(JSON.stringify(prepared)).not.toContain(
      decision.decisionEvidenceDigest,
    )
    expect(JSON.stringify(prepared)).not.toContain("encrypted-")
    process.env.STORE_BILLING_ENVIRONMENT = "production"
    process.env.APP_ENV = "production"
    process.env.DEV_PROFILE = "prod"
    process.env.PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED = "true"
    const productionPrepared =
      await caller(true).prepareRefundReviewResponse(decision)
    expect(productionPrepared.id).toBe("response-1")
    expect(writes).toHaveLength(2)
  } finally {
    for (const key of keys) {
      const value = original[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("Play response submission denies non-admins and production before claiming", async () => {
  const keys = [
    "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
    "STORE_BILLING_ENVIRONMENT",
    "APP_ENV",
    "PLAY_PACKAGE_NAME",
    "PLAY_REFUND_REVIEW_KEY_ID",
    "PLAY_REFUND_REVIEW_ENCRYPTION_KEY",
    "PLAY_REFUND_REVIEW_DECRYPTION_KEYS",
  ] as const
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  let transactions = 0
  const caller = (isPlatformAdmin: boolean) =>
    createCallerFactory(storeSubscriptionsRouter)({
      db: {
        $transaction: async () => {
          transactions++
          throw new Error("unexpected transaction")
        },
      },
      requestId: "request-test",
      session: {
        session: { id: "session-1", token: "operator-session" },
        user: { id: "operator-1", isPlatformAdmin },
      },
    } as never)
  try {
    process.env.PLAY_REFUND_REVIEW_SUBMISSION_ENABLED = "true"
    process.env.STORE_BILLING_ENVIRONMENT = "production"
    process.env.APP_ENV = "production"
    await expect(
      caller(false).submitRefundReviewResponse({ responseId: "response-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(true).submitRefundReviewResponse({ responseId: "response-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
    process.env.APP_ENV = "local"
    process.env.PLAY_PACKAGE_NAME = "wrong.package"
    await expect(
      caller(true).submitRefundReviewResponse({ responseId: "response-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.PLAY_PACKAGE_NAME = "com.ewatrade.app"
    process.env.PLAY_REFUND_REVIEW_KEY_ID = ""
    process.env.PLAY_REFUND_REVIEW_ENCRYPTION_KEY = ""
    await expect(
      caller(true).submitRefundReviewResponse({ responseId: "response-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    process.env.PLAY_REFUND_REVIEW_KEY_ID = "active"
    process.env.PLAY_REFUND_REVIEW_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7,
    ).toString("base64")
    process.env.PLAY_REFUND_REVIEW_DECRYPTION_KEYS = "{invalid"
    await expect(
      caller(true).submitRefundReviewResponse({ responseId: "response-1" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    expect(transactions).toBe(0)
  } finally {
    for (const key of keys) {
      const value = original[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
