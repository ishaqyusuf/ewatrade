import type {
  ServiceCommerceQuoteApprovalDecision,
  ServiceCommerceQuoteApprovalLifecycle,
  ServiceCommerceQuoteReleasePolicy,
} from "./schemas"

export const SERVICE_COMMERCE_DEFAULT_QUOTE_RELEASE_MODE =
  "attendant_can_release" as const

const QUOTE_APPROVAL_TRANSITIONS: Record<
  ServiceCommerceQuoteApprovalLifecycle,
  ServiceCommerceQuoteApprovalLifecycle[]
> = {
  approved: [],
  pending: ["approved", "rejected", "superseded"],
  rejected: [],
  superseded: [],
}

export function canTransitionServiceCommerceQuoteApproval(
  current: ServiceCommerceQuoteApprovalLifecycle,
  next: ServiceCommerceQuoteApprovalLifecycle,
) {
  return QUOTE_APPROVAL_TRANSITIONS[current].includes(next)
}

export function getServiceCommerceQuoteApprovalDecisionKey(input: {
  policyRevision: number
  quoteId: string
  quoteVersionId: string
  sourceId: string
  sourceKind: string
  storeId: string
  tenantId: string
}) {
  return [
    input.tenantId,
    input.storeId,
    input.sourceKind,
    input.sourceId,
    input.quoteId,
    input.quoteVersionId,
    input.policyRevision,
  ].join(":")
}

export function resolveServiceCommerceQuoteReleasePolicy(
  policy: ServiceCommerceQuoteReleasePolicy | null,
): ServiceCommerceQuoteReleasePolicy {
  return (
    policy ?? {
      mode: SERVICE_COMMERCE_DEFAULT_QUOTE_RELEASE_MODE,
      revision: 0,
      selectedApproverMembershipIds: [],
    }
  )
}

type QuoteApprovalDecisionReference = Pick<
  ServiceCommerceQuoteApprovalDecision,
  | "id"
  | "lifecycle"
  | "policyRevision"
  | "quoteId"
  | "quoteVersionId"
  | "sourceId"
  | "sourceKind"
  | "storeId"
  | "tenantId"
>

export type ServiceCommerceQuoteReleaseActions = {
  canApprove: boolean
  canPrepare: boolean
  canReject: boolean
  canRelease: boolean
  canRequestApproval: boolean
}

export function deriveServiceCommerceQuoteReleaseActions(input: {
  activeApproverMembershipIds: string[]
  actor: {
    attendantActive: boolean
    membershipId: string
    quoteApproverActive: boolean
  }
  availabilityReady: boolean
  clinicalReleaseReady: boolean
  currentVersionId: string
  decision: QuoteApprovalDecisionReference | null
  expiresAt: Date | null
  now?: Date
  offerOptionsReady: boolean
  policy: ServiceCommerceQuoteReleasePolicy | null
  policyRevision: number
  quoteCreatorMembershipId: string
  quoteId: string
  quoteVersionId: string
  quoteVersionState: "draft" | "issued"
  sourceId: string
  sourceKind: "commerce_inquiry" | "prescription" | "service"
  storeId: string
  tenantId: string
  verticalEligible: boolean
}): ServiceCommerceQuoteReleaseActions {
  const policy = resolveServiceCommerceQuoteReleasePolicy(input.policy)
  const now = input.now ?? new Date()
  const policyMatches = policy.revision === input.policyRevision
  const versionCurrent = input.currentVersionId === input.quoteVersionId
  const versionDraft = input.quoteVersionState === "draft"
  const notExpired = !input.expiresAt || input.expiresAt > now
  const selectedApproverMembershipIds = new Set(
    policy.selectedApproverMembershipIds,
  )
  const activeApprovers = new Set(input.activeApproverMembershipIds)
  const hasActiveSelectedApprover = [...selectedApproverMembershipIds].some(
    (membershipId) => activeApprovers.has(membershipId),
  )
  const actorIsActiveSelectedApprover =
    input.actor.quoteApproverActive &&
    selectedApproverMembershipIds.has(input.actor.membershipId) &&
    activeApprovers.has(input.actor.membershipId)
  const approvalModeReady =
    policy.mode === "attendant_can_release" || hasActiveSelectedApprover
  const preparationEligible =
    input.actor.attendantActive &&
    input.verticalEligible &&
    policyMatches &&
    approvalModeReady
  const releasableVersion =
    versionCurrent &&
    versionDraft &&
    policyMatches &&
    notExpired &&
    input.verticalEligible &&
    input.offerOptionsReady &&
    input.availabilityReady
  const decisionMatches =
    input.decision?.lifecycle === "pending" &&
    input.decision.tenantId === input.tenantId &&
    input.decision.storeId === input.storeId &&
    input.decision.quoteId === input.quoteId &&
    input.decision.quoteVersionId === input.quoteVersionId &&
    input.decision.sourceId === input.sourceId &&
    input.decision.sourceKind === input.sourceKind &&
    input.decision.policyRevision === input.policyRevision
  const actorIsCreator =
    input.actor.membershipId === input.quoteCreatorMembershipId
  const canApprove =
    policy.mode === "approval_required" &&
    Boolean(decisionMatches) &&
    actorIsActiveSelectedApprover &&
    !actorIsCreator &&
    releasableVersion &&
    input.clinicalReleaseReady
  const canReject =
    policy.mode === "approval_required" &&
    Boolean(decisionMatches) &&
    actorIsActiveSelectedApprover &&
    !actorIsCreator &&
    versionCurrent &&
    versionDraft &&
    policyMatches &&
    notExpired &&
    input.verticalEligible
  const canRequestApproval =
    policy.mode === "approval_required" &&
    preparationEligible &&
    releasableVersion &&
    !input.decision
  const canRelease =
    policy.mode === "attendant_can_release"
      ? preparationEligible && releasableVersion && input.clinicalReleaseReady
      : canApprove

  return {
    canApprove,
    canPrepare: preparationEligible,
    canReject,
    canRelease,
    canRequestApproval,
  }
}
