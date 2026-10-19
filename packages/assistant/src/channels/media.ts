import { z } from "zod"
import {
  SETUP_ATTACHMENT_LIMITS,
  sanitizeSetupAttachmentName,
  setupAttachmentExtension,
  setupAttachmentKind,
} from "../setup/attachments"
import { whatsAppPlainText } from "./render"

/** Provider metadata only: private download URLs and credentials are forbidden. */
export const whatsAppMediaSchema = z
  .object({
    id: z.string().min(1).max(256),
    mediaType: z.string().min(1).max(128),
    sourceType: z.enum(["image", "document", "audio"]).optional(),
    fileName: z.string().max(120).optional(),
    sha256: z
      .string()
      .regex(/^(?:[a-fA-F0-9]{64}|[A-Za-z0-9+/]{43}=)$/)
      .optional(),
    voice: z.boolean().optional(),
  })
  .strict()
export type WhatsAppMedia = z.infer<typeof whatsAppMediaSchema>

export const whatsAppMediaContentSchema = z
  .object({
    type: z.literal("media"),
    media: whatsAppMediaSchema,
    text: z.string().max(8000).optional(),
    replyToMessageId: z.string().min(1).max(256).optional(),
    /** Internal canonical pointer, pinned by DB after source/lease verification; never normalized from Meta. */
    attachmentId: z.string().min(1).max(64).optional(),
  })
  .strict()

export const WHATSAPP_MEDIA_UNSUPPORTED =
  "This file type is not supported in WhatsApp. Open the original chat in EwaTrade to attach a supported file or use Import for a larger list."
export const WHATSAPP_MEDIA_FAILED =
  "This attachment could not be processed. Open the original chat in EwaTrade to review or retry it."

export function whatsAppMediaPolicy(media: WhatsAppMedia) {
  const contentType =
    media.mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  const kind = setupAttachmentKind(contentType)
  if (
    !kind ||
    (media.sourceType === "audio" && kind !== "AUDIO") ||
    (media.sourceType === "image" && kind !== "IMAGE") ||
    (kind === "AUDIO" && media.sourceType !== "audio")
  )
    return null
  return {
    kind,
    contentType,
    maxBytes: SETUP_ATTACHMENT_LIMITS[kind].maxBytes,
    fileName: sanitizeSetupAttachmentName(
      media.fileName ??
        `WhatsApp attachment.${setupAttachmentExtension(contentType)}`,
    ),
  }
}

export const WHATSAPP_VOICE_REVIEW_VERSION = "whatsapp-voice-review-v1"
export const WHATSAPP_VOICE_REVIEW_MAX_CHARS = 2000
export const whatsAppVoiceChoiceSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("use"),
      replyToMessageId: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      decision: z.literal("cancel"),
      replyToMessageId: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      decision: z.literal("edit"),
      replyToMessageId: z.string().min(1).max(256),
      text: z.string().trim().min(1).max(8000),
    })
    .strict(),
])
export type WhatsAppVoiceChoice = z.infer<typeof whatsAppVoiceChoiceSchema>
export const whatsAppVoiceChoiceContentSchema = z
  .object({
    type: z.literal("voice_choice"),
    choice: whatsAppVoiceChoiceSchema,
  })
  .strict()
export const whatsAppVoiceReviewContentSchema = z
  .object({
    type: z.literal("voice_review"),
    source: whatsAppMediaContentSchema,
    review: z
      .object({
        attachmentId: z.string().min(1).max(64),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        transcriptDigest: z.string().regex(/^[a-f0-9]{64}$/),
        processingGeneration: z.number().int().positive(),
        authorityDigest: z.string().regex(/^[a-f0-9]{64}$/),
        expiresAt: z.iso.datetime(),
        consumedBy: z.string().min(1).max(128).optional(),
        decision: z.enum(["use", "edit", "cancel"]).optional(),
      })
      .strict(),
  })
  .strict()
export const WHATSAPP_VOICE_INVALID_REPLY =
  "Reply to the original voice transcript with Use transcript, Edit transcript: followed by your corrected text, or Cancel transcript. If it expired, send a new voice note."
export const WHATSAPP_VOICE_CANCELLED_REPLY =
  "Voice note cancelled. Its transcript was not sent as an assistant request."

export function isWhatsAppVoiceChoiceIntent(text?: string) {
  return /^(?:use|edit|cancel) transcript(?:\b|:)/i.test(text?.trim() ?? "")
}

/** An ordinary sentence, unquoted reply or amount never approves a transcript. */
export function parseWhatsAppVoiceChoice(
  text?: string,
  replyToMessageId?: string,
): WhatsAppVoiceChoice | null {
  if (!text || !replyToMessageId) return null
  const value = text.trim()
  const decision = /^use transcript$/i.test(value)
    ? "use"
    : /^cancel transcript$/i.test(value)
      ? "cancel"
      : undefined
  const edited = /^edit transcript:\s*([\s\S]+)$/i.exec(value)?.[1]?.trim()
  const parsed = whatsAppVoiceChoiceSchema.safeParse(
    decision
      ? { decision, replyToMessageId }
      : edited
        ? { decision: "edit", replyToMessageId, text: edited }
        : null,
  )
  return parsed.success ? parsed.data : null
}

export function renderWhatsAppVoiceReview(transcript: string) {
  const text = transcript
  if (
    !text.trim() ||
    text.length > WHATSAPP_VOICE_REVIEW_MAX_CHARS ||
    whatsAppPlainText(text) !== text
  )
    return null
  return `Voice note transcript\n\n${text}\n\nReview the whole transcript above. Reply to this message with Use transcript, Edit transcript: followed by your corrected text, or Cancel transcript. Nothing in this recording has been sent as an assistant request yet.`
}
