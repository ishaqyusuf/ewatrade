import { expect, test } from "bun:test"
import {
  WHATSAPP_REVIEW_LINK_RECOVERY_MODEL,
  WHATSAPP_WEB_REVIEW_VERSION,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import type { DbClient } from "../types"
import { readAssistantWhatsAppWebReviewRecoveryTarget } from "./web-review-outcome"
import { createAssistantReviewLinkToken } from "./web-review-token"

process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
  "review-recovery-test-key-with-enough-length"
const base = {
  version: 1 as const,
  proposalId: "proposal-rice",
  payloadHash: "a".repeat(64),
  bindingId: "binding-one",
}
type Row = {
  id: string
  inboxId: string
  sequence: number
  renderKind: string
  rendererVersion: string
  content: string | null
  runId: string | null
  providerMessageId: string
}
function link(
  id: string,
  sequence: number,
  source: { revision: number; expiresAt: number; bindingId?: string },
): Row {
  const inboxId = `inbox-${sequence}`
  const token = createAssistantReviewLinkToken({
    ...base,
    ...source,
    inboxId,
  })
  return {
    id,
    inboxId,
    sequence,
    renderKind: "web_review",
    rendererVersion: WHATSAPP_WEB_REVIEW_VERSION,
    content:
      renderWhatsAppWebReview({
        token,
        trustedAppOrigin: "https://dash.ewatrade.com",
        scopeLabel: "Business · Main",
      }) ?? null,
    runId: `run-${sequence}`,
    providerMessageId: `wamid-${id}`,
  }
}
const reply = (id: string, sequence: number, runId: string): Row => ({
  id,
  inboxId: `inbox-${sequence}`,
  sequence,
  renderKind: "reply",
  rendererVersion: "whatsapp-reply-v3",
  content: "notice",
  runId,
  providerMessageId: `wamid-${id}`,
})
const view = (row: Row) => ({
  inboxId: row.inboxId,
  renderKind: row.renderKind,
  rendererVersion: row.rendererVersion,
  content: row.content,
  runId: row.runId,
  inbox: { sequence: row.sequence },
})

/** Rows are listed newest first, as sentAt ordering would return them. */
function database(rows: Row[], recoveryRuns: string[] = []) {
  return {
    assistantWhatsAppInbox: {
      findFirst: async () => ({ sequence: 10 }),
    },
    assistantWhatsAppOutbox: {
      findFirst: async (query: {
        where: {
          id?: string
          renderKind?: string
          providerMessageId?: string
          inbox: { sequence: { lt: number } }
        }
      }) => {
        const row = rows.find(
          (candidate) =>
            candidate.sequence < query.where.inbox.sequence.lt &&
            (query.where.id === undefined || candidate.id === query.where.id) &&
            (query.where.renderKind === undefined ||
              candidate.renderKind === query.where.renderKind) &&
            (query.where.providerMessageId === undefined ||
              candidate.providerMessageId === query.where.providerMessageId),
        )
        return row ? view(row) : null
      },
      findMany: async (query: {
        where: { inbox: { sequence: { lt: number } } }
      }) =>
        rows
          .filter(
            (row) =>
              row.renderKind === "web_review" &&
              row.sequence < query.where.inbox.sequence.lt,
          )
          .map(view),
    },
    assistantRun: {
      findFirst: async (query: { where: { id: string; model: string } }) =>
        query.where.model === WHATSAPP_REVIEW_LINK_RECOVERY_MODEL &&
        recoveryRuns.includes(query.where.id)
          ? { id: query.where.id }
          : null,
    },
  } as unknown as DbClient
}
const input = {
  inboxId: "inbox-10",
  bindingId: "binding-one",
  phoneNumberId: "phone-one",
}
const expiresAt = Date.parse("2026-11-03T10:05:00Z")

test("a quoted link names its draft and the newest sent link for that draft", async () => {
  const original = link("original", 1, { revision: 1, expiresAt })
  const renewed = link("renewed", 1, {
    revision: 2,
    expiresAt: expiresAt + 60_000,
  })
  const target = await readAssistantWhatsAppWebReviewRecoveryTarget(
    database([renewed, original]),
    { ...input, replyToMessageId: "wamid-original" },
  )
  expect(target?.proposalId).toBe("proposal-rice")
  expect(target?.latest.revision).toBe(2)
})

test("without a quote only a latest sent link can be the subject", async () => {
  const original = link("original", 1, { revision: 1, expiresAt })
  expect(
    (
      await readAssistantWhatsAppWebReviewRecoveryTarget(
        database([original]),
        input,
      )
    )?.proposalId,
  ).toBe("proposal-rice")
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(
      database([reply("model", 2, "model-run"), original]),
      input,
    ),
  ).toBeUndefined()
})

test("a fixed recovery reply leads to the link before it; a model reply never does", async () => {
  const original = link("original", 1, { revision: 1, expiresAt })
  const notice = reply("notice", 2, "recovery-run")
  const target = await readAssistantWhatsAppWebReviewRecoveryTarget(
    database([notice, original], ["recovery-run"]),
    { ...input, replyToMessageId: "wamid-notice", requireRecoveryReply: true },
  )
  expect(target?.proposalId).toBe("proposal-rice")
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(
      database([notice, original]),
      {
        ...input,
        replyToMessageId: "wamid-notice",
        requireRecoveryReply: true,
      },
    ),
  ).toBeUndefined()
})

test("button taps cannot start from a link, and another binding's token is ignored", async () => {
  const original = link("original", 1, { revision: 1, expiresAt })
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(database([original]), {
      ...input,
      replyToMessageId: "wamid-original",
      requireRecoveryReply: true,
    }),
  ).toBeUndefined()
  const foreign = link("foreign", 1, {
    revision: 1,
    expiresAt,
    bindingId: "binding-two",
  })
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(database([foreign]), {
      ...input,
      replyToMessageId: "wamid-foreign",
    }),
  ).toBeUndefined()
})

test("a tap on the link's own button is bound to that exact link message", async () => {
  const original = link("original", 1, { revision: 1, expiresAt })
  const renewed = link("renewed", 1, {
    revision: 2,
    expiresAt: expiresAt + 60_000,
  })
  const tapped = await readAssistantWhatsAppWebReviewRecoveryTarget(
    database([renewed, original]),
    {
      ...input,
      replyToMessageId: "wamid-original",
      linkOutboxId: "original",
    },
  )
  // The caller sees the tapped revision and the newest one, and refuses a mismatch.
  expect(tapped?.quoted?.revision).toBe(1)
  expect(tapped?.latest.revision).toBe(2)
  // The quoted message must be that same outbox row, and a link, never a reply.
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(
      database([renewed, original]),
      {
        ...input,
        replyToMessageId: "wamid-original",
        linkOutboxId: "renewed",
      },
    ),
  ).toBeUndefined()
  const notice = reply("notice", 2, "recovery-run")
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(
      database([notice, original], ["recovery-run"]),
      { ...input, replyToMessageId: "wamid-notice", linkOutboxId: "notice" },
    ),
  ).toBeUndefined()
  expect(
    await readAssistantWhatsAppWebReviewRecoveryTarget(database([original]), {
      ...input,
      linkOutboxId: "original",
    }),
  ).toBeUndefined()
})
