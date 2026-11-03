import { z } from "zod"
import { conversationAppLink } from "./conversation-links"
import { whatsAppPlainText } from "./render"
import { workflowConversationAppLink } from "./workflow"

export const WHATSAPP_NOTICE_VERSION = "whatsapp-notice-v1"
export const whatsAppNoticeCodeSchema = z.enum([
  "WORKFLOW_NOT_READY",
  "MEDIA_DISABLED",
  "MEDIA_FAILED",
  "MEDIA_UNSUPPORTED",
  "MEDIA_TOO_LARGE",
  "VOICE_FAILED",
  "VOICE_UNAVAILABLE",
  "VOICE_INVALID",
  "VOICE_CANCELLED",
  "TRANSPORT_RATE_LIMITED",
  "ASSISTANT_UNAVAILABLE",
  "REPLY_WINDOW_MISSED",
])
export const whatsAppNoticeContentSchema = z
  .object({ type: z.literal("channel_notice"), code: whatsAppNoticeCodeSchema })
  .strict()
export type WhatsAppNoticeCode = z.infer<typeof whatsAppNoticeCodeSchema>
const notices: Record<WhatsAppNoticeCode, string> = {
  WORKFLOW_NOT_READY:
    "Continue this Setup or Product draft in EwaTrade. This workflow is not available in WhatsApp yet.",
  MEDIA_DISABLED:
    "Attachments are not available in WhatsApp yet. Open this same chat in EwaTrade to attach your file.",
  MEDIA_FAILED:
    "This attachment could not be processed in WhatsApp. Open this same chat in EwaTrade and attach the original file again.",
  MEDIA_UNSUPPORTED:
    "This file type or processing mode is not supported in WhatsApp. Open this same chat in EwaTrade to attach a supported file, or use Import for a larger list.",
  MEDIA_TOO_LARGE:
    "⚠️ That file is too large for WhatsApp. Attach it in this same chat in EwaTrade, or use Import for a spreadsheet. You check every row there before anything is added.\n\n_Nothing was saved._",
  VOICE_FAILED:
    "🎙️ I couldn't make out that voice note. Nothing was done.\nType it, or record again somewhere quieter.",
  VOICE_UNAVAILABLE:
    "⏳ Voice notes are paused right now. Nothing was done.\nType your message. Everything else works as usual.",
  VOICE_INVALID:
    "Reply to the original voice transcript with Use transcript, Edit transcript: followed by your corrected text, or Cancel transcript. If it expired, send a new voice note.",
  VOICE_CANCELLED:
    "Voice note cancelled. Its transcript was not sent as an assistant request.",
  TRANSPORT_RATE_LIMITED:
    "This WhatsApp connection has reached its message limit. Try again later, or continue this saved chat in EwaTrade. No new assistant request or action was started by this message.",
  ASSISTANT_UNAVAILABLE:
    "⚠️ I can't reach your business data right now. Nothing was changed.\nTry again in a minute.",
  REPLY_WINDOW_MISSED:
    "👋 Welcome back. My last reply couldn't be delivered because the chat was quiet for over 24 hours. Ask again and I'll answer.",
}

/**
 * Terminal turn failures that mean the assistant itself could not answer.
 * Retries never reach here; budget, authority, workflow and bad-input
 * outcomes keep their own handling and are not described as an outage.
 */
const unavailableTurnFailures = new Set([
  "ATTEMPTS_EXHAUSTED",
  "ASSISTANT_UNAVAILABLE",
  "TURN_FAILED",
  "TURN_INTERRUPTED",
  "STREAM_FAILED",
  "ABORTED",
  "FINALIZATION_FAILED",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
])
export function whatsAppTurnFailureNotice(
  errorCode: string | null | undefined,
): WhatsAppNoticeCode | undefined {
  return errorCode && unavailableTurnFailures.has(errorCode)
    ? "ASSISTANT_UNAVAILABLE"
    : undefined
}

/** Fixed notice codes only; raw adapter messages never enter persisted replies. */
export function whatsAppMediaRefusalNotice(code: string): WhatsAppNoticeCode {
  if (code === "MEDIA_DISABLED") return "MEDIA_DISABLED"
  if (code === "UNSUPPORTED_MEDIA" || code === "MEDIA_NOT_AVAILABLE")
    return "MEDIA_UNSUPPORTED"
  if (code === "MEDIA_TOO_LARGE") return "MEDIA_TOO_LARGE"
  if (code === "VOICE_UNAVAILABLE") return "VOICE_UNAVAILABLE"
  if (code === "INVALID_AUDIO" || code === "TRANSCRIPTION_FAILED")
    return "VOICE_FAILED"
  return "MEDIA_FAILED"
}
/** Voice and failure notices ask for a retry in WhatsApp; the app link would only distract. */
const withoutAppLink = new Set<WhatsAppNoticeCode>([
  "VOICE_FAILED",
  "VOICE_UNAVAILABLE",
  "VOICE_CANCELLED",
  "ASSISTANT_UNAVAILABLE",
  "REPLY_WINDOW_MISSED",
])
/** A preface sent right before a scoped reply; that reply already names the business and Store. */
const withoutScopeLabel = new Set<WhatsAppNoticeCode>(["REPLY_WINDOW_MISSED"])
export function renderWhatsAppNotice(
  code: WhatsAppNoticeCode,
  scope: {
    businessName: string
    storeName: string
    tenantId: string
    storeId: string
    conversationId: string
    purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE"
  },
  trustedAppOrigin: string,
) {
  const origin = { tenantId: scope.tenantId, storeId: scope.storeId }
  const target = {
    conversationId: scope.conversationId,
    purpose: scope.purpose,
    origin,
  }
  const link =
    scope.purpose === "GENERAL"
      ? conversationAppLink(target, { currentScope: origin, trustedAppOrigin })
      : workflowConversationAppLink(
          { ...target, purpose: scope.purpose },
          { currentScope: origin, trustedAppOrigin },
        )
  if (withoutScopeLabel.has(code)) return notices[code]
  const business = whatsAppPlainText(scope.businessName)
  const store = whatsAppPlainText(scope.storeName)
  const href = withoutAppLink.has(code)
    ? undefined
    : typeof link === "string"
      ? link
      : link?.href
  const body = `${business} · ${store}\n\n${notices[code]}${href ? `\nSelect this original business and Store.\nOpen saved chat in EwaTrade: ${href}` : ""}`
  return body.length <= 3000 ? body : notices[code]
}
