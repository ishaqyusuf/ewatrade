import { z } from "zod"

export const STORE_CONVERSATION_WHATSAPP_BRIDGE_CHOICES = [
  "continue_current_request",
  "start_new_request",
] as const

export const STORE_CONVERSATION_WHATSAPP_BRIDGE_STATES = [
  "awaiting_choice",
  "awaiting_request_kind",
  "active",
  "revoked",
] as const

export const STORE_CONVERSATION_WHATSAPP_BRIDGE_REQUEST_KINDS = [
  "commerce_inquiry",
] as const

export const storeConversationWhatsAppBridgeTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43,128}$/)

export const storeConversationWhatsAppBridgeChoiceTokenSchema = z
  .string()
  .regex(/^ewb1_[A-Za-z0-9_-]{43}$/)

export const storeConversationWhatsAppBridgeRequestKindSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_BRIDGE_REQUEST_KINDS,
)

export const storeConversationWhatsAppBridgeChoiceSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_BRIDGE_CHOICES,
)

export const storeConversationWhatsAppBridgeStateSchema = z.enum(
  STORE_CONVERSATION_WHATSAPP_BRIDGE_STATES,
)

const conversationIdSchema = z.string().trim().min(1).max(191)
const publicTokenSchema = z.string().trim().min(12).max(191)

export const storeConversationWhatsAppBridgeIssueInputSchema = z
  .object({
    bridgeToken: storeConversationWhatsAppBridgeTokenSchema,
    clientOperationId: z.string().trim().min(8).max(160),
    conversationId: conversationIdSchema,
    publicToken: publicTokenSchema,
  })
  .strict()

export const storeConversationWhatsAppBridgeIssueProjectionSchema = z
  .object({
    expiresAt: z.date(),
    navigationUrl: z.string().url().startsWith("https://wa.me/"),
    replayed: z.boolean(),
  })
  .strict()

export const storeConversationWhatsAppBridgeProjectionSchema = z
  .object({
    channel: z.literal("whatsapp"),
    choice: storeConversationWhatsAppBridgeChoiceSchema.nullable(),
    linkedAt: z.date(),
    state: storeConversationWhatsAppBridgeStateSchema,
  })
  .strict()

export type StoreConversationWhatsAppBridgeChoice = z.infer<
  typeof storeConversationWhatsAppBridgeChoiceSchema
>
export type StoreConversationWhatsAppBridgeIssueInput = z.infer<
  typeof storeConversationWhatsAppBridgeIssueInputSchema
>
export type StoreConversationWhatsAppBridgeRequestKind = z.infer<
  typeof storeConversationWhatsAppBridgeRequestKindSchema
>
export type StoreConversationWhatsAppBridgeIssueProjection = z.infer<
  typeof storeConversationWhatsAppBridgeIssueProjectionSchema
>
export type StoreConversationWhatsAppBridgeProjection = z.infer<
  typeof storeConversationWhatsAppBridgeProjectionSchema
>
