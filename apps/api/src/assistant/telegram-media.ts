import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import type {
  AssistantTelegramConfig,
  NormalizedAssistantTelegramUpdate,
  TelegramButton,
  TelegramMedia,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import { readAssistantTelegramChatScope } from "@ewatrade/db/assistant-telegram"
import {
  openEwaTradeButtons,
  telegramAppOrigin,
  telegramCopy,
} from "./telegram-presentation"
import type { TelegramNotice } from "./telegram-runtime"

/**
 * Telegram phase 5 · media (Workshop telegram-system 02, f-today and v-today).
 * The bot reads only text. A photo, file, album, video or voice note from a
 * connected chat gets one text reply that quotes it; nothing is downloaded,
 * stored or passed to the assistant, and captions are not read.
 */

type MediaUpdate = Extract<NormalizedAssistantTelegramUpdate, { kind: "media" }>

const textOnly = "I can only read text messages here for now."

export function telegramMediaReply(media: TelegramMedia, album: boolean) {
  if (media.media === "voice" || media.media === "video_note")
    return `${textOnly} Please type it instead.`
  if (!media.attachable)
    return `${textOnly} The same chat in EwaTrade accepts photos and PDFs.`
  const noun = media.media === "photo" ? "photo" : "file"
  return `${textOnly} Open this same chat in EwaTrade to attach your ${noun}${album ? "s" : ""}.`
}

const albumWindowMs = 60_000
const albumLimit = 2_000
const answeredAlbums = new Map<string, number>()

/**
 * Album items arrive as separate updates with one media_group_id. Answer the
 * first one this process sees. Best effort: kept in memory only, so separate
 * API instances or a restart within a minute can each answer once.
 */
export function claimTelegramAlbumReply(key: string, now = Date.now()) {
  for (const [album, at] of answeredAlbums) {
    if (now - at <= albumWindowMs) break
    answeredAlbums.delete(album)
  }
  const answeredAt = answeredAlbums.get(key)
  if (answeredAt !== undefined && now - answeredAt <= albumWindowMs)
    return false
  answeredAlbums.delete(key)
  if (answeredAlbums.size >= albumLimit)
    answeredAlbums.delete(answeredAlbums.keys().next().value as string)
  answeredAlbums.set(key, now)
  return true
}

function openChatButtons(scope: {
  tenantId: string
  storeId: string
  conversationId: string
}): TelegramButton[][] | undefined {
  const origin = { tenantId: scope.tenantId, storeId: scope.storeId }
  const link = conversationAppLink(
    { purpose: "GENERAL", origin, conversationId: scope.conversationId },
    { trustedAppOrigin: telegramAppOrigin(), currentScope: origin },
  )
  // Telegram rejects non-HTTPS URL buttons, so local origins get text only.
  return link && new URL(link.href).protocol === "https:"
    ? [[{ text: "Open chat in EwaTrade", url: link.href }]]
    : undefined
}

export async function acceptAssistantTelegramMedia(
  config: AssistantTelegramConfig,
  event: MediaUpdate,
  {
    readScope = readAssistantTelegramChatScope,
    notConnected = async () => ({
      text: telegramCopy.entry,
      buttons: openEwaTradeButtons(),
    }),
  }: {
    readScope?: typeof readAssistantTelegramChatScope
    /** Not connected: the runtime's ended-access or entry reply. */
    notConnected?: () => Promise<TelegramNotice>
  } = {},
): Promise<{ notice?: TelegramNotice }> {
  if (!config.enabled) return {}
  // Claimed before any await, so concurrent album items cannot both answer.
  if (
    event.mediaGroupId &&
    !claimTelegramAlbumReply(
      `${config.botId}:${event.chatId}:${event.mediaGroupId}`,
    )
  )
    return {}
  const scope = await readScope(prisma, {
    botId: config.botId,
    userId: event.userId,
    chatId: event.chatId,
  })
  if (!scope) return { notice: await notConnected() }
  // Connected but outside the pilot: stay silent, as for text.
  if (
    !config.allowedUserIds.has(scope.userId) ||
    !config.allowedTenantIds.has(scope.tenantId)
  )
    return {}
  const voice = event.media === "voice" || event.media === "video_note"
  return {
    notice: {
      text: telegramMediaReply(event, Boolean(event.mediaGroupId)),
      buttons: voice ? undefined : openChatButtons(scope),
      replyTo: event.messageId,
    },
  }
}
