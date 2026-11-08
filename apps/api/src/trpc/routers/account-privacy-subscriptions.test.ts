import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { accountPrivacyRouter } from "./account-privacy"

test("billing privacy operations deny ordinary owners before database access and refuse activation/client policy injection", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED
  process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED = "false"
  const caller = (isPlatformAdmin: boolean) =>
    createCallerFactory(accountPrivacyRouter)({
      db: {
        $transaction: () => {
          throw new Error("Database must not be touched")
        },
      },
      session: {
        session: { id: "session", token: "synthetic" },
        user: { id: "operator", isPlatformAdmin },
      },
    } as never)
  const input = {
    requestId: "request",
    expectedInventoryDigest: "a".repeat(64),
    policyDigest: "b".repeat(64),
    controllerEvidenceDigest: "c".repeat(64),
    minimumNecessaryReviewed: true as const,
    controllerAuthorityReviewed: true as const,
    shorterPoliciesAndHoldsReviewed: true as const,
    storeCancellationIsSeparate: true as const,
    decisions: [
      {
        family: "OWNER_ACCOUNT" as const,
        purpose: "RECEIPT_ANTI_REPLAY" as const,
        necessityEvidenceDigest: "d".repeat(64),
        basisEvidenceDigest: "e".repeat(64),
        nextReviewAt: "2027-01-01T00:00:00Z",
        basis: { kind: "EXPIRY" as const, expiresAt: "2027-02-01T00:00:00Z" },
      },
    ],
  }
  try {
    await expect(
      caller(false).inspectSubscriptions({ requestId: "request" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(false).reviewSubscriptions(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(false).minimizeSubscriptionLinks({
        requestId: "request",
        expectedInventoryDigest: input.expectedInventoryDigest,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(false).subscriptionRetentionReviews({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      caller(false).inspectSubscriptionRetention({ reviewId: "review" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    const { requestId: _, ...review } = input
    await expect(
      caller(false).reassessSubscriptions({ ...review, reviewId: "review" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(caller(true).reviewSubscriptions(input)).rejects.toMatchObject(
      { code: "PRECONDITION_FAILED", message: "DISABLED" },
    )
    await expect(
      caller(true).minimizeSubscriptionLinks({
        requestId: "request",
        expectedInventoryDigest: input.expectedInventoryDigest,
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "DISABLED",
    })
    await expect(
      caller(true).reviewSubscriptions({
        ...input,
        operatorUserId: "subject",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller(true).reviewSubscriptions({ ...input, policy: "erase" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(
        process.env,
        "ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED",
      )
    else process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED = previous
  }
})
