import {
  storeConversationClaimInputSchema,
  storeConversationHandoffInputSchema,
  storeConversationQueueInputSchema,
  storeConversationReassignInputSchema,
  storeConversationReleaseInputSchema,
  storeConversationReplyInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"
export const storeConversationStaffTimelineInputSchema =
  storeConversationTimelineInputSchema
    .extend({ storeId: storeConversationQueueInputSchema.shape.storeId })
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

export { storeConversationQueueInputSchema }
