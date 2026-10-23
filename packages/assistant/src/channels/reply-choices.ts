import { z } from "zod"

export const WHATSAPP_REPLY_CHOICE_LIFETIME_MS = 10 * 60_000
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        [...value].every((point) => {
          const code = point.codePointAt(0) ?? 0
          return (
            code >= 32 &&
            code !== 127 &&
            !(code >= 0x202a && code <= 0x202e) &&
            !(code >= 0x2066 && code <= 0x2069)
          )
        }) &&
        !/https?:\/\/|\bwww\.|-----BEGIN|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\b(?:password|passcode|api[ _-]?key|secret[ _-]?key|recovery[ _-]?code|verification[ _-]?code|otp)\s*(?::|=|is\b)\s*\S+|^(?:Confirm|Cancel)(?: (?:setup|product))? [A-Za-z0-9_-]{32,}$/i.test(
          value,
        ) &&
        !/^\/?(?:confirm|save|approve|proceed|cancel|connect|register|disconnect(?: ewatrade)?|stop|unsubscribe|menu|help|new chat|switch(?: business| store)?)\s*[.!?]?$/i.test(
          value,
        ),
      "Use a plain navigation or clarification reply without credentials, URLs or approval codes.",
    )
export const whatsAppChatChoicesSchema = z
  .array(z.object({ title: plain(20), text: plain(500) }).strict())
  .min(1)
  .max(3)
export const whatsAppChatQuestionSchema = z
  .object({
    question: plain(1000).refine(
      (value) =>
        !/\b(?:passwords?|passcodes?|otps?|verification[ -]?codes?|recovery[ -]?codes?|api[ _-]?keys?|secret[ _-]?keys?)\b/i.test(
          value,
        ),
      "Ask only about business facts; credential verification belongs to the dedicated connection flow.",
    ),
    choices: whatsAppChatChoicesSchema,
  })
  .strict()
export type WhatsAppChatChoice = z.infer<
  typeof whatsAppChatChoicesSchema
>[number]
export const whatsAppReplyChoiceCommandSchema = z
  .object({
    kind: z.literal("reply_choice"),
    sourceOutboxId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    index: z.number().int().min(1).max(3),
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export type WhatsAppReplyChoiceCommand = z.infer<
  typeof whatsAppReplyChoiceCommandSchema
>
export const whatsAppReplyChoiceContentSchema = z
  .object({
    type: z.literal("reply_choice"),
    command: whatsAppReplyChoiceCommandSchema,
  })
  .strict()
export function parseWhatsAppReplyChoiceIntent(input: {
  text?: string
  quickActionId?: string
  replyToMessageId?: string
}) {
  if (input.quickActionId?.startsWith("wa-reply:")) {
    const match = /^wa-reply:([A-Za-z0-9_-]{1,128}):([1-3])$/.exec(
      input.quickActionId,
    )
    const parsed = whatsAppReplyChoiceCommandSchema.safeParse({
      kind: "reply_choice",
      sourceOutboxId: match?.[1],
      index: Number(match?.[2]),
      replyToMessageId: input.replyToMessageId,
    })
    return match && parsed.success
      ? parsed.data
      : { kind: "invalid_reply_choice" as const }
  }
  const match = /^choice ([1-3])$/i.exec(input.text?.trim() ?? "")
  if (!match || !input.replyToMessageId) return null
  const parsed = whatsAppReplyChoiceCommandSchema.safeParse({
    kind: "reply_choice",
    index: Number(match[1]),
    replyToMessageId: input.replyToMessageId,
  })
  return parsed.success
    ? parsed.data
    : { kind: "invalid_reply_choice" as const }
}
/** A single server-saved answer owns the choices; never mine model narration for actions. */
export function whatsAppSavedReplyChoices(parts: unknown) {
  if (!Array.isArray(parts) || parts.length > 80) return
  const rows = parts.flatMap((part: unknown) => {
    if (
      !part ||
      typeof part !== "object" ||
      !("type" in part) ||
      part.type !== "data-general-answer" ||
      !("data" in part) ||
      !part.data ||
      typeof part.data !== "object" ||
      !("chatChoices" in part.data)
    )
      return []
    const parsed = whatsAppChatChoicesSchema.safeParse(part.data.chatChoices)
    return parsed.success ? [parsed.data] : []
  })
  return rows.length === 1 ? rows[0] : undefined
}
export function whatsAppReplyChoiceButtons(
  outboxId: string,
  choices: readonly WhatsAppChatChoice[],
) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(outboxId)) return []
  const parsed = whatsAppChatChoicesSchema.safeParse(choices)
  return parsed.success
    ? parsed.data.map((choice, index) => ({
        id: `wa-reply:${outboxId}:${index + 1}`,
        title: choice.title,
      }))
    : []
}
