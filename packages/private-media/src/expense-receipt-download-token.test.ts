import { expect, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import {
  EXPENSE_RECEIPT_DOWNLOAD_PURPOSE,
  createExpenseReceiptDownloadTokenCodec,
  expenseReceiptDownloadSessionDigest,
} from "@ewatrade/private-media/expense-receipt-download-token"

const secret = "isolated-receipt-token-fixture-secret-at-least-32"

test("opaque token binds fixed purpose/version and returns only hashed nonce facts", () => {
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const issued = codec.issue()
  expect(issued.token).toMatch(/^v1\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
  expect(issued.token).toHaveLength(132)
  expect(codec.verifySignature(issued.token)).toEqual({
    nonceDigest: issued.nonceDigest,
    purpose: EXPENSE_RECEIPT_DOWNLOAD_PURPOSE,
    version: 1,
  })
  expect(issued.nonceDigest).toBe(
    createHash("sha256")
      .update(issued.token.split(".")[1] ?? "")
      .digest("hex"),
  )
  expect(issued).not.toHaveProperty("nonce")
  expect(issued).not.toHaveProperty("session")
  expect(issued.token).not.toContain("tenant")
  expect(issued.token).not.toContain("https://")
  // Repeated signature validation confers no expiry or one-use authority.
  expect(codec.verifySignature(issued.token).nonceDigest).toBe(
    issued.nonceDigest,
  )
})

test("each issue uses a new cryptographic nonce", () => {
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const first = codec.issue()
  const second = codec.issue()
  expect(first.nonceDigest).not.toBe(second.nonceDigest)
  expect(first.token).not.toBe(second.token)
})

test("tampering, wrong key and another media purpose cannot verify", () => {
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const token = codec.issue().token
  const nonce = token.split(".")[1] ?? ""
  const otherPurposeSignature = createHmac("sha256", secret)
    .update(`SERVICE_MEDIA_DOWNLOAD\nv1\n${nonce}`)
    .digest("hex")
  for (const invalid of [
    token.replace("v1.", "v2."),
    `v1.${"0".repeat(64)}.${token.split(".")[2]}`,
    `v1.${nonce}.${"0".repeat(64)}`,
    `v1.${nonce}.${otherPurposeSignature}`,
  ]) {
    expect(() => codec.verifySignature(invalid)).toThrow(
      "authorization is invalid",
    )
  }
  expect(() =>
    createExpenseReceiptDownloadTokenCodec(`${secret}-other`).verifySignature(
      token,
    ),
  ).toThrow("authorization is invalid")
})

test("malformed or oversized tokens fail before cryptographic comparison", () => {
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const token = codec.issue().token
  for (const value of [
    null,
    {},
    123,
    "",
    token.toUpperCase(),
    `${token}.extra`,
    `${token}\n`,
    token.slice(1),
    `v1.${"a".repeat(1_000_000)}`,
  ]) {
    expect(() => codec.verifySignature(value)).toThrow(
      "authorization is invalid",
    )
  }
})

test("explicit server key is required and errors reveal no key or token", () => {
  for (const invalid of [
    undefined,
    null,
    123,
    "",
    "short",
    " ".repeat(40),
    "a".repeat(1025),
    "é".repeat(40),
  ]) {
    expect(() => createExpenseReceiptDownloadTokenCodec(invalid)).toThrow(
      "not configured",
    )
  }
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const token = codec.issue().token
  try {
    codec.verifySignature(token.replace("v1", "v9"))
    throw new Error("Expected refusal")
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_DOWNLOAD_TOKEN" })
    expect(String(error)).not.toContain(secret)
    expect(String(error)).not.toContain(token)
    expect(error).not.toHaveProperty("cause")
  }
})

test("session digest uses current authenticated ID with the finance purpose", () => {
  const digest = expenseReceiptDownloadSessionDigest("session-owner-1")
  expect(digest).toMatch(/^[a-f0-9]{64}$/)
  expect(digest).toBe(
    createHash("sha256")
      .update(`${EXPENSE_RECEIPT_DOWNLOAD_PURPOSE}\nsession-owner-1`)
      .digest("hex"),
  )
  expect(digest).not.toBe(
    expenseReceiptDownloadSessionDigest("session-owner-2"),
  )
  for (const invalid of ["", " session", "session\n", "a".repeat(257)]) {
    expect(() => expenseReceiptDownloadSessionDigest(invalid)).toThrow(
      "authorization is invalid",
    )
  }
})

test("codec rejects browser execution even after server-side construction", () => {
  const codec = createExpenseReceiptDownloadTokenCodec(secret)
  const existing = Object.getOwnPropertyDescriptor(globalThis, "window")
  try {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    })
    expect(() => createExpenseReceiptDownloadTokenCodec(secret)).toThrow(
      "Private storage is unavailable",
    )
    expect(() => codec.issue()).toThrow("Private storage is unavailable")
    expect(() => codec.verifySignature("invalid")).toThrow(
      "Private storage is unavailable",
    )
    expect(() => expenseReceiptDownloadSessionDigest("session-1")).toThrow(
      "Private storage is unavailable",
    )
  } finally {
    if (existing) Object.defineProperty(globalThis, "window", existing)
    else Reflect.deleteProperty(globalThis, "window")
  }
})
