import type {
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicyReason,
  ServiceCommercePolicySubject,
  ServiceCommerceVertical,
} from "./schemas/policy"
import type { ServiceCommerceChannelOrigin } from "./schemas/source"
export {
  SERVICE_COMMERCE_CATALOG_POLICY_SUBJECTS,
  SERVICE_COMMERCE_POLICY_OUTCOMES,
  SERVICE_COMMERCE_POLICY_REASONS,
  SERVICE_COMMERCE_POLICY_SUBJECTS,
  SERVICE_COMMERCE_VERTICALS,
} from "./schemas/policy"

export type ServiceCommercePolicyFact = {
  approvalReferencePresent: boolean
  channel: ServiceCommerceChannelOrigin
  effectiveAt: Date
  evidenceReferencePresent: boolean
  expiresAt: Date
  jurisdictionCode: string
  outcome: Exclude<ServiceCommercePolicyOutcome, "expired_approval">
  revision: number
  revokedAt: Date | null
  subject: ServiceCommercePolicySubject
  vertical: ServiceCommerceVertical
}

export type ServiceCommercePolicyEvaluation = {
  outcome: ServiceCommercePolicyOutcome
  policyRevision: number | null
  reason: ServiceCommercePolicyReason
  validUntil: Date | null
}

function evaluation(
  outcome: ServiceCommercePolicyOutcome,
  reason: ServiceCommercePolicyReason,
  fact?: ServiceCommercePolicyFact,
): ServiceCommercePolicyEvaluation {
  return {
    outcome,
    policyRevision: fact?.revision ?? null,
    reason,
    validUntil: fact?.expiresAt ?? null,
  }
}

export function evaluateServiceCommercePolicyFacts(input: {
  channel: ServiceCommerceChannelOrigin
  facts: ServiceCommercePolicyFact[]
  jurisdictionCode: string | null
  now?: Date
  subject: ServiceCommercePolicySubject
  vertical: ServiceCommerceVertical
}): ServiceCommercePolicyEvaluation {
  const jurisdictionCode = input.jurisdictionCode?.trim().toUpperCase() ?? ""
  if (jurisdictionCode.length !== 2) {
    return evaluation("pending_evidence", "jurisdiction_missing")
  }

  const matching = input.facts.filter(
    (fact) =>
      fact.channel === input.channel &&
      fact.jurisdictionCode.toUpperCase() === jurisdictionCode &&
      fact.subject === input.subject &&
      fact.vertical === input.vertical,
  )
  const prohibitedByDefault =
    jurisdictionCode === "NG" &&
    input.vertical === "pharmacy" &&
    input.channel === "whatsapp"
  if (matching.length === 0) {
    return prohibitedByDefault
      ? evaluation("prohibited", "prohibited_combination")
      : evaluation("pending_evidence", "pending_evidence")
  }
  if (matching.length !== 1) {
    return evaluation("restricted", "ambiguous_policy")
  }

  const fact = matching[0]
  if (!fact) return evaluation("restricted", "ambiguous_policy")
  if (fact.revokedAt) {
    return evaluation("restricted", "approval_revoked", fact)
  }
  const now = input.now ?? new Date()
  if (fact.effectiveAt > now) {
    return evaluation("pending_evidence", "not_effective", fact)
  }
  if (fact.expiresAt <= now) {
    return evaluation("expired_approval", "approval_expired", fact)
  }
  if (!fact.evidenceReferencePresent) {
    return evaluation("pending_evidence", "pending_evidence", fact)
  }
  if (
    prohibitedByDefault &&
    (fact.outcome !== "allowed" || !fact.approvalReferencePresent)
  ) {
    return evaluation("prohibited", "written_approval_required", fact)
  }
  if (fact.outcome === "allowed" && !fact.approvalReferencePresent) {
    return evaluation("pending_evidence", "pending_evidence", fact)
  }
  if (fact.outcome === "allowed") {
    return evaluation("allowed", "policy_allowed", fact)
  }
  if (fact.outcome === "prohibited") {
    return evaluation("prohibited", "prohibited_combination", fact)
  }
  if (fact.outcome === "pending_evidence") {
    return evaluation("pending_evidence", "pending_evidence", fact)
  }
  return evaluation("restricted", "policy_restricted", fact)
}
