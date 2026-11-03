import { whatsAppReplyChoiceContentSchema } from "@ewatrade/assistant/channels/reply-choices"
import {
  beginAssistantRunInTransaction,
  completeAssistantRunInTransaction,
} from "@ewatrade/db/assistant"
import { readGeneralActiveRun } from "@ewatrade/db/assistant-general"
import {
  type WhatsAppInboxLease,
  resolveAssistantWhatsAppReplyChoice,
  resolveAssistantWhatsAppWorkflowReplyChoice,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import { inFreshLinkedWorkflowTransaction } from "./channel-workflow-turn"
import type { GeneralContext } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"
import { processAssistantWhatsAppReviewLinkRecoveryTurn } from "./review-links"
import { requireSetupAssistantScope } from "./setup-context"

type Inbox = { requestId: string; userMessageId: string; content: unknown }
export type WhatsAppReplyChoiceTurnResult =
  | { kind: "none" }
  | { kind: "input"; text: string }
  | { kind: "completed" }
const MODEL = {
  provider: "deterministic",
  model: "whatsapp-reply-choice-v1",
  promptVersion: "whatsapp-reply-choice-v1",
}
const recovery =
  "That option expired, was replaced, or your access changed. Ask the question again, or type your answer here. Nothing was changed."
export const WHATSAPP_WORKFLOW_CHOICE_EXPIRED =
  "That choice expired. Nothing was changed."
const workflowPurposes = new Set(["SETUP", "PRODUCT_CREATE"])

/**
 * A Setup/Product "Review N drafts" tap becomes exactly its saved typed command
 * (`Review drafts k1, k2, k3`). It never confirms, never picks drafts by itself.
 */
async function processWorkflowReplyChoice(
  ctx: GeneralContext,
  inbox: Inbox,
  command:
    | Parameters<typeof resolveAssistantWhatsAppWorkflowReplyChoice>[2]
    | undefined,
): Promise<WhatsAppReplyChoiceTurnResult> {
  if (!isLinkedAssistantIdentity(ctx.session))
    throw new TRPCError({ code: "UNAUTHORIZED" })
  const principal = ctx.session.principal
  const saved = command
    ? await resolveAssistantWhatsAppWorkflowReplyChoice(
        ctx.db,
        principal,
        command,
      )
    : undefined
  return inFreshLinkedWorkflowTransaction<WhatsAppReplyChoiceTurnResult>(
    ctx,
    async (fresh) => {
      if (!isLinkedAssistantIdentity(fresh.session))
        throw new TRPCError({ code: "UNAUTHORIZED" })
      // Re-resolve the exact sent source, binding, authority and drafts after locking.
      const latest = command
        ? await resolveAssistantWhatsAppWorkflowReplyChoice(
            fresh.db,
            fresh.session.principal,
            command,
          )
        : undefined
      if (saved && latest === saved) return { kind: "input", text: latest }
      const conversationId = fresh.assistantConversationId
      if (!conversationId) throw new TRPCError({ code: "UNAUTHORIZED" })
      const scope = requireSetupAssistantScope(fresh)
      if (
        await fresh.db.assistantRun.count({
          where: { conversationId, status: "RUNNING" },
        })
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "A reply is running.",
        })
      const actorUserId = scope.userId
      const begun = await beginAssistantRunInTransaction(fresh.db, {
        ...MODEL,
        actorUserId,
        conversationId,
        requestId: inbox.requestId,
        userMessage: {
          id: inbox.userMessageId,
          role: "user",
          parts: [
            {
              type: "text",
              text: "A WhatsApp reply option could not be accepted.",
            },
          ],
        },
      })
      if (!begun.replay)
        await completeAssistantRunInTransaction(fresh.db, {
          ...MODEL,
          runId: begun.run.id,
          tenantId: scope.tenantId,
          actorUserId,
          status: "COMPLETED",
          assistantMessage: {
            id: `${inbox.requestId}-reply-choice-answer`,
            role: "assistant",
            parts: [{ type: "text", text: WHATSAPP_WORKFLOW_CHOICE_EXPIRED }],
          },
        })
      return { kind: "completed" }
    },
  )
}

/** A saved clarification reply becomes untrusted user text, never approval or tool authority. */
export async function processAssistantWhatsAppReplyChoiceTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: Inbox,
): Promise<WhatsAppReplyChoiceTurnResult> {
  // Fixed review-link replies (New link, Cancel draft, Check status) answer first.
  const recovery = await processAssistantWhatsAppReviewLinkRecoveryTurn(
    ctx,
    lease,
    inbox,
  )
  if (recovery) return recovery
  const parsed = whatsAppReplyChoiceContentSchema.safeParse(inbox.content)
  const invalid = Boolean(
    inbox.content &&
      typeof inbox.content === "object" &&
      "type" in inbox.content &&
      ["reply_choice", "invalid_reply_choice"].includes(
        String(inbox.content.type),
      ),
  )
  if (!parsed.success && !invalid) return { kind: "none" }
  if (
    isLinkedAssistantIdentity(ctx.session) &&
    workflowPurposes.has(ctx.session.purpose)
  )
    return processWorkflowReplyChoice(
      ctx,
      inbox,
      parsed.success ? parsed.data.command : undefined,
    )
  if (
    !isLinkedAssistantIdentity(ctx.session) ||
    ctx.session.purpose !== "GENERAL"
  )
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Choose the current business assistant chat.",
    })
  const saved = parsed.success
    ? await resolveAssistantWhatsAppReplyChoice(
        ctx.db,
        ctx.session.principal,
        parsed.data.command,
      )
    : undefined
  return inFreshGeneralTransaction<WhatsAppReplyChoiceTurnResult>(
    ctx,
    async (fresh) => {
      if (
        !isLinkedAssistantIdentity(fresh.session) ||
        fresh.session.purpose !== "GENERAL"
      )
        throw new TRPCError({ code: "UNAUTHORIZED" })
      const current = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
      await stampAssistantWhatsAppExecution(fresh.db, lease, current)
      // Re-resolve exact sent source, current binding, authority and expiry after locking.
      const latest = parsed.success
        ? await resolveAssistantWhatsAppReplyChoice(
            fresh.db,
            fresh.session.principal,
            parsed.data.command,
          )
        : undefined
      if (saved && latest === saved) return { kind: "input", text: latest }
      await fresh.db
        .$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${current.conversation.id} FOR UPDATE`
      const active = await readGeneralActiveRun(
        fresh.db,
        current.scope,
        current.conversation.id,
      )
      if (active)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A reply is running.",
        })
      const begun = await beginAssistantRunInTransaction(fresh.db, {
        ...MODEL,
        actorUserId: current.scope.userId,
        conversationId: current.conversation.id,
        requestId: inbox.requestId,
        userMessage: {
          id: inbox.userMessageId,
          role: "user",
          parts: [
            {
              type: "text",
              text: "A WhatsApp reply option could not be accepted.",
            },
          ],
        },
      })
      if (!begun.replay)
        await completeAssistantRunInTransaction(fresh.db, {
          ...MODEL,
          runId: begun.run.id,
          tenantId: current.scope.tenantId,
          actorUserId: current.scope.userId,
          status: "COMPLETED",
          assistantMessage: {
            id: `${inbox.requestId}-reply-choice-answer`,
            role: "assistant",
            parts: [{ type: "text", text: recovery }],
          },
        })
      return { kind: "completed" }
    },
  )
}
