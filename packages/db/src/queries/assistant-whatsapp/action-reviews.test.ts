import { expect, test } from "bun:test"
import {
  type WhatsAppActionReviewMaterial,
  assistantWhatsAppActionDecisionDigest,
  assistantWhatsAppActionPayloadDigest,
  assistantWhatsAppActionReviewMatchesCurrentKey,
  deriveAssistantWhatsAppActionReviewCode,
  whatsAppActionReviewIngressContentSchema,
} from "./action-reviews"

const key = "synthetic-test-signing-key-of-at-least-32-bytes"
const material = {
  bindingId: "binding-one",
  proposalId: "proposal-one",
  proposalRevision: 2,
  payloadHash: "a".repeat(64),
  targetRevision: "target-revision",
  reviewDigest: "b".repeat(64),
  authorityDigest: "c".repeat(64),
  identityGeneration: 3,
  grantGeneration: 4,
  selectionGeneration: 5,
  reviewOutboxId: "outbox-one",
  nonce: "4e209cb7-f194-468e-b136-cced635b5ac0",
  keyVersion: "v1",
  expiresAt: new Date("2026-10-15T17:00:00.000Z"),
} satisfies WhatsAppActionReviewMaterial

test("pending General proofs require the current secret and version, including both decision digests", () => {
  const savedFor = (
    proof: WhatsAppActionReviewMaterial,
    signingKey: string,
  ) => ({
    confirmDigest: assistantWhatsAppActionDecisionDigest(
      deriveAssistantWhatsAppActionReviewCode(proof, "confirm", signingKey),
      "confirm",
    ),
    cancelDigest: assistantWhatsAppActionDecisionDigest(
      deriveAssistantWhatsAppActionReviewCode(proof, "cancel", signingKey),
      "cancel",
    ),
  })
  const saved = savedFor(material, key)
  const current = { ASSISTANT_APPROVAL_SIGNING_KEY: key }
  expect(
    assistantWhatsAppActionReviewMatchesCurrentKey(material, saved, current),
  ).toBe(true)
  for (const env of [
    { ...current, ASSISTANT_APPROVAL_SIGNING_KEY: `${key}-rotated` },
    { ...current, ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v2" },
    { ...current, ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "" },
    { ASSISTANT_APPROVAL_SIGNING_KEY: "short" },
    {},
  ])
    expect(
      assistantWhatsAppActionReviewMatchesCurrentKey(material, saved, env),
    ).toBe(false)
  for (const corrupted of [
    { ...saved, confirmDigest: "0".repeat(64) },
    { ...saved, cancelDigest: "0".repeat(64) },
    { ...saved, cancelDigest: "bad" },
  ])
    expect(
      assistantWhatsAppActionReviewMatchesCurrentKey(
        material,
        corrupted,
        current,
      ),
    ).toBe(false)
  const rotated = { ...material, keyVersion: "v2" }
  const rotatedKey = `${key}-rotated`
  expect(
    assistantWhatsAppActionReviewMatchesCurrentKey(
      rotated,
      savedFor(rotated, rotatedKey),
      {
        ASSISTANT_APPROVAL_SIGNING_KEY: rotatedKey,
        ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v2",
      },
    ),
  ).toBe(true)
  expect(
    assistantWhatsAppActionReviewMatchesCurrentKey(
      { ...material, nonce: "bad" },
      saved,
      current,
    ),
  ).toBe(false)
})

test("decision proofs are deterministic full HMAC256 codes with domain-separated digest-only persistence", () => {
  const confirm = deriveAssistantWhatsAppActionReviewCode(
    material,
    "confirm",
    key,
  )
  const cancel = deriveAssistantWhatsAppActionReviewCode(
    material,
    "cancel",
    key,
  )
  expect(confirm).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(cancel).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(confirm).not.toBe(cancel)
  expect(
    deriveAssistantWhatsAppActionReviewCode({ ...material }, "confirm", key),
  ).toBe(confirm)
  const saved = {
    ...material,
    confirmDigest: assistantWhatsAppActionDecisionDigest(confirm, "confirm"),
    cancelDigest: assistantWhatsAppActionDecisionDigest(cancel, "cancel"),
  }
  expect(saved.confirmDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(saved.cancelDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(saved)).not.toContain(confirm)
  expect(JSON.stringify(saved)).not.toContain(cancel)
  expect(assistantWhatsAppActionDecisionDigest(confirm, "cancel")).not.toBe(
    saved.confirmDigest,
  )
  expect(assistantWhatsAppActionDecisionDigest(cancel, "confirm")).not.toBe(
    saved.cancelDigest,
  )
})

test("all immutable scope, proposal, review-body, key-version and expiry fields bind the proof", () => {
  const baseline = deriveAssistantWhatsAppActionReviewCode(
    material,
    "confirm",
    key,
  )
  const changes = [
    { bindingId: "other-binding" },
    { proposalId: "other-proposal" },
    { proposalRevision: 3 },
    { payloadHash: "d".repeat(64) },
    { targetRevision: "other-target" },
    { targetRevision: null },
    { reviewDigest: "d".repeat(64) },
    { authorityDigest: "d".repeat(64) },
    { identityGeneration: 4 },
    { grantGeneration: 5 },
    { selectionGeneration: 6 },
    { reviewOutboxId: "other-outbox" },
    { nonce: "8d77ff16-172b-46af-8eb8-b637b9437f5d" },
    { keyVersion: "v2" },
    { expiresAt: new Date(material.expiresAt.getTime() + 1) },
  ] satisfies Partial<WhatsAppActionReviewMaterial>[]
  for (const change of changes)
    expect(
      deriveAssistantWhatsAppActionReviewCode(
        { ...material, ...change },
        "confirm",
        key,
      ),
    ).not.toBe(baseline)
  expect(
    deriveAssistantWhatsAppActionReviewCode(
      material,
      "confirm",
      `${key}-rotated`,
    ),
  ).not.toBe(baseline)
})

test("malformed security material and truncated codes fail closed", () => {
  expect(() =>
    deriveAssistantWhatsAppActionReviewCode(material, "confirm", "short-key"),
  ).toThrow("signing key unavailable")
  for (const code of [
    "",
    "a".repeat(42),
    "a".repeat(44),
    `${"a".repeat(42)}+`,
    `${"a".repeat(42)}=`,
  ])
    expect(() =>
      assistantWhatsAppActionDecisionDigest(code, "confirm"),
    ).toThrow()
  for (const change of [
    { proposalRevision: 0 },
    { identityGeneration: -1 },
    { nonce: "not-uuid" },
    { keyVersion: "v1/key" },
    { payloadHash: "not-sha256" },
    { expiresAt: new Date("invalid") },
  ])
    expect(() =>
      deriveAssistantWhatsAppActionReviewCode(
        { ...material, ...change },
        "confirm",
        key,
      ),
    ).toThrow()
})

test("payload digest follows canonical proposal JSON semantics without rounding or JSONB key-order dependence", () => {
  expect(
    assistantWhatsAppActionPayloadDigest({
      amount: "9007199254740993",
      nested: { b: 2, a: 1 },
    }),
  ).toBe(
    assistantWhatsAppActionPayloadDigest({
      nested: { a: 1, b: 2 },
      amount: "9007199254740993",
    }),
  )
  expect(
    assistantWhatsAppActionPayloadDigest({ optional: undefined, keep: null }),
  ).toBe(assistantWhatsAppActionPayloadDigest({ keep: null }))
  expect(assistantWhatsAppActionPayloadDigest(["1", "2"])).not.toBe(
    assistantWhatsAppActionPayloadDigest(["2", "1"]),
  )
  expect(
    assistantWhatsAppActionPayloadDigest({ amount: "9007199254740993" }),
  ).not.toBe(
    assistantWhatsAppActionPayloadDigest({ amount: "9007199254740992" }),
  )
})

test("verified queued action retains digest and quoted review only, never raw codes or caller authority", () => {
  const code = deriveAssistantWhatsAppActionReviewCode(material, "confirm", key)
  const content = {
    type: "action",
    decision: "confirm",
    decisionDigest: assistantWhatsAppActionDecisionDigest(code, "confirm"),
    replyToMessageId: "accepted-provider-review",
  }
  expect(whatsAppActionReviewIngressContentSchema.parse(content)).toEqual(
    content,
  )
  expect(JSON.stringify(content)).not.toContain(code)
  for (const extra of [
    { code },
    { actorUserId: "other" },
    { grantId: "other" },
    { replyToMessageId: "" },
    { decision: "proceed" },
    { decisionDigest: code },
  ])
    expect(
      whatsAppActionReviewIngressContentSchema.safeParse({
        ...content,
        ...extra,
      }).success,
    ).toBe(false)
})
