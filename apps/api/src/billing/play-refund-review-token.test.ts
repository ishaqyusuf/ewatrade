import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import {
  decryptPlayPendingRefundToken,
  decryptPlayRefundReviewOrderId,
  encryptPlayPendingRefundToken,
  encryptPlayRefundReviewOrderId,
} from "./play-refund-review-token"

const config = {
  PLAY_REFUND_REVIEW_KEY_ID: "review-v1",
  PLAY_REFUND_REVIEW_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}

test("encrypts the one-time token with a versioned authenticated envelope", () => {
  const encrypted = encryptPlayPendingRefundToken("pending-secret", config)
  expect(encrypted.keyId).toBe("review-v1")
  expect(encrypted.envelope).not.toContain("pending-secret")
  expect(
    decryptPlayPendingRefundToken(encrypted.envelope, encrypted.keyId, config),
  ).toBe("pending-secret")
  expect(() =>
    decryptPlayPendingRefundToken(encrypted.envelope, "other-key", config),
  ).toThrow("version")
  const altered = encrypted.envelope.split(".")
  const tag = altered[2] ?? ""
  altered[2] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`
  expect(() =>
    decryptPlayPendingRefundToken(altered.join("."), encrypted.keyId, config),
  ).toThrow()
})

test("refuses missing or malformed token-custody configuration", () => {
  expect(() => encryptPlayPendingRefundToken("pending-secret", {})).toThrow()
  expect(() =>
    encryptPlayPendingRefundToken("pending-secret", {
      ...config,
      PLAY_REFUND_REVIEW_ENCRYPTION_KEY: "short",
    }),
  ).toThrow()
})

test("encrypts the raw order separately from the pending token", () => {
  const orderId = "GPA.1234-5678-9012-34567"
  const encrypted = encryptPlayRefundReviewOrderId(orderId, config)
  expect(encrypted.envelope).not.toContain(orderId)
  expect(
    decryptPlayRefundReviewOrderId(encrypted.envelope, encrypted.keyId, config),
  ).toBe(orderId)
  expect(() =>
    decryptPlayPendingRefundToken(encrypted.envelope, encrypted.keyId, config),
  ).toThrow()
  expect(() => encryptPlayRefundReviewOrderId("", config)).toThrow()
  expect(() =>
    encryptPlayRefundReviewOrderId("x".repeat(257), config),
  ).toThrow()
})

test("rotates the active key without losing outstanding token and order custody", () => {
  const oldToken = encryptPlayPendingRefundToken("pending-old", config)
  const oldOrder = encryptPlayRefundReviewOrderId("GPA.old-order", config)
  const rotated = {
    PLAY_REFUND_REVIEW_KEY_ID: "review-v2",
    PLAY_REFUND_REVIEW_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    PLAY_REFUND_REVIEW_DECRYPTION_KEYS: JSON.stringify({
      "review-v1": config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY,
    }),
  }
  expect(
    decryptPlayPendingRefundToken(oldToken.envelope, oldToken.keyId, rotated),
  ).toBe("pending-old")
  expect(
    decryptPlayRefundReviewOrderId(oldOrder.envelope, oldOrder.keyId, rotated),
  ).toBe("GPA.old-order")
  const newToken = encryptPlayPendingRefundToken("pending-new", rotated)
  expect(newToken.keyId).toBe("review-v2")
  expect(() =>
    decryptPlayPendingRefundToken(newToken.envelope, newToken.keyId, config),
  ).toThrow("version")
  expect(() =>
    decryptPlayPendingRefundToken(oldToken.envelope, oldToken.keyId, {
      ...rotated,
      PLAY_REFUND_REVIEW_DECRYPTION_KEYS: undefined,
    }),
  ).toThrow("version")
})

test("rejects malformed or overlapping legacy keyrings", () => {
  const encrypted = encryptPlayPendingRefundToken("pending-secret", config)
  for (const ring of [
    "not-json",
    "[]",
    JSON.stringify({ "review-v1": config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY }),
    JSON.stringify({ "bad key id": config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY }),
    JSON.stringify({ "review-v0": "short" }),
    JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 17 }, (_, index) => [
          `retired-${index}`,
          config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY,
        ]),
      ),
    ),
    "x".repeat(16_385),
  ]) {
    expect(() =>
      decryptPlayPendingRefundToken(encrypted.envelope, encrypted.keyId, {
        ...config,
        PLAY_REFUND_REVIEW_DECRYPTION_KEYS: ring,
      }),
    ).toThrow()
  }
})
