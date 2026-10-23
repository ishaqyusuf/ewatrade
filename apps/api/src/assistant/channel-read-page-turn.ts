import { whatsAppReadPageContentSchema } from "@ewatrade/assistant/channels/read-pagination"
import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import {
  type AssistantStoredMessage,
  beginAssistantRunInTransaction,
  completeAssistantRunInTransaction,
} from "@ewatrade/db/assistant"
import { readGeneralActiveRun } from "@ewatrade/db/assistant-general"
import {
  type WhatsAppInboxLease,
  resolveAssistantWhatsAppReadPage,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
  resolveLinkedAssistantIdentity,
} from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"
import { createGeneralTools } from "./general-tools"

const READ_MODEL = {
  provider: "deterministic",
  model: "whatsapp-order-read-page-v1",
  promptVersion: "whatsapp-order-read-page-v1",
}
const recovery =
  "This page choice expired or changed. Ask for the orders again, or open this saved chat in EwaTrade. Nothing was changed."
type Inbox = { requestId: string; userMessageId: string; content: unknown }

/** Read-only canonical tool invocation: pagination never enters a model or proposal path. */
export async function processAssistantWhatsAppReadPageTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: Inbox,
): Promise<boolean> {
  const parsed = whatsAppReadPageContentSchema.safeParse(inbox.content)
  const invalid = Boolean(
    inbox.content &&
      typeof inbox.content === "object" &&
      "type" in inbox.content &&
      inbox.content.type === "invalid_read_page",
  )
  if (!parsed.success && !invalid) return false
  if (
    !isLinkedAssistantIdentity(ctx.session) ||
    ctx.session.purpose !== "GENERAL"
  )
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Choose the current business assistant chat.",
    })
  const principal = ctx.session.principal
  const request = parsed.success
    ? await resolveAssistantWhatsAppReadPage(
        ctx.db,
        principal,
        parsed.data.command,
      )
    : undefined
  const answers: GeneralAnswer[] = []
  if (request?.tool === "readOrders") {
    const resolved = await resolveLinkedAssistantIdentity(
      ctx.db,
      principal,
      lease,
    )
    const tools = createGeneralTools(
      ctx,
      resolved.conversation.id,
      () => {
        throw Error("Read pagination cannot create a proposal.")
      },
      (answer) => answers.push(answer),
    )
    const read = tools.readOrders?.execute
    if (read)
      await read(request.input, {
        toolCallId: `${inbox.requestId}-page`,
        messages: [],
      })
  }
  await inFreshGeneralTransaction(ctx, async (fresh) => {
    if (!isLinkedAssistantIdentity(fresh.session))
      throw Error("Linked identity required.")
    const current = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
    await stampAssistantWhatsAppExecution(fresh.db, lease, current)
    // Recheck the actual sent source, current sender/scope and expiry after the read.
    const latest = parsed.success
      ? await resolveAssistantWhatsAppReadPage(
          fresh.db,
          fresh.session.principal,
          parsed.data.command,
        )
      : undefined
    const sameRequest =
      request?.tool === "readOrders" &&
      latest?.tool === "readOrders" &&
      JSON.stringify(request) === JSON.stringify(latest)
    await fresh.db
      .$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${current.conversation.id} FOR UPDATE`
    const active = await readGeneralActiveRun(
      fresh.db,
      current.scope,
      current.conversation.id,
    )
    if (active)
      throw new TRPCError({ code: "CONFLICT", message: "A reply is running." })
    const begun = await beginAssistantRunInTransaction(fresh.db, {
      ...READ_MODEL,
      actorUserId: current.scope.userId,
      conversationId: current.conversation.id,
      requestId: inbox.requestId,
      userMessage: {
        id: inbox.userMessageId,
        role: "user",
        parts: [
          {
            type: "text",
            text:
              parsed.success && parsed.data.command.direction === "previous"
                ? "Previous page of the same orders."
                : "Next page of the same orders.",
          },
        ],
      },
    })
    if (begun.replay) return
    const parts: AssistantStoredMessage["parts"] =
      sameRequest && answers.length
        ? answers.map((data) => ({
            type: "data-general-answer" as const,
            data,
          }))
        : [{ type: "text", text: recovery }]
    await completeAssistantRunInTransaction(fresh.db, {
      ...READ_MODEL,
      runId: begun.run.id,
      tenantId: current.scope.tenantId,
      actorUserId: current.scope.userId,
      status: "COMPLETED",
      assistantMessage: {
        id: `${inbox.requestId}-page-answer`,
        role: "assistant",
        parts,
      },
    })
  })
  return true
}
