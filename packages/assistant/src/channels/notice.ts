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
  "VOICE_INVALID",
  "VOICE_CANCELLED",
  "TRANSPORT_RATE_LIMITED",
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
  VOICE_INVALID:
    "Reply to the original voice transcript with Use transcript, Edit transcript: followed by your corrected text, or Cancel transcript. If it expired, send a new voice note.",
  VOICE_CANCELLED:
    "Voice note cancelled. Its transcript was not sent as an assistant request.",
  TRANSPORT_RATE_LIMITED:
    "This WhatsApp connection has reached its message limit. Try again later, or continue this saved chat in EwaTrade. No new assistant request or action was started by this message.",
}

/** Fixed notice codes only; raw adapter messages never enter persisted replies. */
export function whatsAppMediaRefusalNotice(code: string): WhatsAppNoticeCode {
  if (code === "MEDIA_DISABLED") return "MEDIA_DISABLED"
  if (code === "UNSUPPORTED_MEDIA" || code === "MEDIA_NOT_AVAILABLE")
    return "MEDIA_UNSUPPORTED"
  return "MEDIA_FAILED"
}
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
  const business = whatsAppPlainText(scope.businessName)
  const store = whatsAppPlainText(scope.storeName)
  const href = typeof link === "string" ? link : link?.href
  const body = `${business} · ${store}\n\n${notices[code]}${href ? `\nSelect this original business and Store.\nOpen saved chat in EwaTrade: ${href}` : ""}`
  return body.length <= 3000 ? body : notices[code]
}
