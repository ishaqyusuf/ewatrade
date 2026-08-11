import { z } from "zod"

export const SERVICE_COMMERCE_QUOTE_RELEASE_MODES = [
  "attendant_can_release",
  "approval_required",
] as const

export const SERVICE_COMMERCE_QUOTE_APPROVAL_LIFECYCLES = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const

const idSchema = z.string().trim().min(1).max(191)

export const serviceCommerceQuoteReleaseModeSchema = z.enum(
  SERVICE_COMMERCE_QUOTE_RELEASE_MODES,
)
export const serviceCommerceQuoteApprovalLifecycleSchema = z.enum(
  SERVICE_COMMERCE_QUOTE_APPROVAL_LIFECYCLES,
)

export const serviceCommerceQuoteReleasePolicySchema = z
  .object({
    mode: serviceCommerceQuoteReleaseModeSchema,
    revision: z.number().int().nonnegative(),
    selectedApproverMembershipIds: z.array(idSchema).max(100),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      policy.mode === "approval_required" &&
      policy.selectedApproverMembershipIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Approval-required release needs at least one selected approver.",
        path: ["selectedApproverMembershipIds"],
      })
    }
    if (
      new Set(policy.selectedApproverMembershipIds).size !==
      policy.selectedApproverMembershipIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selected quotation approvers must be unique.",
        path: ["selectedApproverMembershipIds"],
      })
    }
  })

export const serviceCommerceQuoteApprovalDecisionSchema = z
  .object({
    decidedAt: z.coerce.date().nullable().optional(),
    decidedByMembershipId: idSchema.nullable().optional(),
    id: idSchema,
    lifecycle: serviceCommerceQuoteApprovalLifecycleSchema,
    policyRevision: z.number().int().nonnegative(),
    quoteId: idSchema,
    quoteVersionId: idSchema,
    reason: z.string().trim().min(3).max(500).nullable().optional(),
    requestedAt: z.coerce.date(),
    requesterMembershipId: idSchema,
    sourceId: idSchema,
    sourceKind: z.enum(["commerce_inquiry", "prescription", "service"]),
    storeId: idSchema,
    tenantId: idSchema,
  })
  .strict()

export type ServiceCommerceQuoteApprovalDecision = z.infer<
  typeof serviceCommerceQuoteApprovalDecisionSchema
>
export type ServiceCommerceQuoteApprovalLifecycle = z.infer<
  typeof serviceCommerceQuoteApprovalLifecycleSchema
>
export type ServiceCommerceQuoteReleaseMode = z.infer<
  typeof serviceCommerceQuoteReleaseModeSchema
>
export type ServiceCommerceQuoteReleasePolicy = z.infer<
  typeof serviceCommerceQuoteReleasePolicySchema
>
