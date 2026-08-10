import { z } from "zod"

import { SERVICE_COMMERCE_CAPABILITIES } from "./capability"
import { serviceCommerceChannelOriginSchema } from "./source"

export const SERVICE_COMMERCE_VERTICALS = ["service", "pharmacy"] as const

export const SERVICE_COMMERCE_CATALOG_POLICY_SUBJECTS = [
  "progressive_draft_capture",
  "catalog_publication",
  "procure_to_order",
  "price_promotion",
  "managed_inventory_graduation",
] as const

export const SERVICE_COMMERCE_POLICY_SUBJECTS = [
  ...SERVICE_COMMERCE_CAPABILITIES,
  ...SERVICE_COMMERCE_CATALOG_POLICY_SUBJECTS,
] as const

export const SERVICE_COMMERCE_POLICY_OUTCOMES = [
  "allowed",
  "restricted",
  "pending_evidence",
  "expired_approval",
  "prohibited",
] as const

export const SERVICE_COMMERCE_POLICY_REASONS = [
  "policy_allowed",
  "policy_restricted",
  "pending_evidence",
  "approval_expired",
  "approval_revoked",
  "not_effective",
  "jurisdiction_missing",
  "ambiguous_policy",
  "prohibited_combination",
  "written_approval_required",
] as const

export const serviceCommerceVerticalSchema = z.enum(SERVICE_COMMERCE_VERTICALS)
export const serviceCommercePolicySubjectSchema = z.enum(
  SERVICE_COMMERCE_POLICY_SUBJECTS,
)
export const serviceCommercePolicyOutcomeSchema = z.enum(
  SERVICE_COMMERCE_POLICY_OUTCOMES,
)
export const serviceCommercePolicyReasonSchema = z.enum(
  SERVICE_COMMERCE_POLICY_REASONS,
)

export const serviceCommercePolicyScopeSchema = z
  .object({
    channel: serviceCommerceChannelOriginSchema,
    jurisdictionCode: z.string().trim().length(2).toUpperCase(),
    subject: serviceCommercePolicySubjectSchema,
    vertical: serviceCommerceVerticalSchema,
  })
  .strict()

const serviceCommercePolicyDecisionFieldsSchema =
  serviceCommercePolicyScopeSchema.extend({
    approvalReference: z.string().trim().min(3).max(240).optional(),
    effectiveAt: z.coerce.date(),
    evidenceReference: z.string().trim().min(3).max(240),
    expiresAt: z.coerce.date(),
    expectedRevision: z.number().int().nonnegative(),
    licenceReference: z.string().trim().min(3).max(240).optional(),
    outcome: z.enum([
      "allowed",
      "restricted",
      "pending_evidence",
      "prohibited",
    ]),
    reason: z.string().trim().min(3).max(500),
    storeId: z.string().trim().min(1).max(191),
  })

function validatePolicyDecision(
  value: z.infer<typeof serviceCommercePolicyDecisionFieldsSchema>,
  ctx: z.RefinementCtx,
) {
  if (value.expiresAt <= value.effectiveAt) {
    ctx.addIssue({
      code: "custom",
      message: "Policy expiry must be after its effective date.",
      path: ["expiresAt"],
    })
  }
  if (value.outcome === "allowed" && !value.approvalReference) {
    ctx.addIssue({
      code: "custom",
      message: "Allowed policy decisions require an approval reference.",
      path: ["approvalReference"],
    })
  }
}

export const serviceCommercePolicyDecisionDraftInputSchema =
  serviceCommercePolicyDecisionFieldsSchema.superRefine(validatePolicyDecision)

export const serviceCommercePolicyDecisionInputSchema =
  serviceCommercePolicyDecisionFieldsSchema
    .extend({
      reviewedByUserId: z.string().trim().min(1).max(191),
    })
    .superRefine(validatePolicyDecision)

export type ServiceCommercePolicyOutcome = z.infer<
  typeof serviceCommercePolicyOutcomeSchema
>
export type ServiceCommercePolicyReason = z.infer<
  typeof serviceCommercePolicyReasonSchema
>
export type ServiceCommercePolicySubject = z.infer<
  typeof serviceCommercePolicySubjectSchema
>
export type ServiceCommerceVertical = z.infer<
  typeof serviceCommerceVerticalSchema
>
export type ServiceCommercePolicyDecisionInput = z.infer<
  typeof serviceCommercePolicyDecisionInputSchema
>
