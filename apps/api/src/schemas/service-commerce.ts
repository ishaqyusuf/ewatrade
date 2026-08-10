import {
  serviceCommerceChangeReasonSchema,
  serviceCommerceProfileSettingsSchema,
} from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

export const serviceCommerceWorkspaceAccessSchema = z
  .object({ storeId: z.string().trim().min(1).max(191).optional() })
  .strict()

const serviceCommerceProfileCommandFields = {
  expectedRevision: z.number().int().min(0),
  reason: serviceCommerceChangeReasonSchema,
  storeId: z.string().trim().min(1).max(191),
}

export const serviceCommerceProfileUpdateSchema = z
  .object({
    ...serviceCommerceProfileCommandFields,
    settings: serviceCommerceProfileSettingsSchema,
  })
  .strict()

export const serviceCommerceProfileActivationSchema = z
  .object({
    ...serviceCommerceProfileCommandFields,
    active: z.boolean(),
  })
  .strict()
