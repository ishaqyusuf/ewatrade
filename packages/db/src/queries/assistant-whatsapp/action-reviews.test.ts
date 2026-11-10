import { expect, spyOn, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import {
  type WhatsAppActionReviewMaterial,
  assistantWhatsAppActionDecisionDigest,
  assistantWhatsAppActionPayloadDigest,
  assistantWhatsAppActionReviewMatchesCurrentKey,
  consumeAssistantWhatsAppActionReviewInTransaction,
  deriveAssistantWhatsAppActionReviewCode,
  whatsAppActionReviewIngressContentSchema,
} from "./action-reviews"
import * as conversations from "./conversations"
import * as execution from "./execution"

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
  } as const
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

test("canonical consume outputs its post-lock resolution only after pending/replay success", async () => {
  const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  const previousVersion = process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = key
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION = "v1"
  const resolved = {
    scope: { userId: "actor", tenantId: "tenant", storeId: "store" },
    binding: {
      id: material.bindingId,
      identityGeneration: material.identityGeneration,
      grantGeneration: material.grantGeneration,
      selectionGeneration: material.selectionGeneration,
    },
    conversation: { id: "conversation", purpose: "GENERAL" },
  } as unknown as Awaited<
    ReturnType<typeof conversations.resolveAssistantWhatsAppConversation>
  >
  const resolver = spyOn(
    conversations,
    "resolveAssistantWhatsAppConversation",
  ).mockResolvedValue(resolved)
  const authority = spyOn(
    execution,
    "assistantWhatsAppAuthorityDigest",
  ).mockResolvedValue(material.authorityDigest)
  const now = new Date("2026-10-15T16:30:00.000Z")
  const payload = { action: "customer_create", name: "Amina" }
  const body = "Complete saved customer review"
  const facts = {
    ...material,
    payloadHash: assistantWhatsAppActionPayloadDigest(payload),
    reviewDigest: createHash("sha256").update(body).digest("hex"),
  }
  const code = deriveAssistantWhatsAppActionReviewCode(facts, "confirm", key)
  const decisionDigest = assistantWhatsAppActionDecisionDigest(code, "confirm")
  const principal = {
    kind: "linked_whatsapp",
    phoneNumberId: "phone",
    senderId: "sender",
    bindingId: facts.bindingId,
    grantId: "grant",
    identityGeneration: facts.identityGeneration,
    grantGeneration: facts.grantGeneration,
    selectionGeneration: facts.selectionGeneration,
  } as const
  try {
    for (const mode of ["pending", "replay", "refusal"] as const) {
      let claimed = false
      let outputs = 0
      const review = {
        ...facts,
        id: "review",
        confirmDigest: decisionDigest,
        cancelDigest: assistantWhatsAppActionDecisionDigest(
          deriveAssistantWhatsAppActionReviewCode(facts, "cancel", key),
          "cancel",
        ),
        state: mode === "replay" ? "CONSUMED" : "PENDING",
        decision: mode === "replay" ? "confirm" : null,
        resultRef: null,
      }
      const tx = {
        $queryRaw: async () => [],
        assistantWhatsAppActionReview: {
          findFirst: async () => review,
          findUniqueOrThrow: async () => review,
          updateMany: async () => {
            claimed = true
            return { count: 1 }
          },
        },
        assistantWhatsAppInbox: {
          findFirst: async () => ({
            id: "ingress",
            content: {
              type: "action",
              decision: "confirm",
              decisionDigest,
              replyToMessageId: "wamid.review",
            },
            providerOccurredAt: now,
          }),
        },
        assistantWhatsAppOutbox: {
          findFirst: async () => ({
            renderKind: "action_review",
            inbox: { bindingId: facts.bindingId },
            sentAt: new Date("2026-10-15T16:00:00.000Z"),
            content: mode === "refusal" ? "Different content" : body,
            contentDigest: facts.reviewDigest,
          }),
        },
        assistantActionProposal: {
          findFirst: async () => ({
            id: facts.proposalId,
            action: "customer_create",
            status: "PENDING",
            expiresAt: facts.expiresAt,
            revision: facts.proposalRevision,
            payload,
            payloadHash: facts.payloadHash,
            targetRevision: facts.targetRevision,
          }),
        },
      } as unknown as Prisma.TransactionClient
      const run = () =>
        consumeAssistantWhatsAppActionReviewInTransaction(
          tx,
          {
            principal,
            decisionDigest,
            decision: "confirm",
            quotedProviderMessageId: "wamid.review",
            ingressId: "ingress",
          },
          now,
          (current) => {
            expect(Object.is(current, resolved)).toBe(true)
            if (mode === "pending") expect(claimed).toBe(true)
            outputs++
          },
        )
      if (mode === "refusal") {
        await expect(run()).rejects.toThrow()
        expect(outputs).toBe(0)
        expect(claimed).toBe(false)
      } else {
        const result = await run()
        expect(outputs).toBe(1)
        expect(result.alreadyConsumed).toBe(mode === "replay")
        expect(Object.keys(result).sort()).toEqual([
          "alreadyConsumed",
          "decision",
          "proposalId",
          "resultRef",
          "reviewId",
          "revision",
        ])
      }
    }
    expect(resolver).toHaveBeenCalledTimes(3)
  } finally {
    resolver.mockRestore()
    authority.mockRestore()
    if (previousKey === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
    if (previousVersion === undefined)
      Reflect.deleteProperty(
        process.env,
        "ASSISTANT_APPROVAL_SIGNING_KEY_VERSION",
      )
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION = previousVersion
  }
})
