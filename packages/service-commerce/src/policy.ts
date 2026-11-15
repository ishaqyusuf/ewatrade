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

/**
 * Ordinary services (laundry, cleaning, repairs) may take online requests,
 * quotes, preferred times and tracking without a written decision. Regulated
 * verticals and WhatsApp stay fail closed until a decision allows them.
 */
const SERVICE_DEFAULT_ALLOWED = new Set<string>([
  "staff:staff",
  "web:web",
  "staff:web",
  "staff:quote",
  "web:intake",
  "web:booking",
  "web:quote",
  "web:service_completion",
])

function isServiceDefaultAllowed(input: {
  channel: ServiceCommerceChannelOrigin
  subject: ServiceCommercePolicySubject
  vertical: ServiceCommerceVertical
}) {
  return (
    input.vertical === "service" &&
    SERVICE_DEFAULT_ALLOWED.has(`${input.channel}:${input.subject}`)
  )
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
  const defaultAllowed = isServiceDefaultAllowed(input)
  if (matching.length === 0) {
    if (prohibitedByDefault) {
      return evaluation("prohibited", "prohibited_combination")
    }
    return defaultAllowed
      ? evaluation("allowed", "service_default_allowed")
      : evaluation("pending_evidence", "pending_evidence")
  }
  if (matching.length !== 1) {
    return evaluation("restricted", "ambiguous_policy")
  }

  const fact = matching[0]
  if (!fact) return evaluation("restricted", "ambiguous_policy")
  const now = input.now ?? new Date()
  if (defaultAllowed) {
    // Only a current restriction overrides the default; a lapsed, revoked or
    // incomplete allowance falls back to it.
    const current =
      !fact.revokedAt && fact.effectiveAt <= now && fact.expiresAt > now
    if (!current || fact.outcome === "allowed") {
      return current &&
        fact.evidenceReferencePresent &&
        fact.approvalReferencePresent
        ? evaluation("allowed", "policy_allowed", fact)
        : evaluation("allowed", "service_default_allowed")
    }
  }
  if (fact.revokedAt) {
    return evaluation("restricted", "approval_revoked", fact)
  }
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
