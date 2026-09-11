import { z } from "zod"
import { serviceCommerceCustomerActionProjectionSchema } from "./action"

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
  "action_message",
  "account_invitation",
  "customer_attachment",
  "customer_text",
  "store_text",
  "system_event",
])

export const storeConversationQuoteSnapshotSchema = z
  .object({
    currencyCode: z.string().trim().length(3),
    mode: z.enum(["single", "alternatives"]),
    options: z
      .array(
        z
          .object({
            id: opaqueIdSchema,
            label: z.string().trim().min(1).max(120),
            position: z.number().int().nonnegative(),
            totalMinor: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    quoteVersion: z.number().int().positive(),
  })
  .strict()

export const storeConversationQuoteActionMessageProjectionSchema = z
  .object({
    actions: z.array(serviceCommerceCustomerActionProjectionSchema).max(24),
    currencyCode: z.string().trim().length(3),
    kind: z.literal("quote"),
    lifecycle: z.enum([
      "completed",
      "current",
      "expired",
      "rejected",
      "revoked",
      "superseded",
    ]),
    options: z
      .array(
        z
          .object({
            id: opaqueIdSchema,
            label: z.string().trim().min(1).max(120),
            selected: z.boolean(),
            totalMinor: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    quoteVersion: z.number().int().positive(),
    recovery: z.enum(["refresh", "talk_to_store"]).nullable(),
  })
  .strict()

export const storeConversationQuoteActionPreviewInputSchema = z
  .object({
    conversationId: opaqueIdSchema,
    messageId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
  })
  .strict()

export const storeConversationQuoteActionExecuteInputSchema =
  storeConversationQuoteActionPreviewInputSchema
    .extend({
      capabilityToken: z.string().trim().min(20).max(500),
      clientOperationId: clientOperationIdSchema,
      confirmed: z.boolean(),
    })
    .strict()

export const storeConversationRequestKindSchema = z.enum([
  "commerce_inquiry",
  "service_request",
  "prescription_request",
])

export const storeConversationAttachmentKindSchema = z.enum([
  "image",
  "document",
  "audio",
])

export const storeConversationAttachmentTargetSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("existing_request"),
        request: z
          .object({
            id: opaqueIdSchema,
            kind: storeConversationRequestKindSchema,
            revision: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    z.object({ kind: z.literal("new_commerce_inquiry") }).strict(),
    z.object({ kind: z.literal("new_prescription_request") }).strict(),
  ],
)

export const storeConversationAttachmentCapabilityInputSchema = z
  .object({
    conversationId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
    request: z
      .object({
        id: opaqueIdSchema,
        kind: storeConversationRequestKindSchema,
        revision: z.number().int().positive(),
      })
      .strict()
      .optional(),
    target: storeConversationAttachmentTargetSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (Boolean(input.request) === Boolean(input.target)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose exactly one current or new attachment Request target.",
      })
    }
  })

export const storeConversationCustomerVoiceNoteGrantInputSchema = z
  .object({
    conversationId: opaqueIdSchema,
    messageAttachmentId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
  })
  .strict()

const storeConversationExactRequestSchema = z
  .object({
    id: opaqueIdSchema,
    kind: storeConversationRequestKindSchema,
    revision: z.number().int().positive(),
  })
  .strict()

export const storeConversationAttachmentCommitInputSchema = z
  .object({
    channel: z.enum(["web", "mobile"]),
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    owner: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("generic"),
          sourceAttachmentId: opaqueIdSchema,
        })
        .strict(),
      z
        .object({
          kind: z.literal("prescription"),
          prescriptionMediaId: opaqueIdSchema,
        })
        .strict(),
    ]),
    publicToken: z.string().trim().min(32).max(200),
    request: storeConversationExactRequestSchema,
  })
  .strict()

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

export const storeConversationMessagesAfterInputSchema = z
  .object({
    actionMessageIds: z.array(opaqueIdSchema).max(100).default([]),
    afterSequence: z.number().int().min(0).default(0),
    conversationId: opaqueIdSchema,
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict()

export const storeConversationReadAcknowledgementInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    deliveredThroughSequence: z.number().int().min(0),
    readThroughSequence: z.number().int().min(0),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.readThroughSequence <= value.deliveredThroughSequence) return
    context.addIssue({
      code: "custom",
      message: "Read progress cannot exceed delivered progress.",
      path: ["readThroughSequence"],
    })
  })

export const storeConversationMobileBootstrapInputSchema =
  storeConversationBootstrapInputSchema

export const storeConversationMobileListInputSchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    direction: z.enum(["forward", "backward"]).optional(),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .strict()

export const storeConversationMobileTimelineInputSchema =
  storeConversationTimelineInputSchema
    .extend({ publicToken: z.string().trim().min(32).max(200) })
    .strict()

export const storeConversationMobileMessagesAfterInputSchema =
  storeConversationMessagesAfterInputSchema
    .extend({ publicToken: z.string().trim().min(32).max(200) })
    .strict()

export const storeConversationMobileReadAcknowledgementInputSchema =
  storeConversationReadAcknowledgementInputSchema
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

export const storeConversationGuestCredentialRotationInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    targetCredentialToken: z.string().trim().min(32).max(200),
  })
  .strict()

export const storeConversationModerationActionSchema = z.enum([
  "restrict",
  "reinstate",
])

export const storeConversationModerationReasonSchema = z.enum([
  "spam_or_abuse",
  "security_review",
  "policy_review",
  "operator_review",
  "appeal_approved",
  "review_complete",
])

const storeConversationModerationFormObjectSchema = z.object({
  action: storeConversationModerationActionSchema,
  operatorNote: z.string().trim().max(240).optional(),
  reason: storeConversationModerationReasonSchema,
})

function assertModerationReason(
  input: z.infer<typeof storeConversationModerationFormObjectSchema>,
  ctx: z.RefinementCtx,
) {
  const allowed =
    input.action === "restrict"
      ? [
          "spam_or_abuse",
          "security_review",
          "policy_review",
          "operator_review",
        ]
      : ["appeal_approved", "review_complete"]
  if (!allowed.includes(input.reason)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose a reason that matches this moderation action.",
      path: ["reason"],
    })
  }
}

export const storeConversationModerationFormSchema =
  storeConversationModerationFormObjectSchema.superRefine(
    assertModerationReason,
  )

export const storeConversationModerationCommandInputSchema =
  storeConversationModerationFormObjectSchema
    .extend({
      clientOperationId: clientOperationIdSchema,
      conversationId: opaqueIdSchema,
      expectedRevision: z.number().int().nonnegative(),
      storeId: opaqueIdSchema,
    })
    .superRefine(assertModerationReason)

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
export type StoreConversationAttachmentKind = z.infer<
  typeof storeConversationAttachmentKindSchema
>
export type StoreConversationAttachmentTarget = z.infer<
  typeof storeConversationAttachmentTargetSchema
>
export type StoreConversationAttachmentCapabilityInput = z.infer<
  typeof storeConversationAttachmentCapabilityInputSchema
>
export type StoreConversationAttachmentCommitInput = z.infer<
  typeof storeConversationAttachmentCommitInputSchema
>
export type StoreConversationCustomerVoiceNoteGrantInput = z.infer<
  typeof storeConversationCustomerVoiceNoteGrantInputSchema
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
export type StoreConversationMessagesAfterInput = z.infer<
  typeof storeConversationMessagesAfterInputSchema
>
export type StoreConversationReadAcknowledgementInput = z.infer<
  typeof storeConversationReadAcknowledgementInputSchema
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
export type StoreConversationMobileMessagesAfterInput = z.infer<
  typeof storeConversationMobileMessagesAfterInputSchema
>
export type StoreConversationMobileReadAcknowledgementInput = z.infer<
  typeof storeConversationMobileReadAcknowledgementInputSchema
>
export type StoreConversationMobileSendTextInput = z.infer<
  typeof storeConversationMobileSendTextInputSchema
>
export type StoreConversationQuoteSnapshot = z.infer<
  typeof storeConversationQuoteSnapshotSchema
>
export type StoreConversationQuoteActionMessageProjection = z.infer<
  typeof storeConversationQuoteActionMessageProjectionSchema
>
export type StoreConversationQuoteActionPreviewInput = z.infer<
  typeof storeConversationQuoteActionPreviewInputSchema
>
export type StoreConversationQuoteActionExecuteInput = z.infer<
  typeof storeConversationQuoteActionExecuteInputSchema
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
export type StoreConversationModerationAction = z.infer<
  typeof storeConversationModerationActionSchema
>
export type StoreConversationModerationReason = z.infer<
  typeof storeConversationModerationReasonSchema
>
export type StoreConversationModerationCommandInput = z.infer<
  typeof storeConversationModerationCommandInputSchema
>
export type StoreConversationModerationFormValues = z.infer<
  typeof storeConversationModerationFormSchema
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
