import { whatsAppReplyChoiceContentSchema } from "@ewatrade/assistant/channels/reply-choices"
import {
  beginAssistantRunInTransaction,
  completeAssistantRunInTransaction,
} from "@ewatrade/db/assistant"
import { readGeneralActiveRun } from "@ewatrade/db/assistant-general"
import {
  type WhatsAppInboxLease,
  resolveAssistantWhatsAppReplyChoice,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

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

/** A saved clarification reply becomes untrusted user text, never approval or tool authority. */
export async function processAssistantWhatsAppReplyChoiceTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: Inbox,
): Promise<WhatsAppReplyChoiceTurnResult> {
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
