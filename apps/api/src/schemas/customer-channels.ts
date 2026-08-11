import {
  serviceCommerceChangeReasonSchema,
  serviceCommerceManualWhatsAppConnectionSchema,
  serviceCommerceQuoteReleaseModeSchema,
  serviceCommerceStoreBindingConfigurationSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

const idSchema = z.string().trim().min(1).max(191)
const storeIdSchema = idSchema
const stableClientIdSchema = z.string().trim().min(8).max(160)

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

export const customerChannelQuoteReleaseSettingsSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const customerChannelQuoteReleaseSettingsUpdateSchema = z
  .object({
    clientOperationId: stableClientIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    mode: serviceCommerceQuoteReleaseModeSchema,
    reason: serviceCommerceChangeReasonSchema,
    selectedApproverMembershipIds: z.array(idSchema).max(100),
    storeId: storeIdSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.mode === "approval_required" &&
      input.selectedApproverMembershipIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one quotation approver.",
        path: ["selectedApproverMembershipIds"],
      })
    }
    if (
      new Set(input.selectedApproverMembershipIds).size !==
      input.selectedApproverMembershipIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selected quotation approvers must be unique.",
        path: ["selectedApproverMembershipIds"],
      })
    }
  })

export const customerChannelPendingQuoteApprovalsSchema = z
  .object({ storeId: storeIdSchema })
  .strict()

export const customerChannelQuoteApprovalDetailSchema = z
  .object({ approvalId: idSchema, storeId: storeIdSchema })
  .strict()

export const customerChannelQuoteApprovalDecisionSchema = z
  .object({
    approvalId: idSchema,
    clientDecisionId: stableClientIdSchema,
    expectedPolicyRevision: z.number().int().positive(),
    quoteId: idSchema,
    quoteVersionId: idSchema,
    reason: serviceCommerceChangeReasonSchema,
    storeId: storeIdSchema,
  })
  .strict()
