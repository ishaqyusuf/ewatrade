import { serviceCommercePolicyDecisionDraftInputSchema } from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

export const serviceCommercePolicySetSchema =
  serviceCommercePolicyDecisionDraftInputSchema

export const serviceCommercePolicyListSchema = z
  .object({ storeId: z.string().trim().min(1).max(191) })
  .strict()

export const serviceCommercePolicyDetailSchema = z
  .object({
    decisionId: z.string().trim().min(1).max(191),
    storeId: z.string().trim().min(1).max(191),
  })
  .strict()

export const serviceCommercePolicyRevokeSchema =
  serviceCommercePolicyDetailSchema
    .extend({
      expectedRevision: z.number().int().positive(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
