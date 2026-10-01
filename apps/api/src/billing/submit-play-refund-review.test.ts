import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { storeOrderDigest } from "@ewatrade/db/queries"
import { submitPlayRefundReviewResponse } from "./submit-play-refund-review"

const pendingRefundToken = "pending-token"
const orderId = "GPA.1234-5678"
const claim = {
  responseId: "response-1",
  policyVersion: "sandbox-refund-review-v1",
  preference: "NEUTRAL",
  sampleContentProvided: false,
  encryptedPendingToken: "encrypted-token",
  encryptedOrderId: "encrypted-order",
  encryptionKeyId: "key-1",
  tokenDigest: createHash("sha256")
    .update(`play-pending-refund:${pendingRefundToken}`)
    .digest("hex"),
  orderDigest: storeOrderDigest(orderId),
}

function fixture(
  input: {
    inspected?: typeof claim
    claimed?: typeof claim
    decryptToken?: () => string
    authorize?: () => Promise<string>
    send?: () => Promise<"CONFIRMED" | "UNCERTAIN">
  } = {},
) {
  const events: string[] = []
  const recorded: string[] = []
  const sent: unknown[] = []
  const dependencies = {
    preflight: () => {
      events.push("preflight")
    },
    inspect: async () => {
      events.push("inspect")
      return (input.inspected ?? claim) as never
    },
    claim: async () => {
      events.push("claim")
      return (input.claimed ?? claim) as never
    },
    decryptToken: () => {
      events.push("decrypt-token")
      return input.decryptToken?.() ?? pendingRefundToken
    },
    decryptOrder: () => {
      events.push("decrypt-order")
      return orderId
    },
    authorize: async () => {
      events.push("authorize")
      return input.authorize?.() ?? "access-token"
    },
    send: async (request: unknown, _env: unknown, accessToken: string) => {
      events.push("send")
      sent.push({ request, accessToken })
      return input.send?.() ?? "CONFIRMED"
    },
    record: async (_db: unknown, _responseId: string, outcome: string) => {
      events.push("record")
      recorded.push(outcome)
    },
  }
  return { dependencies, events, recorded, sent }
}

test("claims once, checks custody and records one confirmed provider response", async () => {
  const { dependencies, events, recorded, sent } = fixture()
  const result = await submitPlayRefundReviewResponse(
    {} as never,
    "response-1",
    {
      env: {
        APP_ENV: "local",
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
      dependencies,
    },
  )
  expect(result).toEqual({ status: "CONFIRMED" })
  expect(events).toEqual([
    "preflight",
    "inspect",
    "decrypt-token",
    "decrypt-order",
    "authorize",
    "claim",
    "decrypt-token",
    "decrypt-order",
    "send",
    "record",
  ])
  expect(recorded).toEqual(["CONFIRMED"])
  expect(sent).toEqual([
    {
      accessToken: "access-token",
      request: {
        orderId,
        pendingRefundToken,
        preference: "NEUTRAL",
        sampleContentProvided: false,
      },
    },
  ])
})

test("mismatched custody fails before the one-time claim", async () => {
  const { dependencies, events, recorded } = fixture({
    inspected: { ...claim, orderDigest: "different-order" },
  })
  await expect(
    submitPlayRefundReviewResponse({} as never, "response-1", {
      dependencies,
      env: {
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  expect(events).not.toContain("claim")
  expect(events).not.toContain("send")
  expect(recorded).toEqual([])
})

test("an unavailable older case key fails before the one-time claim", async () => {
  const { dependencies, events, recorded } = fixture({
    decryptToken: () => {
      throw new Error("key version unavailable")
    },
  })
  await expect(
    submitPlayRefundReviewResponse({} as never, "response-1", {
      dependencies,
      env: {
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  expect(events).not.toContain("claim")
  expect(recorded).toEqual([])
})

test("missing publisher access fails before the one-time claim", async () => {
  const { dependencies, events, recorded } = fixture({
    authorize: async () => {
      throw new Error("credential provider unavailable")
    },
  })
  await expect(
    submitPlayRefundReviewResponse({} as never, "response-1", {
      dependencies,
      env: {
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    }),
  ).rejects.toMatchObject({ code: "SUBMISSION_DISABLED" })
  expect(events).toContain("authorize")
  expect(events).not.toContain("claim")
  expect(recorded).toEqual([])
})

test("a failure after claim is recorded uncertain without retry", async () => {
  const { dependencies, events, recorded } = fixture({
    send: async () => {
      throw new Error(`provider echoed ${pendingRefundToken}`)
    },
  })
  const result = await submitPlayRefundReviewResponse(
    {} as never,
    "response-1",
    {
      dependencies,
      env: {
        PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "sandbox-refund-review-v1",
      },
    },
  )
  expect(result).toEqual({ status: "UNCERTAIN" })
  expect(events.filter((event) => event === "send")).toHaveLength(1)
  expect(recorded).toEqual(["UNCERTAIN"])
})

test("a prepared response with a retired policy never requests publisher access or consumes a claim", async () => {
  const { dependencies, events, recorded } = fixture()
  await expect(
    submitPlayRefundReviewResponse({} as never, "response-1", {
      env: { PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "new-policy-v2" },
      dependencies,
    }),
  ).rejects.toMatchObject({ code: "CASE_NOT_READY" })
  expect(events).toEqual(["preflight", "inspect"])
  expect(recorded).toEqual([])
})
