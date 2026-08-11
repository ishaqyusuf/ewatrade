import {
  serviceCommerceChannelOriginSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const tokenSchema = z.string().trim().min(20).max(500)

export const serviceCommerceCustomerActionsIssueSchema = z
  .object({
    channel: serviceCommerceChannelOriginSchema,
    clientBatchId: idSchema,
    expiresAt: z.coerce.date(),
    source: serviceCommerceSourceRefSchema,
    storeId: idSchema.optional(),
  })
  .strict()

export const serviceCommerceCustomerActionReadSchema = z
  .object({ capabilityToken: tokenSchema })
  .strict()

export const serviceCommerceCustomerActionExecuteSchema = z
  .object({
    capabilityToken: tokenSchema,
    clientOperationId: idSchema,
    confirmed: z.boolean(),
  })
  .strict()
