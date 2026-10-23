import { createHash } from "node:crypto"
import { expect, test } from "bun:test"
import {
  WHATSAPP_WEB_REVIEW_VERSION,
  assistantReviewLink,
  assistantReviewPath,
  assistantReviewShortLocatorSchema,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import { readAssistantReviewShortSource } from "./web-review-locator"
import {
  assistantReviewShortOutboxId,
  createAssistantReviewLinkToken,
  createAssistantReviewShortLocator,
  readAssistantReviewLinkToken,
} from "./web-review-token"

const secret = "short-locator-test-key-at-least-thirty-two-bytes"
const source = {
  version: 1 as const,
  proposalId: "proposal-one",
  revision: 1,
  payloadHash: "a".repeat(64),
  bindingId: "binding-one",
  inboxId: "inbox-one",
  expiresAt: Date.parse("2026-10-21T18:00:00Z"),
}
const token = createAssistantReviewLinkToken(source, secret)
const locator = createAssistantReviewShortLocator(token, secret)
const content = renderWhatsAppWebReview({
  token,
  trustedAppOrigin: "https://dash.ewatrade.com",
  scopeLabel: "Business · Main",
})
if (!content) throw Error("Expected signed review body")
const row = {
  id: assistantReviewShortOutboxId(locator),
  inboxId: source.inboxId,
  renderKind: "web_review",
  rendererVersion: WHATSAPP_WEB_REVIEW_VERSION,
  chunkIndex: 0,
  chunkCount: 1,
  content,
  contentDigest: createHash("sha256").update(content).digest("hex"),
  expiresAt: new Date(source.expiresAt),
}

test("short review uses an opaque deterministic 128-bit handle and branded fixed route", () => {
  expect(locator).toHaveLength(24)
  expect(Buffer.from(locator.slice(2), "base64url")).toHaveLength(16)
  expect(createAssistantReviewShortLocator(token, secret)).toBe(locator)
  const revised = createAssistantReviewLinkToken(
    { ...source, revision: 2 },
    secret,
  )
  expect(createAssistantReviewShortLocator(revised, secret)).not.toBe(locator)
  expect(assistantReviewLink(locator, "https://dash.ewatrade.com")).toBe(
    `https://dash.ewatrade.com/r/${locator.slice(2)}`,
  )
  expect(assistantReviewPath(locator)).not.toContain(token)
  expect(assistantReviewPath("https://evil.example")).toBeUndefined()
  expect(
    assistantReviewShortLocatorSchema.safeParse(`r_${"A".repeat(21)}B`).success,
  ).toBe(false)
  expect(() =>
    createAssistantReviewShortLocator("invalid.invalid", secret),
  ).toThrow()
})

test("short lookup validates immutable outbox, signed source, binding and deadline before authority checks", () => {
  expect(readAssistantReviewShortSource(locator, row, secret)).toEqual(source)
  // Expiry is preserved for the existing service to reject; lookup never renews it.
  expect(readAssistantReviewShortSource(locator, row, secret)?.expiresAt).toBe(
    source.expiresAt,
  )
  for (const changed of [
    { id: "another-outbox" },
    { inboxId: "another-inbox" },
    { renderKind: "reply" },
    { rendererVersion: "other-version" },
    { chunkIndex: 1 },
    { chunkCount: 2 },
    { content: null },
    { content: `${content} tampered` },
    { contentDigest: "f".repeat(64) },
    { expiresAt: new Date(source.expiresAt + 1) },
  ])
    expect(
      readAssistantReviewShortSource(locator, { ...row, ...changed }, secret),
    ).toBeUndefined()
  expect(
    readAssistantReviewShortSource(locator, row, `${secret}-rotation`),
  ).toBeUndefined()
  expect(readAssistantReviewShortSource(locator, null, secret)).toBeUndefined()
})

test("legacy signed URLs and their original source remain valid without a short mapping", () => {
  expect(readAssistantReviewLinkToken(token, secret)).toEqual(source)
  expect(assistantReviewPath(token)).toBe(`/assistant-review?token=${token}`)
  expect(assistantReviewLink(token, "https://dash.ewatrade.com")).toContain(
    "/assistant-review?token=",
  )
})
