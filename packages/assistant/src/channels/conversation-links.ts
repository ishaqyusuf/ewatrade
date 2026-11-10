import { z } from "zod"
import {
  type ReadRecordOrigin,
  readRecordOriginSchema,
} from "../general/read-record-target"

const conversationId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value !== "." &&
      value !== ".." &&
      [...value].every((point) => {
        const code = point.codePointAt(0) ?? 0
        return code >= 32 && code !== 127
      }),
    "Choose a saved conversation identity",
  )

/** A navigation identity, never a credential or permission grant. */
export const assistantResponseMessageId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)

export function assistantResponsePath(messageId: string) {
  return `/open/assistant-response/${assistantResponseMessageId.parse(messageId)}`
}

export function assistantResponseConversationPath(input: {
  conversationId: string
  messageId: string
}) {
  const chat = conversationId.parse(input.conversationId)
  const message = assistantResponseMessageId.parse(input.messageId)
  return `/assistant/c/${encodeURIComponent(chat)}?messageId=${message}`
}

export function assistantResponseAppLink(
  messageId: unknown,
  options: {
    trustedAppOrigin: string
    currentScope: ReadRecordOrigin
    conversation: unknown
  },
): { href: string; label: string } | undefined {
  const message = assistantResponseMessageId.safeParse(messageId)
  const chat = conversationAppLink(options.conversation, options)
  if (!message.success || !chat) return
  return {
    href: new URL(
      assistantResponsePath(message.data),
      new URL(chat.href).origin,
    ).href,
    label: "View full response",
  }
}

/** Navigation identity only. The canonical conversation reader owns authorization. */
export const generalConversationTargetSchema = z
  .object({
    conversationId,
    purpose: z.literal("GENERAL"),
    origin: readRecordOriginSchema,
  })
  .strict()
export type GeneralConversationTarget = z.infer<
  typeof generalConversationTargetSchema
>

/** The caller supplies trusted configuration, never a record/model/request URL. */
export function trustedAssistantAppOrigin(value: string): string | undefined {
  if (
    value !== value.trim() ||
    [...value].some(
      (point) => (point.codePointAt(0) ?? 0) <= 32 || point === "\\",
    )
  )
    return
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (value !== url.origin && value !== `${url.origin}/`)
    )
      return
    return url.origin
  } catch {
    return
  }
}

/** Opens the exact saved GENERAL route; never changes the app's selected business or Store. */
export function conversationAppLink(
  target: unknown,
  options: { trustedAppOrigin: string; currentScope: ReadRecordOrigin },
): { href: string; label: string } | undefined {
  const parsed = generalConversationTargetSchema.safeParse(target)
  const scope = readRecordOriginSchema.safeParse(options.currentScope)
  const origin = trustedAssistantAppOrigin(options.trustedAppOrigin)
  if (
    !parsed.success ||
    !scope.success ||
    !origin ||
    parsed.data.origin.tenantId !== scope.data.tenantId ||
    parsed.data.origin.storeId !== scope.data.storeId
  )
    return
  return {
    href: new URL(
      `/assistant/c/${encodeURIComponent(parsed.data.conversationId)}`,
      origin,
    ).href,
    label: "Open saved chat in EwaTrade",
  }
}
