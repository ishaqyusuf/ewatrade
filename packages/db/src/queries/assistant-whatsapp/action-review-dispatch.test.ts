import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Capability } from "@ewatrade/assistant/capabilities/types"
import { z } from "zod"
import {
  type WhatsAppActionReviewMaterial,
  assistantWhatsAppActionDecisionDigest,
  assistantWhatsAppActionPayloadDigest,
  deriveAssistantWhatsAppActionReviewCode,
} from "./action-reviews"
import {
  assistantWhatsAppActionReviewDispatch,
  assistantWhatsAppActionReviewDispatchBody,
} from "./delivery"

const now = new Date("2026-10-15T15:00:00.000Z")
const expiresAt = new Date(now.getTime() + 300_000)
const body =
  "Record customer\n\nBusiness: Example\n\nStore: Main\n\nName: Amina\n\nThis records a customer only."
const payload = { action: "customer_create", name: "Amina" }
const payloadHash = assistantWhatsAppActionPayloadDigest(payload)
const authorityDigest = "c".repeat(64)
const input: Parameters<typeof assistantWhatsAppActionReviewDispatchBody>[0] = {
  body,
  authorityDigest,
  role: "OWNER",
  binding: {
    id: "binding",
    identityGeneration: 1,
    grantGeneration: 2,
    selectionGeneration: 3,
  },
  proposal: {
    id: "proposal",
    revision: 4,
    action: "customer_create",
    payload,
    payloadHash,
    targetRevision: "target",
    status: "PENDING",
    expiresAt,
  },
  review: {
    id: "review",
    bindingId: "binding",
    proposalId: "proposal",
    proposalRevision: 4,
    payloadHash,
    targetRevision: "target",
    reviewDigest: createHash("sha256").update(body).digest("hex"),
    authorityDigest,
    identityGeneration: 1,
    grantGeneration: 2,
    selectionGeneration: 3,
    nonce: "4e209cb7-f194-468e-b136-cced635b5ac0",
    keyVersion: "v1",
    confirmDigest: "a".repeat(64),
    cancelDigest: "b".repeat(64),
    reviewOutboxId: "outbox",
    expiresAt,
    state: "PENDING",
    consumedByIngressId: null,
    decision: null,
    resultRef: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  },
}
const environment = {
  APP_ENV: "local",
  NODE_ENV: "test",
  ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
  ASSISTANT_APPROVAL_SIGNING_KEY:
    "synthetic-test-signing-key-at-least-32-bytes",
}
const capability = {
  id: "test.customer.create",
  version: 1,
  title: "Create customer",
  domain: "customers",
  mode: "write",
  action: "customer_create",
  schema: z.object({}),
  effect: "record",
  receipt: "customer",
  policy: { roles: ["OWNER", "ADMIN"] },
  scope: "tenant",
  clients: ["whatsapp"],
  rollout: "source",
  whatsapp: { mode: "native", rollout: "source" },
  tool: "draftAction",
  procedures: ["customers.create"],
  examples: [],
  tests: [],
  brain: "test",
} satisfies Capability
const material: WhatsAppActionReviewMaterial = {
  bindingId: input.review.bindingId,
  proposalId: input.review.proposalId,
  proposalRevision: input.review.proposalRevision,
  payloadHash: input.review.payloadHash,
  targetRevision: input.review.targetRevision,
  reviewDigest: input.review.reviewDigest,
  authorityDigest: input.review.authorityDigest,
  identityGeneration: input.review.identityGeneration,
  grantGeneration: input.review.grantGeneration,
  selectionGeneration: input.review.selectionGeneration,
  reviewOutboxId: input.review.reviewOutboxId,
  nonce: input.review.nonce,
  keyVersion: input.review.keyVersion,
  expiresAt: input.review.expiresAt,
}
input.review.confirmDigest = assistantWhatsAppActionDecisionDigest(
  deriveAssistantWhatsAppActionReviewCode(
    material,
    "confirm",
    environment.ASSISTANT_APPROVAL_SIGNING_KEY,
  ),
  "confirm",
)
input.review.cancelDigest = assistantWhatsAppActionDecisionDigest(
  deriveAssistantWhatsAppActionReviewCode(
    material,
    "cancel",
    environment.ASSISTANT_APPROVAL_SIGNING_KEY,
  ),
  "cancel",
)

test("only dispatch return value contains decision codes; durable source stays unchanged", () => {
  const before = JSON.stringify(input)
  const dispatched = assistantWhatsAppActionReviewDispatchBody(
    input,
    now,
    environment,
    [capability],
  )
  expect(dispatched).toStartWith(body)
  expect(dispatched).toMatch(/Confirm [A-Za-z0-9_-]{43}/)
  expect(dispatched).toMatch(/Cancel [A-Za-z0-9_-]{43}/)
  expect(JSON.stringify(input)).toBe(before)
  expect(input.body).not.toContain("Confirm ")
  const interactive = assistantWhatsAppActionReviewDispatch(
    input,
    now,
    environment,
    [capability],
  )
  expect(interactive?.buttons?.map((button) => button.title)).toEqual([
    "Confirm",
    "Edit",
    "Cancel",
  ])
  expect(interactive?.buttons?.[0]?.id).toMatch(
    /^ewa-wa-action-v1:[A-Za-z0-9_-]{43}:confirm$/,
  )
  expect(interactive?.buttons?.[1]?.id).toMatch(
    /^ewa-wa-action-v1:[A-Za-z0-9_-]{43}:edit$/,
  )
  expect(interactive?.buttons?.[2]?.id).toMatch(
    /^ewa-wa-action-v1:[A-Za-z0-9_-]{43}:cancel$/,
  )
})

test("revoked/stale/expired proof, edited proposal/body and role narrowing withhold dispatch", () => {
  for (const review of [
    { ...input.review, state: "CANCELLED" },
    { ...input.review, expiresAt: now },
    { ...input.review, bindingId: "other" },
    { ...input.review, proposalRevision: 5 },
    { ...input.review, targetRevision: "changed" },
    { ...input.review, identityGeneration: 2 },
    { ...input.review, grantGeneration: 3 },
    { ...input.review, selectionGeneration: 4 },
    { ...input.review, authorityDigest: "d".repeat(64) },
    { ...input.review, keyVersion: "old" },
    { ...input.review, confirmDigest: "a".repeat(64) },
  ])
    expect(
      assistantWhatsAppActionReviewDispatchBody(
        { ...input, review },
        now,
        environment,
        [capability],
      ),
    ).toBeUndefined()
  expect(
    assistantWhatsAppActionReviewDispatchBody(
      { ...input, body: `${body}Changed` },
      now,
      environment,
      [capability],
    ),
  ).toBeUndefined()
  expect(
    assistantWhatsAppActionReviewDispatchBody(
      {
        ...input,
        proposal: { ...input.proposal, payload: { ...payload, name: "Other" } },
      },
      now,
      environment,
      [capability],
    ),
  ).toBeUndefined()
  expect(
    assistantWhatsAppActionReviewDispatchBody(
      { ...input, role: "CASHIER" },
      now,
      environment,
      [capability],
    ),
  ).toBeUndefined()
})

test("independent write switch, source environment, canonical/channel rollout and key all fail closed", () => {
  for (const config of [
    { ...environment, ASSISTANT_WHATSAPP_WRITES_ENABLED: "false" },
    { ...environment, APP_ENV: "production" },
    { ...environment, ASSISTANT_APPROVAL_SIGNING_KEY: "" },
  ])
    expect(
      assistantWhatsAppActionReviewDispatchBody(input, now, config, [
        capability,
      ]),
    ).toBeUndefined()
  for (const entry of [
    { ...capability, rollout: "planned" },
    { ...capability, whatsapp: { mode: "app_review", rollout: "source" } },
    { ...capability, whatsapp: { mode: "native", rollout: "planned" } },
  ] satisfies Capability[])
    expect(
      assistantWhatsAppActionReviewDispatchBody(input, now, environment, [
        entry,
      ]),
    ).toBeUndefined()
  expect(
    assistantWhatsAppActionReviewDispatchBody(input, now, environment, []),
  ).toBeUndefined()
})
