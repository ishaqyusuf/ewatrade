/** Isolated ports: exercises the actual web-review service without a database or provider. */
import { mock } from "bun:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  WHATSAPP_WEB_REVIEW_VERSION,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import { TRPCError } from "@trpc/server"
import { assistantWhatsAppActionPayloadDigest } from "../../../../packages/db/src/queries/assistant-whatsapp/action-reviews"
import { assistantReviewLinkMatchesProposal } from "../../../../packages/db/src/queries/assistant-whatsapp/web-review-outcome"
import {
  createAssistantReviewLinkToken,
  createAssistantReviewShortLocator,
  assistantReviewShortOutboxId,
  readAssistantReviewLinkToken,
} from "../../../../packages/db/src/queries/assistant-whatsapp/web-review-token"
import { readAssistantReviewLinkLocator } from "../../../../packages/db/src/queries/assistant-whatsapp/web-review-locator"

process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
  "isolated-service-test-key-at-least-thirty-two-bytes"
const events: string[] = []
const browser = { user: { id: "actor-one" }, session: { id: "session-one" } }
const payload = { action: "customer_create", name: "Egg customer" }
const proposal = {
  id: "proposal-one",
  revision: 1,
  payloadHash: assistantWhatsAppActionPayloadDigest(payload),
  payload,
  actorUserId: browser.user.id,
  tenantId: "tenant-one",
  storeId: "store-one",
  status: "PENDING",
  expiresAt: new Date(Date.now() + 900_000),
}
const source = {
  version: 1 as const,
  proposalId: proposal.id,
  revision: 1,
  payloadHash: proposal.payloadHash,
  inboxId: "inbox-one",
  bindingId: "binding-one",
  expiresAt: proposal.expiresAt.getTime(),
}
const token = createAssistantReviewLinkToken(source)
const shortLocator = createAssistantReviewShortLocator(token)
const privateBody = renderWhatsAppWebReview({
  token,
  trustedAppOrigin: "https://dash.ewatrade.com",
  scopeLabel: "Business · Main",
})
if (!privateBody) throw Error("Expected private review fixture")
const shortRow = {
  id: assistantReviewShortOutboxId(shortLocator),
  inboxId: source.inboxId,
  content: privateBody,
  contentDigest: createHash("sha256").update(privateBody).digest("hex"),
  renderKind: "web_review",
  rendererVersion: WHATSAPP_WEB_REVIEW_VERSION,
  chunkIndex: 0,
  chunkCount: 1,
  expiresAt: proposal.expiresAt,
}
const ctx = {
  session: browser,
  tenantContext: {
    tenant: { id: proposal.tenantId, name: "Business", currencyCode: "NGN" },
    activeStore: { id: proposal.storeId, name: "Main" },
  },
  scope: {
    userId: browser.user.id,
    tenantId: proposal.tenantId,
    storeId: proposal.storeId,
  },
  db: {
    assistantWhatsAppOutbox: {
      findUnique: async (input: { where: { id: string } }) =>
        input.where.id === shortRow.id ? shortRow : null,
    },
  },
}
const saved = {
  proposal,
  inbox: {
    executionAuthorityDigest: "authority-one",
    expiresAt: proposal.expiresAt,
  },
  binding: {
    id: source.bindingId,
    grantId: "grant-one",
    identityGeneration: 1,
    grantGeneration: 1,
    selectionGeneration: 1,
    identity: { phoneNumberId: "phone-one", senderId: "sender-one" },
  },
}
let effects = 0
let canonicalCalls = 0
let grantBlocked = false
let failOutbox = false
let renewalSource: unknown
const transactionDb = {
  $queryRaw: async (strings: TemplateStringsArray) => {
    events.push(
      strings.join("?").includes("AssistantWhatsAppIdentity")
        ? "identity-lock"
        : strings.join("?").includes("AssistantWhatsAppGrant")
          ? "grant-lock"
          : "inbox-lock",
    )
  },
  assistantActionProposal: { findUniqueOrThrow: async () => proposal },
}
const generalProposal = () => ({
  id: proposal.id,
  revision: proposal.revision,
  payload: proposal.payload,
  status: proposal.status,
  receipt: null,
  expiresAt: proposal.expiresAt.toISOString(),
  approvalToken: "canonical-approval-only",
})

mock.module("@ewatrade/db/assistant-whatsapp", () => ({
  readAssistantReviewLinkLocator,
  readAssistantReviewLinkToken,
  assistantReviewLinkMatchesProposal,
  readAssistantWhatsAppWebReviewSource: async () => saved,
  assistantWhatsAppAuthorityDigest: async () => "authority-one",
  stageAssistantWhatsAppWebReviewOutcomeInTransaction: async (db: unknown) => {
    assert.equal(db, transactionDb)
    events.push("outbox")
    if (failOutbox) throw Error("synthetic outbox rollback")
    return { outboxId: "outbox-one" }
  },
  stageAssistantWhatsAppWebReviewRenewalInTransaction: async (
    db: unknown,
    input: { source: typeof source },
  ) => {
    assert.equal(db, transactionDb)
    events.push("renewal")
    renewalSource = input.source
    return {
      token: createAssistantReviewLinkToken(input.source),
      outboxId: "renewal-one",
    }
  },
}))
mock.module("@ewatrade/jobs/assistant-whatsapp", () => ({
  enqueueAssistantWhatsAppDelivery: async () => {
    events.push("enqueue")
  },
}))
mock.module("./channel-principal", () => ({
  requireBrowserIdentity: (session: unknown) => {
    assert.equal(session, browser)
    return browser
  },
  resolveLinkedAssistantIdentity: async () => {
    if (grantBlocked) throw new TRPCError({ code: "UNAUTHORIZED" })
    return {
      scope: {
        userId: browser.user.id,
        tenantId: "tenant-one",
        storeId: "store-one",
      },
    }
  },
}))
mock.module("./general-context", () => ({
  requireGeneralScope: (context: typeof ctx) => context.scope,
  assertGeneralActionAuthority: () => {
    events.push("authority")
  },
}))
mock.module("./general-proposals", () => ({
  generalProposalWithReview: async () => generalProposal(),
  inFreshGeneralTransaction: async (
    context: typeof ctx,
    operation: (fresh: typeof ctx) => Promise<unknown>,
    prelock: (db: typeof transactionDb) => Promise<void>,
  ) => {
    const oldEffects = effects
    const oldStatus = proposal.status
    const oldRevision = proposal.revision
    try {
      await prelock(transactionDb)
      events.push("membership")
      const result = await operation({ ...context, db: transactionDb })
      events.push("commit")
      return result
    } catch (error) {
      effects = oldEffects
      proposal.status = oldStatus
      proposal.revision = oldRevision
      events.push("rollback")
      throw error
    }
  },
  decideGeneralProposalInTransaction: async (
    fresh: typeof ctx,
    input: { approvalToken?: string; decision: string },
  ) => {
    assert.equal(fresh.db, transactionDb)
    assert.equal(fresh.session, browser)
    assert.equal(input.approvalToken, "canonical-approval-only")
    events.push("canonical")
    canonicalCalls++
    effects++
    proposal.status = input.decision === "confirm" ? "COMPLETED" : "CANCELLED"
    return generalProposal()
  },
  editGeneralProposalInTransaction: async (fresh: typeof ctx) => {
    assert.equal(fresh.db, transactionDb)
    assert.equal(fresh.session, browser)
    proposal.revision++
    events.push("canonical-edit")
    return generalProposal()
  },
}))
const service = await import("./review-links")
const context = ctx as unknown as Parameters<
  typeof service.readAssistantReviewLink
>[0]
const result = await service.readAssistantReviewLink(context, token)
assert.equal(result.status, "ready")
assert.equal(events.includes("canonical"), false)
assert.equal(events.includes("enqueue"), false)
const compact = await service.readAssistantReviewLink(context, shortLocator)
assert.equal(compact.status, "ready")
assert.equal(JSON.stringify(compact).includes(token), false)
proposal.actorUserId = "foreign-actor"
assert.equal(
  (await service.readAssistantReviewLink(context, token)).status,
  "unavailable",
)
proposal.actorUserId = browser.user.id
ctx.scope.storeId = "foreign-store"
assert.equal(
  (await service.readAssistantReviewLink(context, token)).status,
  "scope_mismatch",
)
ctx.scope.storeId = proposal.storeId
grantBlocked = true
assert.equal(
  (await service.readAssistantReviewLink(context, token)).status,
  "unavailable",
)
grantBlocked = false
events.length = 0
failOutbox = true
await assert.rejects(() =>
  service.decideAssistantReviewLink(context, {
    token,
    decision: "confirm",
    approvalToken: "canonical-approval-only",
  }),
)
assert.equal(effects, 0)
assert.equal(proposal.status, "PENDING")
assert.equal(events.includes("enqueue"), false)
assert.equal(events.includes("rollback"), true)
failOutbox = false
events.length = 0
await service.decideAssistantReviewLink(context, {
  token,
  decision: "confirm",
  approvalToken: "canonical-approval-only",
})
assert.equal(effects, 1)
assert.deepEqual(
  events.filter((event) =>
    [
      "identity-lock",
      "grant-lock",
      "inbox-lock",
      "membership",
      "canonical",
      "outbox",
      "commit",
      "enqueue",
    ].includes(event),
  ),
  [
    "identity-lock",
    "grant-lock",
    "inbox-lock",
    "membership",
    "canonical",
    "outbox",
    "commit",
    "enqueue",
  ],
)
const calls = canonicalCalls
await assert.rejects(() =>
  service.decideAssistantReviewLink(context, {
    token,
    decision: "confirm",
    approvalToken: "canonical-approval-only",
  }),
)
assert.equal(canonicalCalls, calls)
proposal.status = "PENDING"
events.length = 0
const edited = await service.editAssistantReviewLink(context, {
  token,
  payload: payload as Parameters<
    typeof service.editAssistantReviewLink
  >[1]["payload"],
})
assert.equal(readAssistantReviewLinkToken(edited.token)?.revision, 2)
assert.equal(
  (await service.readAssistantReviewLink(context, token)).status,
  "changed",
)
assert.equal(events.indexOf("canonical-edit") < events.indexOf("renewal"), true)
assert.equal(events.indexOf("renewal") < events.indexOf("commit"), true)
assert.equal(events.indexOf("commit") < events.indexOf("enqueue"), true)
assert.deepEqual(renewalSource, {
  ...source,
  revision: 2,
  originRevision: 1,
  originPayloadHash: source.payloadHash,
})
process.stdout.write(
  JSON.stringify({
    passed: true,
    scenarios: [
      "read-only",
      "wrong actor",
      "scope mismatch",
      "revoked grant",
      "outbox rollback",
      "atomic decision",
      "replay",
      "renewal",
    ],
    dbConnections: 0,
    providerCalls: 0,
    scope: "actual service with isolated canonical/transaction ports",
  }),
)
