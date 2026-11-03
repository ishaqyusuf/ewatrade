import { z } from "zod"
import { generalMoney } from "../general/contracts"
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

/** Reply buttons on a transcript review. The id carries no authority; the review is re-checked. */
export const whatsAppVoiceReviewButtons = [
  { id: "wa-voice:use", title: "Use transcript" },
  { id: "wa-voice:cancel", title: "Cancel transcript" },
] as const
export function isWhatsAppVoiceButton(quickActionId?: string) {
  return quickActionId?.startsWith("wa-voice:") ?? false
}
/** A tapped review button, bound to the exact message it was tapped on. */
export function parseWhatsAppVoiceButton(
  quickActionId?: string,
  replyToMessageId?: string,
): WhatsAppVoiceChoice | null {
  const decision =
    quickActionId === "wa-voice:use"
      ? "use"
      : quickActionId === "wa-voice:cancel"
        ? "cancel"
        : undefined
  const parsed = whatsAppVoiceChoiceSchema.safeParse(
    decision ? { decision, replyToMessageId } : null,
  )
  return parsed.success ? parsed.data : null
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
  return `🎙️ Voice note transcript\n\n${text}\n\nCheck the whole transcript. Tap Use transcript or Cancel transcript. To fix it, reply to this message with Edit transcript: and the corrected text. Nothing runs until you choose.`
}

/**
 * A linked owner's photo whose caption names one visible order. The photo is
 * kept as sent (never read); the owner chooses where it goes. Choices bind to
 * the exact review message and expire with the photo hold.
 */
export const WHATSAPP_PHOTO_REVIEW_VERSION = "whatsapp-photo-review-v1"
export const WHATSAPP_PHOTO_HOLD_MS = 24 * 60 * 60_000
export const whatsAppPhotoChoiceSchema = z
  .object({
    decision: z.enum(["attach", "other", "discard"]),
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export type WhatsAppPhotoChoice = z.infer<typeof whatsAppPhotoChoiceSchema>
export const whatsAppPhotoChoiceContentSchema = z
  .object({
    type: z.literal("photo_choice"),
    choice: whatsAppPhotoChoiceSchema,
  })
  .strict()
const photoOrderSchema = z
  .object({
    id: z.string().min(1).max(128),
    orderNumber: z.string().trim().min(1).max(40),
    customerName: z.string().max(200).nullable(),
  })
  .strict()
export type WhatsAppPhotoOrder = z.infer<typeof photoOrderSchema>
export const whatsAppPhotoReviewContentSchema = z
  .object({
    type: z.literal("photo_review"),
    source: whatsAppMediaContentSchema,
    review: z
      .object({
        attachmentId: z.string().min(1).max(64),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        order: photoOrderSchema,
        /** The attachment's own retention, restored once the owner keeps the photo. */
        retentionUntil: z.iso.datetime(),
        authorityDigest: z.string().regex(/^[a-f0-9]{64}$/),
        expiresAt: z.iso.datetime(),
        consumedBy: z.string().min(1).max(128).optional(),
        decision: z.enum(["attach", "other", "discard"]).optional(),
      })
      .strict(),
  })
  .strict()

/** Order references written like ORD-1038 or S-1038; matched exactly against saved orders. */
export function whatsAppCaptionOrderNumbers(caption?: string) {
  const found = new Set<string>()
  for (const match of (caption ?? "").matchAll(
    /(?<![A-Za-z0-9-])([A-Za-z]{1,6}-\d{1,10})(?![A-Za-z0-9-])/g,
  ))
    if (match[1]) found.add(match[1].toUpperCase())
  return [...found].slice(0, 3)
}

function photoOrderLabel(order: Pick<WhatsAppPhotoOrder, "orderNumber">) {
  const number = whatsAppPlainText(order.orderNumber).replace(/`/g, "").trim()
  return number && number.length <= 40 ? number : null
}

export function renderWhatsAppPhotoReview(order: WhatsAppPhotoOrder) {
  const number = photoOrderLabel(order)
  if (!number) return null
  const customer = whatsAppPlainText(order.customerName ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
  return `📎 Photo kept as sent. I don't read what's in photos.\n\nAttach it to \`\`\`${number}\`\`\`${customer ? ` · ${customer}` : ""}?\n_Attaching doesn't record a payment._`
}

/** Reply buttons (≤3, titles ≤20). Ids carry no authority; the stored review is re-checked. */
export function whatsAppPhotoReviewButtons(
  order: Pick<WhatsAppPhotoOrder, "orderNumber">,
) {
  const number = photoOrderLabel(order)
  const attach = number ? `Attach to ${number}` : "Attach"
  return [
    {
      id: "wa-photo:attach",
      title: attach.length <= 20 ? attach : "Attach",
    },
    { id: "wa-photo:other", title: "Other order" },
    { id: "wa-photo:discard", title: "Discard" },
  ]
}
export function isWhatsAppPhotoButton(quickActionId?: string) {
  return quickActionId?.startsWith("wa-photo:") ?? false
}
/** A tapped photo choice, bound to the exact review message it was tapped on. */
export function parseWhatsAppPhotoButton(
  quickActionId?: string,
  replyToMessageId?: string,
): WhatsAppPhotoChoice | null {
  const decision = /^wa-photo:(attach|other|discard)$/.exec(
    quickActionId ?? "",
  )?.[1]
  const parsed = whatsAppPhotoChoiceSchema.safeParse(
    decision ? { decision, replyToMessageId } : null,
  )
  return parsed.success ? parsed.data : null
}

/** The owner's own words for the chosen photo; the model drafts the attach for review. */
export function whatsAppPhotoChoiceText(
  decision: "attach" | "other",
  order?: Pick<WhatsAppPhotoOrder, "orderNumber">,
) {
  const number = order && photoOrderLabel(order)
  return decision === "attach" && number
    ? `Attach this photo to order ${number}.`
    : "Attach this photo to a different order. Ask me which one."
}

/**
 * "Other order" answers with a native list of recent open orders the sender
 * can see. The offered orders are saved server-side on the choice TURN; a row
 * id is only a position in that saved offer and carries no authority.
 */
export const WHATSAPP_PHOTO_ORDER_LIST_VERSION = "whatsapp-photo-order-list-v1"
/** Meta allows 10 rows; the last one is always "Not listed". */
export const WHATSAPP_PHOTO_ORDER_LIST_MAX = 9
const photoOfferOrderSchema = photoOrderSchema
  .extend({
    totalMinor: z.number().int().nonnegative(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()
export type WhatsAppPhotoOfferOrder = z.infer<typeof photoOfferOrderSchema>
const photoOrderRowSchema = z.union([
  z.number().int().min(1).max(WHATSAPP_PHOTO_ORDER_LIST_MAX),
  z.literal("none"),
])
export const whatsAppPhotoOrderPickSchema = z
  .object({
    row: photoOrderRowSchema,
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export type WhatsAppPhotoOrderPick = z.infer<
  typeof whatsAppPhotoOrderPickSchema
>
export const whatsAppPhotoOrderPickContentSchema = z
  .object({
    type: z.literal("photo_order_choice"),
    choice: whatsAppPhotoOrderPickSchema,
  })
  .strict()
export const whatsAppPhotoOrderOfferContentSchema = z
  .object({
    type: z.literal("photo_order_offer"),
    choice: whatsAppPhotoChoiceSchema,
    offer: z
      .object({
        sourceInboxId: z.string().min(1).max(128),
        attachmentId: z.string().min(1).max(64),
        contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        orders: z
          .array(photoOfferOrderSchema)
          .min(1)
          .max(WHATSAPP_PHOTO_ORDER_LIST_MAX),
        retentionUntil: z.iso.datetime(),
        authorityDigest: z.string().regex(/^[a-f0-9]{64}$/),
        expiresAt: z.iso.datetime(),
        consumedBy: z.string().min(1).max(128).optional(),
        picked: photoOrderRowSchema.optional(),
      })
      .strict(),
  })
  .strict()

export const WHATSAPP_PHOTO_ORDER_LIST_BODY = "Which order is the photo for?"
const PHOTO_ORDER_ROW_PREFIX = "wa-photo-order:"

function photoOrderMoney(order: WhatsAppPhotoOfferOrder) {
  const text = generalMoney(order.totalMinor, order.currencyCode)
  return order.totalMinor % 100 === 0 ? text.replace(/\.00$/, "") : text
}

/** Offer rows that fit Meta's list limits (title ≤24, description ≤72); others are left out. */
export function whatsAppPhotoOrderOfferRows(
  orders: readonly WhatsAppPhotoOfferOrder[],
) {
  return orders
    .slice(0, WHATSAPP_PHOTO_ORDER_LIST_MAX)
    .map((order) => {
      const number = photoOrderLabel(order)
      const money = photoOrderMoney(order)
      const customer = whatsAppPlainText(order.customerName ?? "")
        .replace(/[*_~`]/g, "")
        .replace(/\s+/g, " ")
        .trim()
      const room = 72 - money.length - 3
      const name =
        customer.length > room
          ? `${customer.slice(0, Math.max(0, room - 1)).trimEnd()}…`
          : customer
      return number && number.length <= 24 && money.length <= 72
        ? {
            order,
            title: number,
            description: name && room > 1 ? `${name} · ${money}` : money,
          }
        : null
    })
    .filter((row) => row !== null)
}

/** The native list for a saved offer: positional ids, then a fixed "Not listed" row. */
export function whatsAppPhotoOrderList(
  orders: readonly WhatsAppPhotoOfferOrder[],
  storeName?: string,
) {
  const rows = whatsAppPhotoOrderOfferRows(orders)
  if (!rows.length || rows.length !== orders.length) return null
  const section = `Orders · ${whatsAppPlainText(storeName ?? "").trim()}`
  return {
    body: WHATSAPP_PHOTO_ORDER_LIST_BODY,
    button: "Choose order",
    sectionTitle:
      storeName?.trim() && section.length <= 24 ? section : "Orders",
    rows: [
      ...rows.map((row, index) => ({
        id: `${PHOTO_ORDER_ROW_PREFIX}${index + 1}`,
        title: row.title,
        description: row.description,
      })),
      {
        id: `${PHOTO_ORDER_ROW_PREFIX}none`,
        title: "Not listed",
        description: "Tell me which order it's for",
      },
    ],
  }
}

/** Text used only when the list cannot be sent natively; nothing is chosen by typing. */
export function whatsAppPhotoOrderListFallback(
  orders: readonly WhatsAppPhotoOfferOrder[],
) {
  const rows = whatsAppPhotoOrderOfferRows(orders)
  return `${WHATSAPP_PHOTO_ORDER_LIST_BODY}\n\n${rows.map((row) => `- ${row.title} · ${row.description}`).join("\n")}\n\nTo attach it, send the photo again with the order number in the caption.`
}

export function isWhatsAppPhotoOrderRow(quickActionId?: string) {
  return quickActionId?.startsWith(PHOTO_ORDER_ROW_PREFIX) ?? false
}
/** A tapped list row, bound to the exact list message it was tapped on. */
export function parseWhatsAppPhotoOrderRow(
  quickActionId?: string,
  replyToMessageId?: string,
): WhatsAppPhotoOrderPick | null {
  const raw = /^wa-photo-order:(none|[1-9])$/.exec(quickActionId ?? "")?.[1]
  const parsed = whatsAppPhotoOrderPickSchema.safeParse(
    raw
      ? { row: raw === "none" ? "none" : Number(raw), replyToMessageId }
      : null,
  )
  return parsed.success ? parsed.data : null
}

/** Spreadsheets in GENERAL chat are counted only; rows are reviewed and imported in the app. */
export const WHATSAPP_IMPORT_HANDOFF_VERSION = "whatsapp-import-handoff-v1"
export const whatsAppImportHandoffContentSchema = z
  .object({
    type: z.literal("import_handoff"),
    source: whatsAppMediaContentSchema,
    file: z
      .object({
        name: z.string().min(1).max(120),
        rows: z.number().int().nonnegative().max(1_000_000),
      })
      .strict(),
  })
  .strict()
