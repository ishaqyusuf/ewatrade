import { expect, test } from "bun:test"
import {
  claimPlayRefundReviewResponse,
  inspectPlayRefundReviewResponseCustody,
  preparePlayRefundReviewResponse,
  recordPlayRefundReviewResponseOutcome,
} from "./play-refund-review-response"

test("response claims require an explicit nonproduction sandbox switch", async () => {
  const db = {} as never
  for (const env of [
    {},
    {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      STORE_BILLING_ENVIRONMENT: "production",
      APP_ENV: "local",
    },
    {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      STORE_BILLING_ENVIRONMENT: "sandbox",
      APP_ENV: "production",
    },
    {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      STORE_BILLING_ENVIRONMENT: "sandbox",
    },
    {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      STORE_BILLING_ENVIRONMENT: "sandbox",
      APP_ENV: "local",
    },
    {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "approved-policy-v1",
      STORE_BILLING_ENVIRONMENT: "production",
      APP_ENV: "production",
      DEV_PROFILE: "prod",
    },
  ]) {
    await expect(
      claimPlayRefundReviewResponse(db, { responseId: "response", env }),
    ).rejects.toMatchObject({ code: "SUBMISSION_DISABLED" })
  }
})

test("response intent and outcome require explicit valid values", async () => {
  const db = {} as never
  const valid = {
    caseId: "case",
    actorUserId: "actor",
    preference: "NEUTRAL" as const,
    sampleContentProvided: false,
    policyVersion: "sandbox-refund-review-v1",
    decisionEvidenceDigest: "a".repeat(64),
  }
  await expect(
    preparePlayRefundReviewResponse(db, {
      ...valid,
      preference: "IMPLICIT" as never,
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  await expect(
    preparePlayRefundReviewResponse(db, {
      ...valid,
      policyVersion: "",
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  await expect(
    preparePlayRefundReviewResponse(db, {
      ...valid,
      decisionEvidenceDigest: "not-a-digest",
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  await expect(
    recordPlayRefundReviewResponseOutcome(db, {
      responseId: "response",
      outcome: "RETRY" as never,
    }),
  ).rejects.toMatchObject({ code: "RESPONSE_CONFLICT" })
})

test("a changed response cannot consume a pre-inspected one-time claim", async () => {
  const row = {
    id: "response-1",
    status: "PREPARED",
    preference: "NEUTRAL",
    sampleContentProvided: false,
    policyVersion: "sandbox-refund-review-v1",
    decisionEvidenceDigest: "a".repeat(64),
    case: {
      tenantId: "tenant-1",
      responseDueAt: new Date("2999-01-01"),
      encryptedPendingToken: "encrypted-token",
      encryptedOrderId: "encrypted-order",
      encryptionKeyId: "key-1",
      tokenDigest: "token-digest",
      orderDigest: "order-digest",
    },
  }
  let updates = 0
  const response = {
    findUnique: async () => row,
    updateMany: async () => {
      updates++
      return { count: 1 }
    },
  }
  const db = {
    playRefundReviewResponse: response,
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ playRefundReviewResponse: response }),
  } as never
  const inspected = await inspectPlayRefundReviewResponseCustody(db, {
    responseId: "response-1",
  })
  expect(inspected.orderDigest).toBe("order-digest")
  await expect(
    claimPlayRefundReviewResponse(db, {
      responseId: "response-1",
      expected: { ...inspected, orderDigest: "changed-order" },
      env: {
        PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
        STORE_BILLING_ENVIRONMENT: "sandbox",
        APP_ENV: "local",
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    }),
  ).rejects.toMatchObject({ code: "RESPONSE_CONFLICT" })
  expect(updates).toBe(0)
  row.policyVersion = ""
  await expect(
    inspectPlayRefundReviewResponseCustody(db, { responseId: "response-1" }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  await expect(
    claimPlayRefundReviewResponse(db, {
      responseId: "response-1",
      env: {
        PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
        STORE_BILLING_ENVIRONMENT: "sandbox",
        APP_ENV: "local",
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  expect(updates).toBe(0)
})

test("a prepared response under a retired policy cannot consume its claim", async () => {
  let reads = 0
  let updates = 0
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        playRefundReviewResponse: {
          findUnique: async () => {
            reads++
            return {
              id: "response-1",
              status: "PREPARED",
              preference: "NEUTRAL",
              sampleContentProvided: false,
              policyVersion: "sandbox-refund-review-v1",
              decisionEvidenceDigest: "a".repeat(64),
              case: {
                tenantId: "tenant-1",
                responseDueAt: new Date("2999-01-01"),
                encryptedPendingToken: "encrypted-token",
                encryptedOrderId: "encrypted-order",
                encryptionKeyId: "key-1",
                tokenDigest: "token-digest",
                orderDigest: "order-digest",
              },
            }
          },
          updateMany: async () => {
            updates++
            return { count: 1 }
          },
        },
      }),
  } as never
  await expect(
    claimPlayRefundReviewResponse(db, {
      responseId: "response-1",
      env: {
        PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
        STORE_BILLING_ENVIRONMENT: "sandbox",
        APP_ENV: "local",
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "new-policy-v2",
      },
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  expect(reads).toBe(1)
  expect(updates).toBe(0)
  const claimed = await claimPlayRefundReviewResponse(db, {
    responseId: "response-1",
    env: {
      PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
      PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "true",
      STORE_BILLING_ENVIRONMENT: "production",
      APP_ENV: "production",
      DEV_PROFILE: "prod",
      PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
    },
  })
  expect(claimed.responseId).toBe("response-1")
  expect(updates).toBe(1)
})
