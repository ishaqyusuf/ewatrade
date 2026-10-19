import { z } from "zod"
import type { ReadRecordOrigin } from "../general/read-record-target"
import {
  conversationAppLink,
  generalConversationTargetSchema,
} from "./conversation-links"
import { whatsAppPlainText } from "./render"
import { whatsAppSupportHandoff } from "./support"
import { whatsAppLinkIdSchema } from "./whatsapp"

export const WHATSAPP_CONTROL_LIFETIME_MS = 5 * 60_000
export const WHATSAPP_CONTROL_PAGE_SIZE = 4
export const WHATSAPP_CONTROL_RENDER_VERSION = "whatsapp-control-v1"
export function whatsAppControlLabel(value: string, max = 160) {
  const text = whatsAppPlainText(value).replace(/\s+/g, " ").trim()
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(text)) {
    if (result.length + segment.length > max) break
    result += segment
  }
  return result || "Unnamed"
}
const id = whatsAppLinkIdSchema
const generation = z.number().int().positive()
export const whatsAppControlCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.enum([
        "help",
        "businesses",
        "stores",
        "new",
        "chats",
        "invalid_choice",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("choose"),
      index: z.number().int().min(1).max(5),
      replyToMessageId: z.string().min(1).max(256),
    })
    .strict(),
])
export type WhatsAppControlCommand = z.infer<
  typeof whatsAppControlCommandSchema
>

/** Exact command grammar; an unqualified amount or an ordinary sentence is never a menu choice. */
export function parseWhatsAppControl(
  text: string | undefined,
  replyToMessageId?: string,
): WhatsAppControlCommand | null {
  const value = text
    ?.trim()
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/\s+/g, " ")
  if (!value) return null
  if (["help", "menu", "support", "contact support"].includes(value))
    return { kind: "help" }
  if (
    ["business", "businesses", "switch business", "change business"].includes(
      value,
    )
  )
    return { kind: "businesses" }
  if (["store", "stores", "switch store", "change store"].includes(value))
    return { kind: "stores" }
  if (["new chat", "new conversation"].includes(value)) return { kind: "new" }
  if (["continue chat", "continue conversation", "chats"].includes(value))
    return { kind: "chats" }
  if (/^choose(?:\s+[0-9]+(?:\s.*)?|)$/.test(value)) {
    const match = /^choose ([1-5])$/.exec(value)
    return match && replyToMessageId && replyToMessageId.length <= 256
      ? { kind: "choose", index: Number(match[1]), replyToMessageId }
      : { kind: "invalid_choice" }
  }
  return null
}

const scope = z
  .object({ grantId: id, grantGeneration: generation, storeId: id })
  .strict()
export const whatsAppControlActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("businesses"), cursor: id.optional() }).strict(),
  z
    .object({
      kind: z.literal("stores"),
      grantId: id,
      grantGeneration: generation,
      cursor: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("chats"),
      grantId: id,
      grantGeneration: generation,
      storeId: id,
      cursor: id.optional(),
    })
    .strict(),
  scope.extend({ kind: z.literal("new") }),
  scope.extend({
    kind: z.literal("resume"),
    conversationId: id,
    purpose: z.enum(["GENERAL", "SETUP", "PRODUCT_CREATE"]),
  }),
])
export type WhatsAppControlAction = z.infer<typeof whatsAppControlActionSchema>
export const whatsAppControlMenuSchema = z
  .object({
    version: z.literal(WHATSAPP_CONTROL_RENDER_VERSION),
    identityGeneration: generation,
    selectionGeneration: generation,
    quotaScope: scope,
    scopes: z.array(scope).min(1).max(6),
    title: z.string().min(1).max(500),
    detail: z.string().max(800),
    conversationTarget: generalConversationTargetSchema.optional(),
    support: z.literal(true).optional(),
    choices: z
      .array(
        z
          .object({
            label: z.string().min(1).max(160),
            action: whatsAppControlActionSchema,
          })
          .strict(),
      )
      .max(5),
  })
  .strict()
export type WhatsAppControlMenu = z.infer<typeof whatsAppControlMenuSchema>
export function serializeWhatsAppControlMenu(menu: WhatsAppControlMenu) {
  return JSON.stringify(whatsAppControlMenuSchema.parse(menu))
}
export const whatsAppControlContentSchema = z
  .object({
    type: z.literal("control"),
    command: whatsAppControlCommandSchema,
    menu: whatsAppControlMenuSchema.optional(),
    consumedBy: id.optional(),
  })
  .strict()

export function renderWhatsAppControl(
  menu: WhatsAppControlMenu,
  options?: { trustedAppOrigin: string; currentScope: ReadRecordOrigin },
) {
  const parsed = whatsAppControlMenuSchema.parse(menu)
  const link =
    parsed.conversationTarget && options
      ? conversationAppLink(parsed.conversationTarget, options)
      : undefined
  const body = [
    whatsAppPlainText(parsed.title),
    whatsAppPlainText(parsed.detail),
    ...parsed.choices.map(
      (choice, i) =>
        `${i + 1}. ${whatsAppPlainText(choice.label).replace(/\s+/g, " ")}`,
    ),
    parsed.choices.length
      ? "Reply to this message with Choose 1 (or another listed number). This menu is valid for up to 5 minutes."
      : "Send Help, Business, Store, New chat or Continue chat.",
    parsed.conversationTarget
      ? link
        ? `${link.label}: ${link.href}\nSelect the original business and Store in EwaTrade before continuing. This link does not change them.`
        : "Your selected chat is saved in EwaTrade. Select its original business and Store there to continue."
      : undefined,
    parsed.support ? whatsAppSupportHandoff() : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
  if (!body || body.length > 3000)
    throw Error("Control reply exceeds its bound.")
  return body
}
