import {
  storeConversationClaimInputSchema,
  storeConversationReplyInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)

export const storeConversationQueueInputSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
    storeId: idSchema,
  })
  .strict()

export const storeConversationStaffTimelineInputSchema =
  storeConversationTimelineInputSchema.extend({ storeId: idSchema }).strict()

export const storeConversationStaffClaimInputSchema =
  storeConversationClaimInputSchema

export const storeConversationStaffReplyInputSchema =
  storeConversationReplyInputSchema
