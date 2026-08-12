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

export const storeConversationRequestStatusSchema = z.enum([
  "received",
  "needs_information",
  "media_review",
  "professional_review",
  "ready_to_quote",
  "quoted",
  "converted",
  "declined",
  "withdrawn",
  "expired",
])

export const storeConversationSelectRequestInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    messageId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("new_commerce_inquiry") }).strict(),
      z
        .object({
          kind: z.literal("existing_request"),
          requestId: opaqueIdSchema,
          requestKind: storeConversationRequestKindSchema,
        })
        .strict(),
    ]),
  })
  .strict()

export const storeConversationServiceContinuationSchema = z
  .object({
    conversationId: opaqueIdSchema,
    customerEmail: z.string().trim().email().optional(),
    customerName: z.string().trim().min(1).max(160),
    customerPhone: z.string().trim().min(3).max(40).optional(),
    details: z.string().trim().max(2_000).optional(),
    messageId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
  })
  .refine((input) => input.customerEmail || input.customerPhone, {
    message: "A phone number or email address is required.",
  })

export const storeConversationBootstrapInputSchema = z
  .object({ publicToken: z.string().trim().min(32).max(200) })
  .strict()

export const storeConversationSendTextInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
    requestIntent: z.enum(["continue_current", "choose_request"]).optional(),
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
    request: z
      .object({
        id: opaqueIdSchema,
        kind: storeConversationRequestKindSchema,
      })
      .strict()
      .optional(),
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
export type StoreConversationRequestStatus = z.infer<
  typeof storeConversationRequestStatusSchema
>
export type StoreConversationSelectRequestInput = z.infer<
  typeof storeConversationSelectRequestInputSchema
>
export type StoreConversationServiceContinuation = z.infer<
  typeof storeConversationServiceContinuationSchema
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
