import { z } from "zod"

const opaqueIdSchema = z.string().trim().min(1).max(191)
const clientOperationIdSchema = z.string().trim().min(8).max(160)
const conversationTextSchema = z.string().trim().min(1).max(2_000)

export const storeConversationChannelSchema = z.enum([
  "web",
  "mobile",
  "whatsapp",
  "system",
])

export const storeConversationAuthorKindSchema = z.enum([
  "customer",
  "store_attendant",
  "system",
])

export const storeConversationMessageKindSchema = z.enum([
  "customer_text",
  "store_text",
  "system_event",
])

export const storeConversationRequestKindSchema = z.enum([
  "commerce_inquiry",
  "service_request",
  "prescription_request",
])

export const storeConversationBootstrapInputSchema = z
  .object({ publicToken: z.string().trim().min(32).max(200) })
  .strict()

export const storeConversationSendTextInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
    text: conversationTextSchema,
  })
  .strict()

export const storeConversationTimelineInputSchema = z
  .object({
    beforeSequence: z.number().int().positive().optional(),
    conversationId: opaqueIdSchema,
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()

export const storeConversationClaimInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    storeId: opaqueIdSchema,
  })
  .strict()

export const storeConversationReplyInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    storeId: opaqueIdSchema,
    text: conversationTextSchema,
  })
  .strict()

export type StoreConversationChannel = z.infer<
  typeof storeConversationChannelSchema
>
export type StoreConversationAuthorKind = z.infer<
  typeof storeConversationAuthorKindSchema
>
export type StoreConversationMessageKind = z.infer<
  typeof storeConversationMessageKindSchema
>
export type StoreConversationRequestKind = z.infer<
  typeof storeConversationRequestKindSchema
>
export type StoreConversationBootstrapInput = z.infer<
  typeof storeConversationBootstrapInputSchema
>
export type StoreConversationSendTextInput = z.infer<
  typeof storeConversationSendTextInputSchema
>
export type StoreConversationTimelineInput = z.infer<
  typeof storeConversationTimelineInputSchema
>
export type StoreConversationClaimInput = z.infer<
  typeof storeConversationClaimInputSchema
>
export type StoreConversationReplyInput = z.infer<
  typeof storeConversationReplyInputSchema
>
