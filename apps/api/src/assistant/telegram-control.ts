import { createHmac, timingSafeEqual } from "node:crypto"
import {
  type AssistantTelegramConfig,
  type DirectTelegramBotProvider,
  type NormalizedAssistantTelegramUpdate,
  type TelegramButton,
  escapeTelegramHtml,
  isAssistantTelegramDisconnect,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  type AssistantTelegramDraftState,
  disconnectAssistantTelegram,
  readAssistantTelegramConnection,
  readAssistantTelegramStoppedChatMessage,
} from "@ewatrade/db/assistant-telegram"
import { isWhatsAppCredentialSubmission } from "../communications/whatsapp-credential-guard"
import {
  type TelegramChatEffects,
  openEwaTradeButtons,
  showTelegramDisconnected,
  telegramAppOrigin,
} from "./telegram-presentation"
import type { TelegramNotice } from "./telegram-runtime"

/**
 * Workshop 02 · Telegram-native, phase 6: control and safety (families 14–15).
 * Access still changes only through the revoke query; everything here is copy,
 * a signed confirmation step and best-effort chat effects.
 */

export type TelegramControlEffects = TelegramChatEffects &
  Pick<DirectTelegramBotProvider, "deleteMessage">

export type TelegramControlReceipt = {
  notice?: TelegramNotice
  /** Chat effects that need no new message, e.g. editing the tapped message. */
  effects?: (bot: TelegramControlEffects) => Promise<unknown>
}

type Business = { businessName: string; storeName: string }
type ConnectedMessage = Business & { chatId: string; messageId: string }

const scope = (business: Business) =>
  `<b>${escapeTelegramHtml(`${business.businessName} · ${business.storeName}`)}</b>`

export const telegramControlCopy = {
  askDisconnect: (business: Business) =>
    `<b>Disconnect Telegram?</b>\nThis chat will stop working with ${scope(business)}.\n\nChats and drafts stay in EwaTrade.`,
  kept: (business: Business) => `Still connected to ${scope(business)}.`,
  disconnected: (businessName: string) =>
    `<b>Telegram disconnected from EwaTrade ✓</b>\nThis chat can't use <b>${escapeTelegramHtml(businessName)}</b> any more, and older buttons here won't work.\n\nChats and drafts stay in EwaTrade. Connect again from there anytime.`,
  /** Plain fallback when Telegram is switched off: disconnect still works at once. */
  disconnectedPlain: "Telegram disconnected from EwaTrade.",
  notConnected: "This chat isn't connected to EwaTrade. Nothing changed.",
  askExpired:
    "This question expired. Nothing changed. Send /disconnect again if you still want to disconnect.",
  password:
    "I deleted your last message. Please don't send passwords here — EwaTrade never asks for them, and I didn't use it.\n\nIf it's your real password, change it in EwaTrade now.",
  forwardedReview:
    "Forwarded reviews can't be confirmed here. Only the person who asked for a draft can confirm it, in their own chat. Nothing was changed.",
} as const

// ---------- signed Disconnect / Keep connected callbacks ----------

const askLifetimeMs = 15 * 60_000
const controlPattern = /^tgx:([dk]):([0-9a-z]{1,10}):([A-Za-z0-9_-]{22})$/

/** Callback data in the control namespace (`tgx:`), signed or not. */
export const isTelegramControlCallback = (data: string) =>
  data.startsWith("tgx:")

type Chat = { botId: string; chatId: string; userId: string }
type ControlAction = "d" | "k"

function controlMac(
  config: Pick<AssistantTelegramConfig, "token">,
  chat: Chat,
  action: ControlAction,
  issued: string,
) {
  const key = createHmac("sha256", config.token)
    .update("ewatrade.telegram.control.v1")
    .digest()
  return createHmac("sha256", key)
    .update(`${chat.botId}|${chat.chatId}|${chat.userId}|${action}|${issued}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url")
}

/** Bound to this bot, chat and user, so a forwarded copy cannot act elsewhere. */
export function signTelegramControl(
  config: Pick<AssistantTelegramConfig, "token">,
  chat: Chat,
  action: ControlAction,
  now = new Date(),
) {
  const issued = Math.floor(now.getTime() / 1000).toString(36)
  return `tgx:${action}:${issued}:${controlMac(config, chat, action, issued)}`
}

export function verifyTelegramControl(
  config: Pick<AssistantTelegramConfig, "token">,
  chat: Chat,
  data: string,
  now = new Date(),
): { action: ControlAction; expired: boolean } | null {
  const match = controlPattern.exec(data)
  const action = match?.[1]
  const issued = match?.[2]
  const mac = match?.[3]
  if ((action !== "d" && action !== "k") || !issued || !mac) return null
  const expected = Buffer.from(controlMac(config, chat, action, issued))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null
  const issuedAt = Number.parseInt(issued, 36) * 1000
  return {
    action,
    expired:
      !Number.isSafeInteger(issuedAt) ||
      issuedAt > now.getTime() + 30_000 ||
      issuedAt <= now.getTime() - askLifetimeMs,
  }
}

// ---------- safety ----------

/** Telegram rejects non-HTTPS URL buttons, so local origins get text only. */
function changePasswordButtons(): TelegramButton[][] | undefined {
  // EwaTrade changes a password through the emailed reset flow.
  const url = new URL("/forgot-password", telegramAppOrigin())
  return url.protocol === "https:"
    ? [[{ text: "Change password", url: url.href }]]
    : undefined
}

/** A forwarded copy of an EwaTrade draft review (s-forward). */
export function isForwardedTelegramReview(
  event: Extract<NormalizedAssistantTelegramUpdate, { kind: "message" }>,
) {
  if (!event.forward) return false
  const text = event.text
  return (
    /^Review expires:/m.test(text) ||
    /^Draft(?: revision:)? \d+\b/m.test(text) ||
    (/^Business: /m.test(text) && /^Store: /m.test(text))
  )
}

// ---------- typed confirm / cancel (k-cancel, k-cancel-draft, s-old) ----------

export function telegramTypedDecision(text: string) {
  if (/^cancel[.!]*$/i.test(text)) return "cancel" as const
  if (
    /^(?:proceed|confirm|yes|go ahead|done|save(?: it| sale)?)[.!]*$/i.test(
      text,
    )
  )
    return "confirm" as const
  return null
}

/** Typed words never decide a review; this only explains what to do instead. */
export function telegramTypedDecisionReply(
  decision: "confirm" | "cancel",
  state: AssistantTelegramDraftState["state"],
  scopeLabel: string,
) {
  const rule = "Typed words never confirm or cancel a review."
  if (state === "open")
    return decision === "cancel"
      ? `Tap Cancel on the draft review to cancel it. ${rule}`
      : `Tap Confirm on the draft review to save it. ${rule}`
  if (decision === "confirm")
    return state === "cancelled"
      ? "That draft was cancelled, so there's nothing to confirm. Nothing was saved.\n\nSend your request again for a new review."
      : "There's nothing to confirm right now. Describe the change you want and I'll send a draft to review."
  return `There's nothing to cancel right now. This chat is still connected to ${scopeLabel}.\n\nTo remove Telegram access, send /disconnect.`
}

// ---------- webhook hook ----------

type DisconnectResult = {
  revoked: boolean
  connectedMessage?: ConnectedMessage | null
}

export type TelegramControlDependencies = {
  disconnect: (
    input: Chat & { updateId?: string; messageId?: string; occurredAt?: Date },
  ) => Promise<DisconnectResult>
  readConnection: (chat: Chat) => Promise<Business | null>
  readStoppedChatMessage: (chat: Chat) => Promise<ConnectedMessage | null>
  now: () => Date
}

const defaultDependencies: TelegramControlDependencies = {
  disconnect: (input) => disconnectAssistantTelegram(prisma, input),
  readConnection: (chat) => readAssistantTelegramConnection(prisma, chat),
  readStoppedChatMessage: (chat) =>
    readAssistantTelegramStoppedChatMessage(prisma, chat),
  now: () => new Date(),
}

const settle = (effects: Promise<unknown>[]) => Promise.allSettled(effects)

/**
 * Control and safety updates handled straight from the webhook. Returns null
 * when the update is ordinary assistant input.
 */
export async function acceptTelegramControl(
  config: AssistantTelegramConfig,
  event: NormalizedAssistantTelegramUpdate,
  deps: TelegramControlDependencies = defaultDependencies,
): Promise<TelegramControlReceipt | null> {
  const chat = {
    botId: config.botId,
    userId: event.userId,
    chatId: event.chatId,
  }

  // k-stop: Stop bot revokes at once. While blocked the bot can't edit the chat,
  // so the Connected message is marked and unpinned on RESTART instead.
  if (event.kind === "member") {
    if (event.status === "stopped") {
      await deps.disconnect({
        ...chat,
        updateId: event.updateId,
        occurredAt: event.occurredAt,
      })
      return {}
    }
    const connected = await deps.readStoppedChatMessage(chat)
    return connected
      ? {
          effects: (bot) =>
            showTelegramDisconnected(bot, event.chatId, connected),
        }
      : {}
  }

  if (event.kind === "callback") {
    if (!isTelegramControlCallback(event.data)) return null
    const now = deps.now()
    const verified = verifyTelegramControl(config, chat, event.data, now)
    if (!verified) return {}
    const tapped = { chatId: event.chatId, messageId: event.messageId }
    const editTapped = (
      text: string,
      buttons?: TelegramButton[][],
      also?: (bot: TelegramControlEffects) => Promise<unknown>,
    ): TelegramControlReceipt => ({
      effects: (bot) =>
        settle([
          bot.editMessageText({ ...tapped, text, html: true, buttons }),
          ...(also ? [also(bot)] : []),
        ]),
    })
    if (verified.expired) return editTapped(telegramControlCopy.askExpired)
    const business = await deps.readConnection(chat)
    if (verified.action === "k")
      return editTapped(
        business
          ? telegramControlCopy.kept(business)
          : telegramControlCopy.notConnected,
      )
    const result = await deps.disconnect({
      ...chat,
      updateId: event.updateId,
      messageId: event.messageId,
      occurredAt: now,
    })
    if (!result.revoked) return editTapped(telegramControlCopy.notConnected)
    const connected = result.connectedMessage ?? null
    const name = business?.businessName ?? connected?.businessName
    return editTapped(
      name
        ? telegramControlCopy.disconnected(name)
        : telegramControlCopy.disconnectedPlain,
      name ? openEwaTradeButtons() : undefined,
      (bot) => showTelegramDisconnected(bot, event.chatId, connected),
    )
  }

  if (event.kind !== "message") return null
  const text = event.text.trim()
  // k-disc: ask first while Telegram is on and the chat is connected.
  if (isAssistantTelegramDisconnect(text)) {
    const business = config.enabled ? await deps.readConnection(chat) : null
    if (business) {
      const now = deps.now()
      return {
        notice: {
          text: telegramControlCopy.askDisconnect(business),
          html: true,
          buttons: [
            [
              {
                text: "Disconnect",
                callbackData: signTelegramControl(config, chat, "d", now),
              },
            ],
            [
              {
                text: "Keep connected",
                callbackData: signTelegramControl(config, chat, "k", now),
              },
            ],
          ],
        },
      }
    }
    // Switched off or not connected: revoke at once, as before (plain text).
    const result = await deps.disconnect({
      ...chat,
      updateId: event.updateId,
      messageId: event.messageId,
      occurredAt: event.occurredAt,
    })
    return result.revoked
      ? {
          notice: {
            text: telegramControlCopy.disconnectedPlain,
            after: (bot) =>
              showTelegramDisconnected(
                bot,
                event.chatId,
                result.connectedMessage ?? null,
              ),
          },
        }
      : {}
  }
  if (!config.enabled) return null

  // s-pw: credential content and its digest stay outside the durable inbox.
  // The message is deleted from the chat and the user is told why.
  if (isWhatsAppCredentialSubmission(text)) {
    const sent = { chatId: event.chatId, messageId: event.messageId }
    return {
      notice: {
        text: telegramControlCopy.password,
        buttons: changePasswordButtons(),
      },
      effects: (bot) => bot.deleteMessage(sent),
    }
  }

  // s-forward: a forwarded review is never assistant input. Its buttons stay
  // bound to the original chat and message, so it cannot be confirmed either.
  if (isForwardedTelegramReview(event))
    return { notice: { text: telegramControlCopy.forwardedReview } }

  return null
}
