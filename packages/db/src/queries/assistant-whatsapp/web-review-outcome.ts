import { createHash } from "node:crypto"
import { renderWhatsAppActionResult } from "@ewatrade/assistant/channels/action-result"
import {
  type AssistantReviewLinkSource,
  WHATSAPP_WEB_REVIEW_RESULT_VERSION,
  WHATSAPP_WEB_REVIEW_VERSION,
  assistantReviewLinkSourceSchema,
  renderWhatsAppWebReview,
} from "@ewatrade/assistant/channels/review-links"
import {
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import type { DbClient } from "../types"
import { assistantWhatsAppActionPayloadDigest } from "./action-reviews"
import { AssistantWhatsAppError } from "./authority"
import { createAssistantReviewLinkToken } from "./web-review-token"

/** Provenance lookup only. Browser/channel authorization is mandatory before exposing its result. */
export async function readAssistantWhatsAppWebReviewSource(
  db: DbClient,
  source: AssistantReviewLinkSource,
) {
  const proposal = await db.assistantActionProposal.findUnique({
    where: { id: source.proposalId },
  })
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: {
      id: source.inboxId,
      bindingId: source.bindingId,
      kind: "TURN",
      state: "COMPLETED",
      executionAuthorityDigest: { not: null },
    },
    include: { binding: { include: { identity: true } } },
  })
  const binding = inbox?.binding
  if (
    !proposal ||
    !inbox ||
    !binding ||
    binding.purpose !== "GENERAL" ||
    proposal.conversationId !== binding.conversationId ||
    proposal.actorUserId !== binding.identity.userId
  )
    return
  const run = await db.assistantRun.findFirst({
    where: {
      requestId: inbox.requestId,
      conversationId: proposal.conversationId,
      actorUserId: proposal.actorUserId,
      status: "COMPLETED",
    },
    include: { assistantMessage: true },
  })
  if (
    !run?.assistantMessage ||
    !run.assistantMessageId ||
    inbox.runId !== run.id ||
    run.assistantMessage.id !== run.assistantMessageId ||
    run.assistantMessage.conversationId !== binding.conversationId ||
    run.assistantMessage.role !== "assistant" ||
    !Array.isArray(run.assistantMessage.parts)
  )
    return
  const references = run.assistantMessage.parts.flatMap((part) => {
    const parsed = generalStoredPartSchema.safeParse(part)
    return parsed.success &&
      parsed.data.type === "data-general-proposal-reference"
      ? [parsed.data.data]
      : []
  })
  const reference = references[0]
  if (
    references.length !== 1 ||
    !reference ||
    reference.proposalId !== source.proposalId ||
    reference.revision !== (source.originRevision ?? source.revision) ||
    reference.payloadHash !== (source.originPayloadHash ?? source.payloadHash)
  )
    return
  return { proposal, inbox, binding, run }
}

export function assistantReviewLinkMatchesProposal(
  source: AssistantReviewLinkSource,
  proposal: {
    id: string
    revision: number
    payloadHash: string
    payload: unknown
  },
) {
  return (
    proposal.id === source.proposalId &&
    proposal.revision === source.revision &&
    proposal.payloadHash === source.payloadHash &&
    assistantWhatsAppActionPayloadDigest(proposal.payload) ===
      source.payloadHash
  )
}

const resultSchema = z
  .object({
    version: z.literal(WHATSAPP_WEB_REVIEW_RESULT_VERSION),
    source: assistantReviewLinkSourceSchema,
    decision: z.enum(["confirm", "cancel"]),
    status: z.enum(["COMPLETED", "CANCELLED"]),
    receiptDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict()
  .refine((value) =>
    value.decision === "confirm"
      ? value.status === "COMPLETED" && value.receiptDigest !== null
      : value.status === "CANCELLED" && value.receiptDigest === null,
  )
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

/** Original response owns 1; results are even, renewals odd, without overlapping revision ranges. */
export function webReviewResponseRevision(
  revision: number,
  lane: "result" | "renewal",
) {
  if (!Number.isInteger(revision) || revision < 1 || revision > 1_073_741_821)
    throw new AssistantWhatsAppError("CONFLICT")
  return 2 * revision + (lane === "result" ? 2 : 3)
}

/** A saved edit rotates the locator and durably returns the replacement to the original sender. */
export async function stageAssistantWhatsAppWebReviewRenewalInTransaction(
  db: Prisma.TransactionClient,
  input: {
    source: AssistantReviewLinkSource
    scopeLabel: string
    trustedAppOrigin: string
  },
  now = new Date(),
) {
  const saved = await readAssistantWhatsAppWebReviewSource(db, input.source)
  if (
    !saved ||
    !assistantReviewLinkMatchesProposal(input.source, saved.proposal) ||
    saved.proposal.status !== "PENDING" ||
    input.source.expiresAt <= now.getTime() ||
    input.source.expiresAt > saved.proposal.expiresAt.getTime() ||
    !saved.inbox.executionAuthorityDigest ||
    saved.inbox.expiresAt <= now
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const token = createAssistantReviewLinkToken(input.source)
  const body = renderWhatsAppWebReview({
    token,
    trustedAppOrigin: input.trustedAppOrigin,
    scopeLabel: input.scopeLabel,
  })
  if (!body) throw new AssistantWhatsAppError("UNAVAILABLE")
  const responseRevision = webReviewResponseRevision(
    saved.proposal.revision,
    "renewal",
  )
  const contentDigest = hash(body)
  const existing = await db.assistantWhatsAppOutbox.findFirst({
    where: { inboxId: saved.inbox.id, responseRevision, chunkIndex: 0 },
  })
  if (existing) {
    if (
      existing.contentDigest !== contentDigest ||
      existing.renderKind !== "web_review"
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { token, outboxId: existing.id }
  }
  const row = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: saved.inbox.id,
      phoneNumberId: saved.inbox.phoneNumberId,
      runId: saved.run.id,
      messageId: saved.run.assistantMessageId,
      responseRevision,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_WEB_REVIEW_VERSION,
      renderKind: "web_review",
      authorityDigest: saved.inbox.executionAuthorityDigest,
      content: body,
      contentDigest,
      expiresAt: new Date(
        Math.min(input.source.expiresAt, saved.inbox.expiresAt.getTime()),
      ),
    },
  })
  return { token, outboxId: row.id }
}

/** Root canonical decision and this outbox append commit together; no provider effect here. */
export async function stageAssistantWhatsAppWebReviewOutcomeInTransaction(
  db: Prisma.TransactionClient,
  input: { source: AssistantReviewLinkSource; decision: "confirm" | "cancel" },
  now = new Date(),
) {
  const saved = await readAssistantWhatsAppWebReviewSource(db, input.source)
  if (
    !saved ||
    !assistantReviewLinkMatchesProposal(input.source, saved.proposal) ||
    saved.proposal.status !==
      (input.decision === "confirm" ? "COMPLETED" : "CANCELLED") ||
    !saved.inbox.executionAuthorityDigest ||
    saved.inbox.expiresAt <= now
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const receipt =
    input.decision === "confirm"
      ? generalReceiptSchema.parse(saved.proposal.executedResult)
      : null
  const content = JSON.stringify(
    resultSchema.parse({
      version: WHATSAPP_WEB_REVIEW_RESULT_VERSION,
      source: input.source,
      decision: input.decision,
      status: saved.proposal.status,
      receiptDigest: receipt
        ? assistantWhatsAppActionPayloadDigest(receipt)
        : null,
    }),
  )
  const responseRevision = webReviewResponseRevision(
    saved.proposal.revision,
    "result",
  )
  const contentDigest = hash(content)
  const existing = await db.assistantWhatsAppOutbox.findFirst({
    where: { inboxId: saved.inbox.id, responseRevision, chunkIndex: 0 },
  })
  if (existing) {
    if (
      existing.contentDigest !== contentDigest ||
      existing.renderKind !== "web_review_result"
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { staged: false, outboxId: existing.id }
  }
  const row = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: saved.inbox.id,
      phoneNumberId: saved.inbox.phoneNumberId,
      runId: saved.run.id,
      messageId: saved.run.assistantMessageId,
      responseRevision,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_WEB_REVIEW_RESULT_VERSION,
      renderKind: "web_review_result",
      authorityDigest: saved.inbox.executionAuthorityDigest,
      content,
      contentDigest,
      expiresAt: saved.inbox.expiresAt,
    },
  })
  return { staged: true, outboxId: row.id }
}

/** Delivery rereads the exact canonical result; JSON is never sent to WhatsApp. */
export async function resolveAssistantWhatsAppWebReviewOutcome(
  db: DbClient,
  input: {
    content: string
    inboxId: string
    bindingId: string
    runId: string
    messageId: string
    actorUserId: string
    tenantId: string
    storeId: string
    authorityDigest: string
    now?: Date
  },
) {
  let parsed: z.infer<typeof resultSchema>
  try {
    parsed = resultSchema.parse(JSON.parse(input.content))
  } catch {
    return
  }
  if (
    parsed.source.bindingId !== input.bindingId ||
    parsed.source.inboxId !== input.inboxId
  )
    return
  const saved = await readAssistantWhatsAppWebReviewSource(db, parsed.source)
  if (
    !saved ||
    !assistantReviewLinkMatchesProposal(parsed.source, saved.proposal) ||
    saved.proposal.status !== parsed.status ||
    saved.run.id !== input.runId ||
    saved.run.assistantMessageId !== input.messageId ||
    saved.proposal.actorUserId !== input.actorUserId ||
    saved.proposal.tenantId !== input.tenantId ||
    saved.proposal.storeId !== input.storeId ||
    saved.inbox.executionAuthorityDigest !== input.authorityDigest ||
    saved.inbox.expiresAt <= (input.now ?? new Date())
  )
    return
  const receipt =
    parsed.status === "COMPLETED"
      ? generalReceiptSchema.safeParse(saved.proposal.executedResult)
      : null
  if (
    parsed.status === "COMPLETED" &&
    (!receipt?.success ||
      assistantWhatsAppActionPayloadDigest(receipt.data) !==
        parsed.receiptDigest)
  )
    return
  const body = renderWhatsAppActionResult({
    status: parsed.status,
    receipt: receipt?.success ? receipt.data : null,
  })
  return { body }
}
