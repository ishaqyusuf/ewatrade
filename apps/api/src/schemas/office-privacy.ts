import {
  ACCOUNT_PRIVACY_WORKFLOW_STEPS,
  accountPrivacyExternalReceiptSchema,
} from "@ewatrade/db/queries"
import { z } from "zod"

export const officePrivacyDetailSchema = z
  .object({ requestId: z.string().min(1).max(200) })
  .strict()
export const officePrivacyCommandSchema = officePrivacyDetailSchema
  .extend({
    commandId: z.string().uuid(),
    expectedStep: z.enum(ACCOUNT_PRIVACY_WORKFLOW_STEPS),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict()
export const officePrivacyExternalReviewSchema = officePrivacyCommandSchema
  .extend({
    expectedStep: z.literal("REVIEW_EXTERNAL_PROCESSORS"),
    policyDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmationsReviewed: z.literal(true),
    receipts: z.array(accountPrivacyExternalReceiptSchema).min(1).max(30),
  })
  .strict()
export const officePrivacyNoticeSchema = officePrivacyCommandSchema
  .extend({
    expectedStep: z.literal("DELIVER_OUTCOME"),
    contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
    contentReviewed: z.literal(true),
  })
  .strict()
export const officePrivacyNoticeContentSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(10).max(8000),
  })
  .strict()
