import { expect, test } from "bun:test"
import {
  APIError,
  APIException,
  NotificationTypeV2,
  Status,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library"
import {
  type AppleBillingRuntime,
  verifyAppleNotification,
  verifyAppleSubscription,
} from "./apple-subscriptions"

const ownerId = "review-owner-123"
const config = {
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  STORE_BILLING_ENVIRONMENT: "production",
  STORE_BILLING_ENABLED: "true",
  OWNER_BILLING_ENABLED: "true",
  APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
  APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId]),
}
const purchase = {
  originalTransactionId: "original-transaction",
  transactionId: "transaction",
  appAccountToken: "owner-token",
  productId: "com.ewatrade.owner.starter.monthly",
  purchaseDate: Date.parse("2026-11-01"),
  expiresDate: Date.parse("2026-12-01"),
}

function fixture(
  options: {
    lookupError?: Error
    notificationError?: Error
    sandboxError?: Error
  } = {},
) {
  const calls: string[] = []
  const createRuntime = (
    override?: "production" | "sandbox",
  ): AppleBillingRuntime => {
    const environment = override ?? "production"
    calls.push(`runtime:${environment}`)
    return {
      environment,
      client: {
        async getTransactionInfo(id) {
          calls.push(`lookup:${environment}:${id}`)
          if (environment === "production" && options.lookupError)
            throw options.lookupError
          return { signedTransactionInfo: "initial" }
        },
        async getAllSubscriptionStatuses() {
          calls.push(`status:${environment}`)
          return {
            data: [
              {
                lastTransactions: [
                  {
                    originalTransactionId: purchase.originalTransactionId,
                    status: Status.ACTIVE,
                    signedTransactionInfo: "current",
                    signedRenewalInfo: "renewal",
                  },
                ],
              },
            ],
          }
        },
      },
      verifier: {
        async verifyAndDecodeTransaction(value) {
          calls.push(`transaction:${environment}:${value}`)
          if (environment === "sandbox" && options.sandboxError)
            throw options.sandboxError
          return purchase
        },
        async verifyAndDecodeRenewalInfo() {
          return {
            originalTransactionId: purchase.originalTransactionId,
            autoRenewStatus: 1,
          }
        },
        async verifyAndDecodeNotification(value) {
          calls.push(`notification:${environment}:${value}`)
          if (environment === "production" && options.notificationError)
            throw options.notificationError
          if (environment === "sandbox" && options.sandboxError)
            throw options.sandboxError
          return {
            notificationType: NotificationTypeV2.DID_RENEW,
            data: { signedTransactionInfo: "nested" },
          }
        },
      },
    }
  }
  return { calls, createRuntime }
}

test("approved review lookup retries only Apple's transaction-not-found signal and retains Sandbox facts", async () => {
  const { calls, createRuntime } = fixture({
    lookupError: new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND),
  })
  const result = await verifyAppleSubscription(
    "transaction",
    true,
    createRuntime,
  )
  expect(result.environment).toBe("sandbox")
  expect(result.accountToken).toBe(purchase.appAccountToken)
  expect(result.purchaseId).toBe(purchase.originalTransactionId)
  expect(calls).toEqual([
    "runtime:production",
    "lookup:production:transaction",
    "runtime:sandbox",
    "lookup:sandbox:transaction",
    "transaction:sandbox:initial",
    "status:sandbox",
    "transaction:sandbox:current",
  ])
})

test("ordinary users and authorization, outage or ambiguous not-found errors cannot fall back", async () => {
  for (const [allow, error] of [
    [false, new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND)],
    [true, new APIException(401)],
    [true, new APIException(503)],
    [true, new APIException(404, APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND)],
    [true, new Error("4040010")],
  ] as const) {
    const f = fixture({ lookupError: error })
    await expect(
      verifyAppleSubscription("transaction", allow, f.createRuntime),
    ).rejects.toThrow()
    expect(f.calls).toEqual([
      "runtime:production",
      "lookup:production:transaction",
    ])
  }
  const good = fixture()
  expect(
    (await verifyAppleSubscription("transaction", true, good.createRuntime))
      .environment,
  ).toBe("production")
  expect(good.calls).not.toContain("runtime:sandbox")
})

test("a Sandbox lookup still requires a fresh transaction signature verification", async () => {
  const f = fixture({
    lookupError: new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND),
    sandboxError: new VerificationException(
      VerificationStatus.INVALID_CERTIFICATE,
    ),
  })
  await expect(
    verifyAppleSubscription("transaction", true, f.createRuntime),
  ).rejects.toThrow()
  expect(f.calls).not.toContain("status:sandbox")
})

test("notification fallback verifies the envelope and nested transaction again in Sandbox", async () => {
  const f = fixture({
    notificationError: new VerificationException(
      VerificationStatus.INVALID_ENVIRONMENT,
    ),
  })
  const result = await verifyAppleNotification(
    "signed-envelope",
    f.createRuntime,
    config,
  )
  expect(result.environment).toBe("sandbox")
  expect(result.transaction?.appAccountToken).toBe(purchase.appAccountToken)
  expect(f.calls).toEqual([
    "runtime:production",
    "notification:production:signed-envelope",
    "runtime:sandbox",
    "notification:sandbox:signed-envelope",
    "transaction:sandbox:nested",
  ])
  const disabled = fixture({
    notificationError: new VerificationException(
      VerificationStatus.INVALID_ENVIRONMENT,
    ),
  })
  await expect(
    verifyAppleNotification("signed-envelope", disabled.createRuntime, {}),
  ).rejects.toThrow()
  expect(disabled.calls).not.toContain("runtime:sandbox")
})

test("signature or app identity failures never trigger notification fallback or grants", async () => {
  for (const status of [
    VerificationStatus.INVALID_CERTIFICATE,
    VerificationStatus.INVALID_APP_IDENTIFIER,
    VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
  ]) {
    const f = fixture({ notificationError: new VerificationException(status) })
    await expect(
      verifyAppleNotification("signed-envelope", f.createRuntime, config),
    ).rejects.toThrow()
    expect(f.calls).not.toContain("runtime:sandbox")
  }
  const f = fixture({
    notificationError: new VerificationException(
      VerificationStatus.INVALID_ENVIRONMENT,
    ),
    sandboxError: new VerificationException(
      VerificationStatus.INVALID_CERTIFICATE,
    ),
  })
  await expect(
    verifyAppleNotification("signed-envelope", f.createRuntime, config),
  ).rejects.toThrow()
  expect(f.calls).not.toContain("transaction:sandbox:nested")
})
