import { createHash } from "node:crypto"
import { WHATSAPP_ACTION_REVIEW_VERSION } from "@ewatrade/assistant/channels/action-review"
import {
  WHATSAPP_NOTICE_VERSION,
  type WhatsAppNoticeCode,
  renderWhatsAppNotice,
} from "@ewatrade/assistant/channels/notice"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { WHATSAPP_WEB_REVIEW_VERSION } from "@ewatrade/assistant/channels/review-links"
import {
  WHATSAPP_PRODUCT_PHOTO_KIND,
  WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
  type WhatsAppWorkflowActionSource,
  whatsAppProductPhotoContentSchema,
} from "@ewatrade/assistant/channels/workflow-action-review"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { issueAssistantWhatsAppActionReviewInTransaction } from "./action-reviews"
import { AssistantWhatsAppError } from "./authority"
import type {
  WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import {
  assistantReviewShortOutboxId,
  assistantReviewTokenFromBody,
  createAssistantReviewShortLocator,
} from "./web-review-token"
import {
  type WhatsAppWorkflowCommandProjector,
  issueAssistantWhatsAppWorkflowReviewInTransaction,
} from "./workflow-action-reviews"
import { renderAssistantWhatsAppWorkflowReply } from "./workflow-reply"

export type AssistantWhatsAppStagedReview = {
  source: { proposalId: string; revision: number; payloadHash: string }
  targetRevision: string | null
  body: string
  expiresAt: Date
}
export type AssistantWhatsAppStagedWebReview = {
  source: { proposalId: string; revision: number; payloadHash: string }
  body: string
  expiresAt: Date
}
export type AssistantWhatsAppStagedWorkflowReview = {
  source: WhatsAppWorkflowActionSource
  body: string
  expiresAt: Date
  projectCommand: WhatsAppWorkflowCommandProjector
  /** Product photo cards, sent in order before the review. */
  photos?: ReadonlyArray<{ attachmentId: string; caption: string }>
}

type ResolvedConversation = Awaited<
  ReturnType<typeof resolveAssistantWhatsAppConversation>
>
/** Revision 0 holds at most one fixed preface sent before the same inbox's own reply (revision 1). */
export const ASSISTANT_WHATSAPP_PREFACE_REVISION = 0
export const ASSISTANT_WHATSAPP_WINDOW_CLOSED = "MESSAGE_WINDOW_CLOSED"

/** The fixed notice body for the current resolved scope; delivery re-renders and compares it. */
export function assistantWhatsAppNoticeBody(
  code: WhatsAppNoticeCode,
  resolved: ResolvedConversation,
) {
  const store = resolved.tenantContext.activeStore
  if (!store) return undefined
  return renderWhatsAppNotice(
    code,
    {
      businessName: resolved.tenantContext.tenant.name,
      storeName: store.name,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      conversationId: resolved.conversation.id,
      purpose: resolved.conversation.purpose,
    },
    process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
  )
}

/** A fixed notice row has no run, message, draft, review or execution authority of its own. */
export async function stageAssistantWhatsAppNoticeInTransaction(
  db: Prisma.TransactionClient,
  inbox: { id: string; phoneNumberId: string; expiresAt: Date },
  input: {
    code: WhatsAppNoticeCode
    resolved: ResolvedConversation
    authorityDigest: string
    responseRevision?: 0 | 1
  },
) {
  const content = assistantWhatsAppNoticeBody(input.code, input.resolved)
  if (!content) throw new AssistantWhatsAppError("UNAUTHORIZED")
  await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      responseRevision: input.responseRevision ?? 1,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_NOTICE_VERSION,
      renderKind: "notice",
      authorityDigest: input.authorityDigest,
      content,
      contentDigest: createHash("sha256").update(content).digest("hex"),
      expiresAt: inbox.expiresAt,
    },
  })
}

/**
 * Replies cancelled by the 24-hour window are never resent. The binding's next
 * staged turn reply gets one fixed preface per missed batch: the latest missed
 * TURN reply with no outbox row on any later inbox before this one.
 */
export async function stageAssistantWhatsAppMissedReplyNoticeInTransaction(
  db: Prisma.TransactionClient,
  inbox: {
    id: string
    bindingId: string | null
    sequence: number
    phoneNumberId: string
    expiresAt: Date
  },
  resolved: ResolvedConversation,
  authorityDigest: string,
) {
  if (!inbox.bindingId) return false
  const missed = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      state: "EXPIRED",
      errorCode: ASSISTANT_WHATSAPP_WINDOW_CLOSED,
      inbox: {
        bindingId: inbox.bindingId,
        identityId: null,
        kind: "TURN",
        sequence: { lt: inbox.sequence },
      },
    },
    orderBy: { inbox: { sequence: "desc" } },
    select: { inbox: { select: { sequence: true } } },
  })
  if (!missed) return false
  const answered = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      OR: [
        {
          inbox: {
            bindingId: inbox.bindingId,
            sequence: { gt: missed.inbox.sequence, lt: inbox.sequence },
          },
        },
        {
          inboxId: inbox.id,
          responseRevision: ASSISTANT_WHATSAPP_PREFACE_REVISION,
        },
      ],
    },
    select: { id: true },
  })
  if (answered) return false
  await stageAssistantWhatsAppNoticeInTransaction(db, inbox, {
    code: "REPLY_WINDOW_MISSED",
    resolved,
    authorityDigest,
    responseRevision: ASSISTANT_WHATSAPP_PREFACE_REVISION,
  })
  return true
}

/** Only called by the lease-authorized settlement transaction with its scoped canonical reply. */
export async function stageAssistantWhatsAppOutboxInTransaction(
  db: Prisma.TransactionClient,
  inbox: { id: string; phoneNumberId: string; expiresAt: Date },
  run: {
    id: string
    assistantMessageId: string | null
    assistantMessage: { parts: unknown } | null
  },
  authorityDigest: string,
  scopeLabel: string,
  navigationScope?: { tenantId: string; storeId: string },
  conversationId?: string,
  review?: AssistantWhatsAppStagedReview,
  principal?: WhatsAppConversationPrincipal,
  workflow?: {
    purpose: "SETUP" | "PRODUCT_CREATE"
    actorUserId: string
    review?: AssistantWhatsAppStagedWorkflowReview
  },
  webReview?: AssistantWhatsAppStagedWebReview,
) {
  if (!run.assistantMessageId || !run.assistantMessage)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const ordinary = renderWhatsAppFinalReply(run.assistantMessage.parts, {
    scopeLabel,
    currentScope: navigationScope,
    conversation:
      navigationScope && conversationId
        ? { conversationId, purpose: "GENERAL", origin: navigationScope }
        : undefined,
    trustedAppOrigin:
      process.env.DASHBOARD_URL ??
      process.env.NEXT_PUBLIC_DASHBOARD_URL ??
      "https://dash.ewatrade.com",
  })
  const references = Array.isArray(run.assistantMessage.parts)
    ? run.assistantMessage.parts.flatMap((part) => {
        const parsed = generalStoredPartSchema.safeParse(part)
        return parsed.success &&
          parsed.data.type === "data-general-proposal-reference"
          ? [parsed.data.data]
          : []
      })
    : []
  const exactReview =
    review &&
    principal &&
    references.length === 1 &&
    references[0]?.proposalId === review.source.proposalId &&
    references[0]?.revision === review.source.revision &&
    references[0]?.payloadHash === review.source.payloadHash &&
    review.body.length <= 2500 &&
    review.expiresAt > new Date()
  const exactWebReview =
    webReview &&
    principal &&
    !workflow &&
    references.length === 1 &&
    references[0]?.proposalId === webReview.source.proposalId &&
    references[0]?.revision === webReview.source.revision &&
    references[0]?.payloadHash === webReview.source.payloadHash &&
    webReview.body.length <= 3000 &&
    webReview.expiresAt > new Date()
  const workflowReply =
    workflow && navigationScope
      ? await renderAssistantWhatsAppWorkflowReply(db, {
          inboxId: inbox.id,
          runId: run.id,
          actorUserId: workflow.actorUserId,
          ...navigationScope,
          purpose: workflow.purpose,
          trustedAppOrigin:
            process.env.DASHBOARD_URL ??
            process.env.NEXT_PUBLIC_DASHBOARD_URL ??
            "https://dash.ewatrade.com",
        })
      : undefined
  if (workflow && !workflowReply)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const workflowReview = workflow?.review
  const rendered =
    workflowReview &&
    principal &&
    workflowReview.source.purpose === workflow?.purpose
      ? {
          version: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
          kind: "workflow_action_review",
          chunks: [workflowReview.body],
        }
      : (workflowReply ??
        (exactWebReview
          ? {
              version: WHATSAPP_WEB_REVIEW_VERSION,
              kind: "web_review",
              chunks: [webReview.body],
            }
          : exactReview
            ? {
                version: WHATSAPP_ACTION_REVIEW_VERSION,
                kind: "action_review",
                chunks: [review.body],
              }
            : ordinary))
  const signedReviewToken =
    rendered.kind === "web_review"
      ? assistantReviewTokenFromBody(rendered.chunks[0] ?? "")
      : undefined
  if (rendered.kind === "web_review" && !signedReviewToken)
    throw new AssistantWhatsAppError("UNAVAILABLE")
  const photos =
    rendered.kind === "workflow_action_review"
      ? (workflowReview?.photos ?? []).slice(0, 3)
      : []
  const chunks = [
    // Photo cards go first, at -n…-1, so chunk 0 stays the exact review.
    ...photos.map((photo, index) => {
      const content = JSON.stringify(
        whatsAppProductPhotoContentSchema.parse(photo),
      )
      return {
        inboxId: inbox.id,
        phoneNumberId: inbox.phoneNumberId,
        runId: run.id,
        messageId: run.assistantMessageId,
        responseRevision: 1,
        chunkIndex: index - photos.length,
        chunkCount: 1,
        rendererVersion: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
        renderKind: WHATSAPP_PRODUCT_PHOTO_KIND,
        authorityDigest,
        content,
        contentDigest: createHash("sha256").update(content).digest("hex"),
        expiresAt: inbox.expiresAt,
      }
    }),
    ...rendered.chunks.map((content, chunkIndex) => ({
      ...(signedReviewToken
        ? {
            id: assistantReviewShortOutboxId(
              createAssistantReviewShortLocator(signedReviewToken),
            ),
          }
        : {}),
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      runId: run.id,
      messageId: run.assistantMessageId,
      responseRevision: 1,
      chunkIndex,
      chunkCount: rendered.chunks.length,
      rendererVersion: rendered.version,
      renderKind: rendered.kind,
      authorityDigest,
      content,
      contentDigest: createHash("sha256").update(content).digest("hex"),
      expiresAt:
        exactWebReview && webReview ? webReview.expiresAt : inbox.expiresAt,
    })),
  ]
  const prior = await db.assistantWhatsAppOutbox.findMany({
    where: { inboxId: inbox.id, responseRevision: 1 },
    orderBy: { chunkIndex: "asc" },
  })
  if (prior.length) {
    if (
      prior.length !== chunks.length ||
      prior.some((row, index) => {
        const expected = chunks[index]
        return (
          !expected ||
          row.runId !== expected.runId ||
          row.messageId !== expected.messageId ||
          row.authorityDigest !== expected.authorityDigest ||
          row.rendererVersion !== expected.rendererVersion ||
          row.renderKind !== expected.renderKind ||
          row.chunkIndex !== expected.chunkIndex ||
          row.chunkCount !== expected.chunkCount ||
          row.contentDigest !== expected.contentDigest
        )
      })
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { staged: prior.length, kind: rendered.kind }
  }
  await db.assistantWhatsAppOutbox.createMany({ data: chunks })
  if (
    rendered.kind === "workflow_action_review" &&
    workflowReview &&
    principal
  ) {
    const staged = await db.assistantWhatsAppOutbox.findFirstOrThrow({
      where: { inboxId: inbox.id, responseRevision: 1, chunkIndex: 0 },
    })
    await issueAssistantWhatsAppWorkflowReviewInTransaction(db, {
      principal,
      source: workflowReview.source,
      reviewOutboxId: staged.id,
      reviewDigest: staged.contentDigest,
      authorityDigest,
      expiresAt: workflowReview.expiresAt,
      keyVersion: process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1",
      signingKey: process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
      projectCommand: workflowReview.projectCommand,
    })
  }
  if (rendered.kind === "action_review" && exactReview && review && principal) {
    const staged = await db.assistantWhatsAppOutbox.findFirstOrThrow({
      where: { inboxId: inbox.id, responseRevision: 1, chunkIndex: 0 },
    })
    await issueAssistantWhatsAppActionReviewInTransaction(db, {
      principal,
      proposal: {
        id: review.source.proposalId,
        revision: review.source.revision,
        payloadHash: review.source.payloadHash,
        targetRevision: review.targetRevision,
      },
      reviewOutboxId: staged.id,
      reviewDigest: staged.contentDigest,
      authorityDigest,
      expiresAt: review.expiresAt,
      keyVersion: process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1",
      signingKey: process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
    })
  }
  return { staged: chunks.length, kind: rendered.kind }
}

/** Payload TTL does not erase personal provider/run attribution or an uncertain send outcome. */
export async function expireAssistantWhatsAppOutbox(
  db: PrismaClient,
  now = new Date(),
  outboxIds?: readonly string[],
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const rows = await tx.assistantWhatsAppOutbox.findMany({
      where: {
        id: outboxIds ? { in: [...outboxIds] } : undefined,
        expiresAt: { lte: now },
        content: { not: null },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
      select: { id: true, state: true },
    })
    for (const row of rows) {
      if (row.state === "SENDING")
        await tx.assistantWhatsAppAttempt.updateMany({
          where: { outboxId: row.id, state: "STARTED" },
          data: { state: "UNKNOWN", errorCode: "OUTCOME_UNKNOWN_EXPIRED" },
        })
      await tx.assistantWhatsAppOutbox.update({
        where: { id: row.id },
        data: {
          content: null,
          ...(row.state === "PENDING" ? { state: "EXPIRED" as const } : {}),
          ...(row.state === "SENDING"
            ? {
                state: "UNKNOWN" as const,
                errorCode: "OUTCOME_UNKNOWN_EXPIRED",
              }
            : {}),
        },
      })
    }
    return { cleared: rows.length }
  })
}
