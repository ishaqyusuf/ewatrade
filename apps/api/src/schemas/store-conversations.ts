import {
  storeConversationClaimInputSchema,
  storeConversationHandoffInputSchema,
  storeConversationMessagesAfterInputSchema,
  storeConversationModerationCommandInputSchema,
  storeConversationQueueInputSchema,
  storeConversationReassignInputSchema,
  storeConversationReleaseInputSchema,
  storeConversationReplyInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"
export const storeConversationStaffTimelineInputSchema =
  storeConversationTimelineInputSchema
    .extend({ storeId: storeConversationQueueInputSchema.shape.storeId })
    .strict()

export const storeConversationStaffReadAcknowledgementInputSchema = z
  .object({
    clientOperationId: z.string().trim().min(8).max(160),
    conversationId: z.string().trim().min(1).max(191),
    readThroughSequence: z.number().int().min(0),
    storeId: storeConversationQueueInputSchema.shape.storeId,
  })
  .strict()

export const storeConversationStaffMessagesAfterInputSchema =
  storeConversationMessagesAfterInputSchema
    .extend({ storeId: storeConversationQueueInputSchema.shape.storeId })
    .strict()

export const storeConversationStaffAttachmentViewerGrantInputSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(191),
    messageAttachmentId: z.string().trim().min(1).max(191),
    reason: z.string().trim().min(3).max(240),
    storeId: storeConversationQueueInputSchema.shape.storeId,
  })
  .strict()

export const storeConversationStaffClaimInputSchema =
  storeConversationClaimInputSchema

export const storeConversationStaffReplyInputSchema =
  storeConversationReplyInputSchema

export const storeConversationStaffReleaseInputSchema =
  storeConversationReleaseInputSchema

export const storeConversationStaffHandoffInputSchema =
  storeConversationHandoffInputSchema

export const storeConversationStaffReassignInputSchema =
  storeConversationReassignInputSchema

export const storeConversationStaffModerationInputSchema =
  storeConversationModerationCommandInputSchema

export { storeConversationQueueInputSchema }
