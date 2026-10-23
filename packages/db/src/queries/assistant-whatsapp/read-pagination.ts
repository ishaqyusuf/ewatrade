import {
  WHATSAPP_READ_PAGE_LIFETIME_MS,
  type WhatsAppReadPageCommand,
  previousWhatsAppReadRequest,
  whatsAppOrderReadContinuation,
  whatsAppReadPageButtons,
  whatsAppReadPageCommandSchema,
} from "@ewatrade/assistant/channels/read-pagination"
import {
  type GeneralReadContinuation,
  nextGeneralReadRequest,
} from "@ewatrade/assistant/general/read-continuation"
import type { DbClient } from "../types"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"

async function committedContinuation(
  db: DbClient,
  input: { messageId: string; conversationId: string; userId: string },
) {
  const run = await db.assistantRun.findFirst({
    where: {
      status: "COMPLETED",
      actorUserId: input.userId,
      conversationId: input.conversationId,
      assistantMessageId: input.messageId,
      assistantMessage: {
        role: "assistant",
        conversationId: input.conversationId,
      },
    },
    select: { assistantMessage: { select: { parts: true } } },
  })
  return whatsAppOrderReadContinuation(run?.assistantMessage?.parts)
}
async function earlierContinuations(
  db: DbClient,
  input: {
    bindingId: string
    sequence: number
    conversationId: string
    userId: string
    authorityDigest: string
    now: Date
  },
) {
  const rows = await db.assistantWhatsAppOutbox.findMany({
    where: {
      inbox: {
        bindingId: input.bindingId,
        kind: "TURN",
        sequence: { lt: input.sequence },
        state: "COMPLETED",
      },
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "reply",
      authorityDigest: input.authorityDigest,
      sentAt: {
        gt: new Date(input.now.getTime() - WHATSAPP_READ_PAGE_LIFETIME_MS),
      },
      messageId: { not: null },
    },
    orderBy: [{ inbox: { sequence: "desc" } }, { chunkIndex: "desc" }],
    take: 24,
    select: { messageId: true },
  })
  const continuations: GeneralReadContinuation[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.messageId || seen.has(row.messageId)) continue
    seen.add(row.messageId)
    const continuation = await committedContinuation(db, {
      ...input,
      messageId: row.messageId,
    })
    if (continuation) continuations.push(continuation)
  }
  return continuations
}

/** Called only after normal delivery authority validation; native payload is display-only. */
export async function assistantWhatsAppReadPaginationButtons(
  db: DbClient,
  input: {
    outboxId: string
    bindingId: string
    sequence: number
    messageId: string
    conversationId: string
    userId: string
    authorityDigest: string
    now: Date
  },
) {
  const current = await committedContinuation(db, input)
  if (!current) return []
  const earlier =
    current.tool === "readOrders" && current.input.cursor
      ? await earlierContinuations(db, input)
      : []
  return whatsAppReadPageButtons(
    input.outboxId,
    current,
    Boolean(previousWhatsAppReadRequest(current, earlier)),
  )
}

/** Native and quoted typed choices resolve only a current saved read; never client tool text. */
export async function resolveAssistantWhatsAppReadPage(
  db: DbClient,
  principal: WhatsAppConversationPrincipal,
  rawCommand: WhatsAppReadPageCommand,
  now = new Date(),
) {
  const command = whatsAppReadPageCommandSchema.safeParse(rawCommand)
  if (!command.success) return
  const resolved = await resolveAssistantWhatsAppConversation(
    db,
    principal,
    now,
  )
  if (resolved.conversation.purpose !== "GENERAL") return
  const digest = await assistantWhatsAppAuthorityDigest(db, resolved)
  const source = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      ...(command.data.sourceOutboxId
        ? { id: command.data.sourceOutboxId }
        : {}),
      providerMessageId: command.data.replyToMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      inbox: {
        bindingId: principal.bindingId,
        kind: "TURN",
        state: "COMPLETED",
      },
      deliveryAttempts: {
        some: {
          state: "ACCEPTED",
          providerMessageId: command.data.replyToMessageId,
        },
      },
      renderKind: "reply",
      authorityDigest: digest,
      sentAt: {
        gt: new Date(now.getTime() - WHATSAPP_READ_PAGE_LIFETIME_MS),
      },
      expiresAt: { gt: now },
    },
    include: { inbox: { select: { sequence: true } } },
  })
  if (!source?.messageId || source.chunkIndex !== source.chunkCount - 1) return
  const current = await committedContinuation(db, {
    messageId: source.messageId,
    userId: resolved.scope.userId,
    conversationId: resolved.conversation.id,
  })
  if (!current) return
  if (command.data.direction === "next") return nextGeneralReadRequest(current)
  return previousWhatsAppReadRequest(
    current,
    await earlierContinuations(db, {
      bindingId: principal.bindingId,
      sequence: source.inbox.sequence,
      conversationId: resolved.conversation.id,
      userId: resolved.scope.userId,
      authorityDigest: digest,
      now,
    }),
  )
}
