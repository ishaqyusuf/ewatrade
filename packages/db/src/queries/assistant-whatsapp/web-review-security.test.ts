import { expect, test } from "bun:test"
import type { AssistantReviewLinkSource } from "@ewatrade/assistant/channels/review-links"
import { assistantWhatsAppActionPayloadDigest } from "./action-reviews"
import {
  assistantReviewLinkMatchesProposal,
  readAssistantWhatsAppWebReviewSource,
  resolveAssistantWhatsAppWebReviewOutcome,
  stageAssistantWhatsAppWebReviewOutcomeInTransaction,
  stageAssistantWhatsAppWebReviewRenewalInTransaction,
  webReviewResponseRevision,
} from "./web-review-outcome"
import {
  createAssistantReviewLinkToken,
  readAssistantReviewLinkToken,
} from "./web-review-token"

const secret = "synthetic-locator-key-longer-than-thirty-two-bytes"
const now = new Date("2026-10-21T16:00:00Z")
const payload = { action: "customer_create", name: "Egg customer" }
const source: AssistantReviewLinkSource = {
  version: 1,
  proposalId: "proposal-one",
  revision: 1,
  payloadHash: assistantWhatsAppActionPayloadDigest(payload),
  inboxId: "inbox-one",
  bindingId: "binding-one",
  expiresAt: now.getTime() + 900_000,
}
const reference = {
  type: "data-general-proposal-reference",
  data: {
    proposalId: source.proposalId,
    revision: source.revision,
    payloadHash: source.payloadHash,
  },
}
const receipt = {
  kind: "customer",
  recordId: "customer-one",
  title: "Customer created",
  detail: "Egg customer",
}

function fixture() {
  const proposal = {
    id: source.proposalId,
    conversationId: "conversation-one",
    actorUserId: "actor-one",
    tenantId: "tenant-one",
    storeId: "store-one",
    revision: 1,
    payloadHash: source.payloadHash,
    payload,
    status: "COMPLETED",
    executedResult: receipt,
    expiresAt: new Date(source.expiresAt),
  }
  const inbox = {
    id: source.inboxId,
    runId: "run-one",
    phoneNumberId: "phone-one",
    executionAuthorityDigest: "authority-one",
    requestId: "request-one",
    expiresAt: new Date(source.expiresAt),
    binding: {
      id: source.bindingId,
      purpose: "GENERAL",
      conversationId: proposal.conversationId,
      identity: { userId: proposal.actorUserId },
    },
  }
  const run = {
    id: "run-one",
    assistantMessageId: "message-one",
    assistantMessage: {
      id: "message-one",
      conversationId: proposal.conversationId,
      role: "assistant",
      parts: [reference],
    },
  }
  const outbox: {
    id: string
    content: string
    contentDigest: string
    renderKind: string
  }[] = []
  const db = {
    assistantActionProposal: { findUnique: async () => proposal },
    assistantWhatsAppInbox: { findFirst: async () => inbox },
    assistantRun: { findFirst: async () => run },
    assistantWhatsAppOutbox: {
      findFirst: async () => outbox[0] ?? null,
      create: async (input: {
        data: { content: string; contentDigest: string; renderKind: string }
      }) => {
        const row = { id: "outbox-one", ...input.data }
        outbox.push(row)
        return row
      },
    },
  } as unknown as Parameters<
    typeof stageAssistantWhatsAppWebReviewOutcomeInTransaction
  >[0]
  const dispatch = {
    inboxId: inbox.id,
    bindingId: source.bindingId,
    runId: run.id,
    messageId: run.assistantMessageId,
    actorUserId: proposal.actorUserId,
    tenantId: proposal.tenantId,
    storeId: proposal.storeId,
    authorityDigest: inbox.executionAuthorityDigest,
    now,
  }
  return { db, proposal, inbox, run, outbox, dispatch }
}

test("locator is deterministic, domain separated and rejects tampering, malformed input and secret rotation", () => {
  const token = createAssistantReviewLinkToken(source, secret)
  expect(createAssistantReviewLinkToken({ ...source }, secret)).toBe(token)
  expect(readAssistantReviewLinkToken(token, secret)).toEqual(source)
  expect(
    readAssistantReviewLinkToken(token, `${secret}rotation`),
  ).toBeUndefined()
  expect(
    readAssistantReviewLinkToken(
      token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"),
      secret,
    ),
  ).toBeUndefined()
  expect(readAssistantReviewLinkToken("x".repeat(2049), secret)).toBeUndefined()
  expect(
    readAssistantReviewLinkToken("invalid.invalid", secret),
  ).toBeUndefined()
  expect(() => createAssistantReviewLinkToken(source, "short")).toThrow()
  const body = JSON.parse(
    Buffer.from(token.split(".")[0] ?? "", "base64url").toString(),
  )
  expect(body).not.toHaveProperty("approvalToken")
  expect(body).not.toHaveProperty("payload")
})

test("an edited draft invalidates the exact old revision or payload", () => {
  const { proposal } = fixture()
  expect(assistantReviewLinkMatchesProposal(source, proposal)).toBe(true)
  expect(
    assistantReviewLinkMatchesProposal(source, { ...proposal, revision: 2 }),
  ).toBe(false)
  expect(
    assistantReviewLinkMatchesProposal(source, {
      ...proposal,
      payload: { ...payload, name: "Changed" },
    }),
  ).toBe(false)
  expect(webReviewResponseRevision(1, "result")).not.toBe(
    webReviewResponseRevision(501, "renewal"),
  )
  expect(webReviewResponseRevision(501, "result") % 2).toBe(0)
  expect(webReviewResponseRevision(1, "renewal") % 2).toBe(1)
  expect(() => webReviewResponseRevision(1_073_741_822, "result")).toThrow()
})

test("provenance refuses cross-wired original run, message and conversation", async () => {
  const f = fixture()
  expect(await readAssistantWhatsAppWebReviewSource(f.db, source)).toBeDefined()
  f.inbox.runId = "foreign-run"
  expect(
    await readAssistantWhatsAppWebReviewSource(f.db, source),
  ).toBeUndefined()
  f.inbox.runId = f.run.id
  f.run.assistantMessage.role = "user"
  expect(
    await readAssistantWhatsAppWebReviewSource(f.db, source),
  ).toBeUndefined()
  f.run.assistantMessage.role = "assistant"
  f.run.assistantMessage.conversationId = "foreign-conversation"
  expect(
    await readAssistantWhatsAppWebReviewSource(f.db, source),
  ).toBeUndefined()
})

test("canonical outcome is staged once and dispatch refuses foreign source or changed receipt", async () => {
  const f = fixture()
  await stageAssistantWhatsAppWebReviewOutcomeInTransaction(
    f.db,
    { source, decision: "confirm" },
    now,
  )
  await stageAssistantWhatsAppWebReviewOutcomeInTransaction(
    f.db,
    { source, decision: "confirm" },
    now,
  )
  expect(f.outbox).toHaveLength(1)
  const content = f.outbox[0]?.content ?? ""
  expect(
    (
      await resolveAssistantWhatsAppWebReviewOutcome(f.db, {
        ...f.dispatch,
        content,
      })
    )?.body,
  ).toContain("Customer created")
  expect(
    await resolveAssistantWhatsAppWebReviewOutcome(f.db, {
      ...f.dispatch,
      content,
      inboxId: "foreign-inbox",
    }),
  ).toBeUndefined()
  expect(
    await resolveAssistantWhatsAppWebReviewOutcome(f.db, {
      ...f.dispatch,
      content,
      actorUserId: "foreign-actor",
    }),
  ).toBeUndefined()
  expect(
    await resolveAssistantWhatsAppWebReviewOutcome(f.db, {
      ...f.dispatch,
      content,
      authorityDigest: "changed-authority",
    }),
  ).toBeUndefined()
  f.proposal.executedResult = { ...receipt, detail: "Changed receipt" }
  expect(
    await resolveAssistantWhatsAppWebReviewOutcome(f.db, {
      ...f.dispatch,
      content,
    }),
  ).toBeUndefined()
})

test("a canonical edit rotates revision and durably stages the replacement locator", async () => {
  const f = fixture()
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = secret
  try {
    f.proposal.status = "PENDING"
    f.proposal.revision = 2
    const renewed = {
      ...source,
      revision: 2,
      originRevision: 1,
      originPayloadHash: source.payloadHash,
    }
    const staged = await stageAssistantWhatsAppWebReviewRenewalInTransaction(
      f.db,
      {
        source: renewed,
        scopeLabel: "Business · Main",
        trustedAppOrigin: "https://dash.ewatrade.com",
      },
      now,
    )
    expect(readAssistantReviewLinkToken(staged.token, secret)).toEqual(renewed)
    expect(assistantReviewLinkMatchesProposal(source, f.proposal)).toBe(false)
    expect(f.outbox).toHaveLength(1)
    expect(f.outbox[0]?.renderKind).toBe("web_review")
    expect(f.outbox[0]?.content).toContain("/assistant-review?token=")
    expect(f.outbox[0]?.content).not.toContain("/assistant/c/")
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})
