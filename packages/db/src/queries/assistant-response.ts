import type { DbClient } from "./types"

/** Navigation metadata only, selected under the real conversation owner. */
export function readAssistantResponseSource(
  db: DbClient,
  userId: string,
  messageId: string,
) {
  return db.assistantMessage.findFirst({
    where: {
      id: messageId,
      role: "assistant",
      conversation: {
        ownerUserId: userId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      conversation: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          tenant: { select: { slug: true } },
        },
      },
    },
  })
}

/** Caller has already read the canonical actor/Store-scoped General conversation. */
export async function readAssistantResponseMessages(
  db: DbClient,
  conversationId: string,
  messageId: string,
) {
  const saved = await db.assistantMessage.findFirst({
    where: { id: messageId, conversationId, role: "assistant" },
    select: {
      id: true,
      role: true,
      parts: true,
      sequence: true,
      createdAt: true,
      completedRun: { select: { requestId: true } },
    },
  })
  if (!saved) return null
  const { completedRun, ...message } = saved
  if (!completedRun) return { message, question: null }
  const question = await db.assistantMessage.findFirst({
    where: {
      conversationId,
      role: "user",
      clientRequestId: completedRun.requestId,
      sequence: { lt: message.sequence },
    },
    orderBy: { sequence: "desc" },
    select: {
      id: true,
      role: true,
      parts: true,
      sequence: true,
      createdAt: true,
    },
  })
  return { message, question }
}
