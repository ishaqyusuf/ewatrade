import { expect, test } from "bun:test"
import type { WhatsAppWorkflowActionSource } from "@ewatrade/assistant/channels/workflow-action-review"
import { assistantWhatsAppActionDecisionDigest } from "./action-reviews"
import {
  type WhatsAppWorkflowReviewMaterial,
  assistantWhatsAppWorkflowDecisionDigest,
  assistantWhatsAppWorkflowReviewMatchesCurrentKey,
  assistantWhatsAppWorkflowSourceDigest,
  assistantWhatsAppWorkflowWritesEnabled,
  deriveAssistantWhatsAppWorkflowReviewCode,
  whatsAppWorkflowActionIngressContentSchema,
  whatsAppWorkflowActionResultSchema,
} from "./workflow-action-reviews"

const signingKey = "synthetic-workflow-test-key-of-at-least-32-bytes"
const source: WhatsAppWorkflowActionSource = {
  version: "workflow-action-v1",
  purpose: "SETUP",
  conversationId: "conversation",
  draftId: "draft",
  origin: { tenantId: "tenant", storeId: "store" },
  draftRevision: 7,
  workflowContextHash: null,
  selection: [
    {
      entityId: "entity",
      key: "customer:amina",
      state: "PROPOSED",
      payloadHash: "a".repeat(64),
      commandHash: "b".repeat(64),
    },
  ],
}
const material: WhatsAppWorkflowReviewMaterial = {
  bindingId: "binding",
  purpose: "SETUP",
  conversationId: "conversation",
  draftId: "draft",
  draftRevision: 7,
  sourceDigest: assistantWhatsAppWorkflowSourceDigest(source),
  reviewDigest: "c".repeat(64),
  authorityDigest: "d".repeat(64),
  identityGeneration: 2,
  grantGeneration: 3,
  selectionGeneration: 4,
  reviewOutboxId: "outbox",
  nonce: "a70a0ce0-d730-4246-b7d2-ae52cdfbe833",
  keyVersion: "v1",
  expiresAt: new Date("2026-10-15T12:05:00.000Z"),
}

test("pending Setup and Product proofs require the current secret and version for both decisions", () => {
  const savedFor = (proof: WhatsAppWorkflowReviewMaterial, key: string) => ({
    confirmDigest: assistantWhatsAppWorkflowDecisionDigest(
      deriveAssistantWhatsAppWorkflowReviewCode(proof, "confirm", key),
      "confirm",
      proof.purpose,
    ),
    cancelDigest: assistantWhatsAppWorkflowDecisionDigest(
      deriveAssistantWhatsAppWorkflowReviewCode(proof, "cancel", key),
      "cancel",
      proof.purpose,
    ),
  })
  for (const purpose of ["SETUP", "PRODUCT_CREATE"] as const) {
    const proof = { ...material, purpose }
    const saved = savedFor(proof, signingKey)
    const current = { ASSISTANT_APPROVAL_SIGNING_KEY: signingKey }
    expect(
      assistantWhatsAppWorkflowReviewMatchesCurrentKey(proof, saved, current),
    ).toBe(true)
    for (const env of [
      { ...current, ASSISTANT_APPROVAL_SIGNING_KEY: `${signingKey}-rotated` },
      { ...current, ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v2" },
      { ...current, ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "" },
      { ASSISTANT_APPROVAL_SIGNING_KEY: "short" },
      {},
    ])
      expect(
        assistantWhatsAppWorkflowReviewMatchesCurrentKey(proof, saved, env),
      ).toBe(false)
    for (const corrupted of [
      { ...saved, confirmDigest: "0".repeat(64) },
      { ...saved, cancelDigest: "0".repeat(64) },
      { ...saved, confirmDigest: "bad" },
    ])
      expect(
        assistantWhatsAppWorkflowReviewMatchesCurrentKey(
          proof,
          corrupted,
          current,
        ),
      ).toBe(false)
    const rotated = { ...proof, keyVersion: "v2" }
    const rotatedKey = `${signingKey}-rotated`
    expect(
      assistantWhatsAppWorkflowReviewMatchesCurrentKey(
        rotated,
        savedFor(rotated, rotatedKey),
        {
          ASSISTANT_APPROVAL_SIGNING_KEY: rotatedKey,
          ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v2",
        },
      ),
    ).toBe(true)
    expect(
      assistantWhatsAppWorkflowReviewMatchesCurrentKey(
        { ...proof, nonce: "bad" },
        saved,
        current,
      ),
    ).toBe(false)
  }
})

test("workflow proofs are deterministic full HMAC256 codes with separate mode/decision/general domains", () => {
  const confirm = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "confirm",
    signingKey,
  )
  const cancel = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "cancel",
    signingKey,
  )
  expect(confirm).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(cancel).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(confirm).not.toBe(cancel)
  expect(
    deriveAssistantWhatsAppWorkflowReviewCode(
      { ...material },
      "confirm",
      signingKey,
    ),
  ).toBe(confirm)
  const saved = {
    ...material,
    confirmDigest: assistantWhatsAppWorkflowDecisionDigest(
      confirm,
      "confirm",
      "SETUP",
    ),
    cancelDigest: assistantWhatsAppWorkflowDecisionDigest(
      cancel,
      "cancel",
      "SETUP",
    ),
  }
  expect(JSON.stringify(saved)).not.toContain(confirm)
  expect(JSON.stringify(saved)).not.toContain(cancel)
  expect(
    assistantWhatsAppWorkflowDecisionDigest(confirm, "cancel", "SETUP"),
  ).not.toBe(saved.confirmDigest)
  expect(
    assistantWhatsAppWorkflowDecisionDigest(
      confirm,
      "confirm",
      "PRODUCT_CREATE",
    ),
  ).not.toBe(saved.confirmDigest)
  expect(assistantWhatsAppActionDecisionDigest(confirm, "confirm")).not.toBe(
    saved.confirmDigest,
  )
})

test("all durable workflow/source/binding/review/key/expiry material changes decision proof", () => {
  const baseline = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "confirm",
    signingKey,
  )
  const changes: Partial<WhatsAppWorkflowReviewMaterial>[] = [
    { bindingId: "other" },
    { purpose: "PRODUCT_CREATE" },
    { conversationId: "other" },
    { draftId: "other" },
    { draftRevision: 8 },
    { sourceDigest: "e".repeat(64) },
    { reviewDigest: "e".repeat(64) },
    { authorityDigest: "e".repeat(64) },
    { identityGeneration: 3 },
    { grantGeneration: 4 },
    { selectionGeneration: 5 },
    { reviewOutboxId: "other" },
    { nonce: "75eab20c-dbd6-42bf-8d02-ea4c97074249" },
    { keyVersion: "v2" },
    { expiresAt: new Date(material.expiresAt.getTime() + 1) },
  ]
  for (const change of changes)
    expect(
      deriveAssistantWhatsAppWorkflowReviewCode(
        { ...material, ...change },
        "confirm",
        signingKey,
      ),
    ).not.toBe(baseline)
  expect(
    deriveAssistantWhatsAppWorkflowReviewCode(
      material,
      "confirm",
      `${signingKey}-rotated`,
    ),
  ).not.toBe(baseline)
  for (const change of [
    { draftRevision: -1 },
    { identityGeneration: 0 },
    { sourceDigest: "bad" },
    { nonce: "bad" },
    { keyVersion: "v1/key" },
    { expiresAt: new Date("invalid") },
  ])
    expect(() =>
      deriveAssistantWhatsAppWorkflowReviewCode(
        { ...material, ...change },
        "confirm",
        signingKey,
      ),
    ).toThrow()
  expect(() =>
    deriveAssistantWhatsAppWorkflowReviewCode(material, "confirm", "short"),
  ).toThrow("signing key unavailable")
})

test("canonical source hashes bind order, payload/command hashes, state, original scope and product form graph", () => {
  const baseline = assistantWhatsAppWorkflowSourceDigest(source)
  expect(
    assistantWhatsAppWorkflowSourceDigest({
      selection: source.selection,
      workflowContextHash: null,
      purpose: "SETUP",
      draftRevision: 7,
      draftId: "draft",
      conversationId: "conversation",
      version: "workflow-action-v1",
      origin: { storeId: "store", tenantId: "tenant" },
    }),
  ).toBe(baseline)
  const selected = source.selection[0]
  if (!selected) throw Error("Source fixture missing")
  for (const patch of [
    { payloadHash: "f".repeat(64) },
    { commandHash: "f".repeat(64) },
    { state: "CONFIRMED" as const },
    { key: "customer:other" },
    { entityId: "other" },
  ])
    expect(
      assistantWhatsAppWorkflowSourceDigest({
        ...source,
        selection: [{ ...selected, ...patch }],
      }),
    ).not.toBe(baseline)
  expect(
    assistantWhatsAppWorkflowSourceDigest({
      ...source,
      origin: { ...source.origin, storeId: "other" },
    }),
  ).not.toBe(baseline)
  const a = { ...selected, entityId: "a", key: "a" }
  const b = { ...selected, entityId: "b", key: "b" }
  expect(
    assistantWhatsAppWorkflowSourceDigest({ ...source, selection: [a, b] }),
  ).not.toBe(
    assistantWhatsAppWorkflowSourceDigest({ ...source, selection: [b, a] }),
  )
})

test("native workflow writes need independent explicit local flags and ordinary writes", () => {
  const env = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_SETUP_ENABLED: "true",
    ASSISTANT_WHATSAPP_PRODUCT_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "true",
  }
  expect(assistantWhatsAppWorkflowWritesEnabled("SETUP", env)).toBe(true)
  expect(assistantWhatsAppWorkflowWritesEnabled("PRODUCT_CREATE", env)).toBe(
    true,
  )
  for (const changed of [
    {},
    { ...env, ASSISTANT_WHATSAPP_WRITES_ENABLED: "false" },
    { ...env, ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "false" },
    { ...env, ASSISTANT_WHATSAPP_SETUP_ENABLED: "false" },
    { ...env, NODE_ENV: "production" },
    { ...env, APP_ENV: "production" },
  ])
    expect(assistantWhatsAppWorkflowWritesEnabled("SETUP", changed)).toBe(false)
  expect(assistantWhatsAppWorkflowWritesEnabled("GENERAL", env)).toBe(false)
})

test("queued workflow action and safe receipt schemas never persist caller actor authority or raw codes", () => {
  const confirm = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "confirm",
    signingKey,
  )
  const content = {
    type: "workflow_action",
    purpose: "SETUP",
    decision: "confirm",
    decisionDigest: assistantWhatsAppWorkflowDecisionDigest(
      confirm,
      "confirm",
      "SETUP",
    ),
    replyToMessageId: "accepted-review-provider-message",
  }
  expect(whatsAppWorkflowActionIngressContentSchema.parse(content)).toEqual(
    content,
  )
  expect(JSON.stringify(content)).not.toContain(confirm)
  for (const patch of [
    { code: confirm },
    { actorUserId: "other" },
    { source },
    { purpose: "GENERAL" },
    { decision: "yes" },
    { decisionDigest: confirm },
    { replyToMessageId: "" },
  ])
    expect(
      whatsAppWorkflowActionIngressContentSchema.safeParse({
        ...content,
        ...patch,
      }).success,
    ).toBe(false)
  const result = {
    version: "workflow-result-v1",
    purpose: "SETUP",
    conversationId: "conversation",
    draftId: "draft",
    results: [
      {
        entityId: "entity",
        key: "customer:amina",
        state: "COMMITTED",
        recordId: "saved-customer",
      },
    ],
  }
  expect(whatsAppWorkflowActionResultSchema.parse(result)).toEqual(result)
  expect(
    whatsAppWorkflowActionResultSchema.safeParse({
      ...result,
      approvalToken: "forbidden",
    }).success,
  ).toBe(false)
  expect(
    whatsAppWorkflowActionResultSchema.safeParse({ ...result, results: [] })
      .success,
  ).toBe(false)
})
