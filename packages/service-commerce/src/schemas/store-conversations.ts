import { z } from "zod"

const opaqueIdSchema = z.string().trim().min(1).max(191)
const clientOperationIdSchema = z.string().trim().min(8).max(160)
const conversationTextSchema = z.string().trim().min(1).max(2_000)

export const storeConversationAssignmentReasonSchema = z.enum([
  "customer_request",
  "membership_unavailable",
  "operational_recovery",
  "shift_change",
  "specialist_handoff",
  "workload_balance",
])

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

export const storeConversationQueueInputSchema = z
  .object({
    assignment: z
      .enum(["all", "unassigned", "mine", "assigned"])
      .default("all"),
    cursor: z.string().trim().min(1).max(512).optional(),
    pageSize: z.number().int().min(1).max(100).default(25),
    q: z.string().trim().min(1).max(80).optional(),
    requestKinds: z
      .array(storeConversationRequestKindSchema)
      .max(3)
      .default([]),
    sla: z.enum(["all", "awaiting_response", "overdue"]).default("all"),
    sort: z
      .tuple([
        z.enum(["last_customer_activity", "response_due_at"]),
        z.enum(["asc", "desc"]),
      ])
      .default(["last_customer_activity", "desc"]),
    storeId: opaqueIdSchema,
  })
  .strict()

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

export const storeConversationMobileBootstrapInputSchema =
  storeConversationBootstrapInputSchema

export const storeConversationMobileListInputSchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .strict()

export const storeConversationMobileTimelineInputSchema =
  storeConversationTimelineInputSchema
    .extend({ publicToken: z.string().trim().min(32).max(200) })
    .strict()

export const storeConversationMobileSendTextInputSchema =
  storeConversationSendTextInputSchema

const storeConversationTransferDeviceInputSchema = z.object({
  installationToken: z.string().trim().min(32).max(200),
  publicToken: z.string().trim().min(32).max(200),
  transferToken: z.string().trim().min(32).max(200),
})

export const storeConversationTransferCreateInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
    transferToken: z.string().trim().min(32).max(200),
  })
  .strict()

export const storeConversationTransferClaimInputSchema =
  storeConversationTransferDeviceInputSchema.strict()

export const storeConversationTransferRedeemInputSchema =
  storeConversationTransferDeviceInputSchema
    .extend({ targetCredentialToken: z.string().trim().min(32).max(200) })
    .strict()

export const storeConversationClaimInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    expectedAssignmentRevision: z.number().int().nonnegative(),
    storeId: opaqueIdSchema,
  })
  .strict()

export const storeConversationReplyInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    expectedAssignmentRevision: z.number().int().nonnegative(),
    expectedLastMessageSequence: z.number().int().nonnegative(),
    request: z
      .object({
        id: opaqueIdSchema,
        kind: storeConversationRequestKindSchema,
        revision: z.number().int().positive(),
      })
      .strict()
      .optional(),
    storeId: opaqueIdSchema,
    text: conversationTextSchema,
  })
  .strict()

const storeConversationAssignmentCommandBaseSchema = z.object({
  clientOperationId: clientOperationIdSchema,
  conversationId: opaqueIdSchema,
  expectedAssignmentRevision: z.number().int().nonnegative(),
  reason: storeConversationAssignmentReasonSchema,
  storeId: opaqueIdSchema,
})

export const storeConversationReleaseInputSchema =
  storeConversationAssignmentCommandBaseSchema.strict()

export const storeConversationHandoffInputSchema =
  storeConversationAssignmentCommandBaseSchema
    .extend({ toMembershipId: opaqueIdSchema })
    .strict()

export const storeConversationReassignInputSchema =
  storeConversationAssignmentCommandBaseSchema
    .extend({ toMembershipId: opaqueIdSchema })
    .strict()

export type StoreConversationChannel = z.infer<
  typeof storeConversationChannelSchema
>
export type StoreConversationAssignmentReason = z.infer<
  typeof storeConversationAssignmentReasonSchema
>
export type StoreConversationQueueInput = z.infer<
  typeof storeConversationQueueInputSchema
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
export type StoreConversationMobileBootstrapInput = z.infer<
  typeof storeConversationMobileBootstrapInputSchema
>
export type StoreConversationMobileListInput = z.infer<
  typeof storeConversationMobileListInputSchema
>
export type StoreConversationMobileTimelineInput = z.infer<
  typeof storeConversationMobileTimelineInputSchema
>
export type StoreConversationMobileSendTextInput = z.infer<
  typeof storeConversationMobileSendTextInputSchema
>
export type StoreConversationTransferCreateInput = z.infer<
  typeof storeConversationTransferCreateInputSchema
>
export type StoreConversationTransferClaimInput = z.infer<
  typeof storeConversationTransferClaimInputSchema
>
export type StoreConversationTransferRedeemInput = z.infer<
  typeof storeConversationTransferRedeemInputSchema
>
export type StoreConversationClaimInput = z.infer<
  typeof storeConversationClaimInputSchema
>
export type StoreConversationReplyInput = z.infer<
  typeof storeConversationReplyInputSchema
>
export type StoreConversationReleaseInput = z.infer<
  typeof storeConversationReleaseInputSchema
>
export type StoreConversationHandoffInput = z.infer<
  typeof storeConversationHandoffInputSchema
>
export type StoreConversationReassignInput = z.infer<
  typeof storeConversationReassignInputSchema
>
