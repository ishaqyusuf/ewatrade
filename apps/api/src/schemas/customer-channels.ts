import {
  serviceCommerceChangeReasonSchema,
  serviceCommerceManualWhatsAppConnectionSchema,
  serviceCommerceStoreBindingConfigurationSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const storeIdSchema = idSchema

export const customerChannelWorkspaceSchema = z
  .object({ storeId: storeIdSchema.optional() })
  .strict()

export const customerChannelManualConnectionSchema =
  serviceCommerceManualWhatsAppConnectionSchema
    .extend({ storeId: storeIdSchema })
    .strict()

export const customerChannelConnectionSchema = z
  .object({ connectionId: idSchema, storeId: storeIdSchema })
  .strict()

export const customerChannelConnectionLifecycleSchema =
  customerChannelConnectionSchema
    .extend({ status: z.enum(["reconnecting", "revoked", "suspended"]) })
    .strict()

export const customerChannelStoreBindingsSchema =
  serviceCommerceStoreBindingConfigurationSchema

export const customerChannelAttendantAssignSchema = z
  .object({
    membershipId: idSchema,
    reason: serviceCommerceChangeReasonSchema,
    storeId: storeIdSchema,
  })
  .strict()

export const customerChannelAttendantRevokeSchema = z
  .object({
    assignmentId: idSchema,
    expectedRevision: z.number().int().min(1),
    reason: serviceCommerceChangeReasonSchema,
    storeId: storeIdSchema,
  })
  .strict()

export const customerChannelEntryPointPublishSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const customerChannelPublicEntryPointSchema = z
  .object({ publicToken: z.string().trim().min(32).max(200) })
  .strict()

export const customerChannelEntryPointRevokeSchema = z
  .object({
    entryPointId: idSchema,
    expectedRevision: z.number().int().min(1),
    reason: serviceCommerceChangeReasonSchema,
    storeId: storeIdSchema,
  })
  .strict()

export const customerChannelEmbeddedSignupSessionSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const customerChannelEmbeddedSignupSelectionSchema =
  customerChannelEmbeddedSignupSessionSchema
    .extend({
      billingOwner: z.string().trim().max(160).optional(),
      phoneNumberId: idSchema,
      testRecipient: z.string().trim().min(7).max(40),
    })
    .strict()
