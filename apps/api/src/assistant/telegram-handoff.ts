import { renderWhatsAppActionResult } from "@ewatrade/assistant/channels/action-result"
import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import type { GeneralProposal } from "@ewatrade/assistant/general/contracts"
import {
  DirectTelegramBotProvider,
  type TelegramButton,
  readAssistantTelegramConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  type AssistantTelegramHandoffMessage,
  type TelegramInboxLease,
  readAssistantTelegramHandoffMessages,
  stageAssistantTelegramOutbox,
} from "@ewatrade/db/assistant-telegram"
import type { Prisma } from "@ewatrade/db/types"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { telegramAppOrigin } from "./telegram-presentation"

/**
 * Telegram phase 5 · Continue in the app (Workshop telegram-system 02, family 13).
 * A draft too rich for chat is sent as "Review in EwaTrade". When it is approved,
 * cancelled or edited in EwaTrade, that same Telegram message is edited, so the
 * chat keeps no stale button. Presentation only: the decision already committed
 * through the canonical proposal path, and every chat effect is best effort.
 */

export const telegramHandoffCopy = {
  cancelled: "Draft cancelled in EwaTrade. Nothing was saved.",
  updated: "Draft updated in EwaTrade. This button opens the latest version.",
} as const

/** The review link: the saved chat in EwaTrade, focused on the exact draft. */
export function telegramReviewUrl(
  scope: { tenantId: string; storeId: string; conversationId: string },
  proposalId: string,
) {
  const origin = { tenantId: scope.tenantId, storeId: scope.storeId }
  const link = conversationAppLink(
    { purpose: "GENERAL", origin, conversationId: scope.conversationId },
    { trustedAppOrigin: telegramAppOrigin(), currentScope: origin },
  )
  if (!link) return undefined
  const url = new URL(link.href)
  url.searchParams.set("proposalId", proposalId)
  return url.protocol === "https:" ? url.href : undefined
}

/** What the review-link message becomes after a decision in EwaTrade. */
export function telegramHandoffOutcome(
  proposal: Pick<GeneralProposal, "id" | "status" | "receipt" | "payload">,
  message: Pick<
    AssistantTelegramHandoffMessage,
    "tenantId" | "storeId" | "conversationId"
  >,
): { text: string; buttons?: TelegramButton[][] } | null {
  if (proposal.status === "CANCELLED")
    return { text: telegramHandoffCopy.cancelled }
  if (proposal.status === "COMPLETED") {
    try {
      // The same canonical receipt the chat sends after Confirm.
      return { text: renderWhatsAppActionResult(proposal) }
    } catch {
      return null
    }
  }
  if (proposal.status === "PENDING") {
    const url = telegramReviewUrl(message, proposal.id)
    return url
      ? {
          text: telegramHandoffCopy.updated,
          buttons: [[{ text: "Review in EwaTrade", url }]],
        }
      : null
  }
  return null
}

type HandoffBot = Pick<DirectTelegramBotProvider, "editMessageText">

/**
 * After a decision or edit in EwaTrade, edit the newest "Review in EwaTrade"
 * message for that draft. Never throws: the decision has already committed.
 */
export async function showTelegramHandoffOutcome(
  ctx: GeneralContext,
  proposal: Pick<GeneralProposal, "id" | "status" | "receipt" | "payload">,
  {
    config = readAssistantTelegramConfig,
    readMessages = (input) =>
      readAssistantTelegramHandoffMessages(prisma, input),
    bot,
    actor = () => requireGeneralScope(ctx),
  }: {
    config?: typeof readAssistantTelegramConfig
    actor?: () => { userId: string; tenantId: string }
    readMessages?: (
      input: Parameters<typeof readAssistantTelegramHandoffMessages>[1],
    ) => Promise<AssistantTelegramHandoffMessage[]>
    bot?: HandoffBot
  } = {},
) {
  try {
    const current = config()
    if (!current) return false
    const scope = actor()
    if (
      !current.allowedUserIds.has(scope.userId) ||
      !current.allowedTenantIds.has(scope.tenantId)
    )
      return false
    const [message] = (
      await readMessages({
        proposalId: proposal.id,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
      })
    ).filter(({ botId }) => botId === current.botId)
    const outcome = message && telegramHandoffOutcome(proposal, message)
    if (!message || !outcome) return false
    const result = await (
      bot ?? new DirectTelegramBotProvider(current)
    ).editMessageText({
      chatId: message.chatId,
      messageId: message.messageId,
      ...outcome,
    })
    return result.status === "accepted"
  } catch {
    console.error("[assistant] Telegram review-link edit skipped")
    return false
  }
}

/**
 * A new review link for a draft that already had one (a corrected revision):
 * remove the earlier message's button so only the newest link stays tappable.
 */
export async function retireTelegramHandoffLinks(
  tx: Prisma.TransactionClient,
  lease: TelegramInboxLease,
  input: {
    proposalId: string
    tenantId: string
    actorUserId: string
    chatId: string
    messageId: string
  },
) {
  const earlier = await readAssistantTelegramHandoffMessages(tx, {
    proposalId: input.proposalId,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    exceptMessageId: input.messageId,
  })
  for (const message of earlier)
    if (message.chatId === input.chatId)
      await stageAssistantTelegramOutbox(tx, lease, {
        clearKeyboardMessageId: message.messageId,
      })
}
