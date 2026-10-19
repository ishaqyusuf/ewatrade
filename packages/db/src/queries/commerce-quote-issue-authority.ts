import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import { getServiceCommerceWorkspaceAccessReadOnly } from "./service-commerce-access"
import { evaluateServiceCommercePolicyBatchReadOnlyInTransaction } from "./service-commerce-policy"
import { resolveQuoteReleaseRuntimeFacts } from "./service-commerce-quote-release"
import { readStaffStoreAccess } from "./staff-store-access"

export class CommerceQuoteIssueAuthorityError extends Error {
  readonly code = "FORBIDDEN"
  constructor(message: string) {
    super(message)
    this.name = "CommerceQuoteIssueAuthorityError"
  }
}

export type CommerceQuoteIssueAuthorityInput = {
  actorUserId: string
  tenantId: string
  storeId: string
  sourceType: "service_request" | "commerce_inquiry"
  vertical: "SERVICE"
}
type Publication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>

function refuse(
  message = "Current quotation authority is unavailable.",
): never {
  throw new CommerceQuoteIssueAuthorityError(message)
}
function positiveRevision(value: number) {
  return Number.isSafeInteger(value) && value > 0
}
function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime())
}
function publicationSnapshot(value: Publication | null) {
  if (value === null) return null
  if (
    typeof value.version !== "string" ||
    !value.version.trim() ||
    !/^[a-f0-9]{64}$/.test(value.documentHash) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate) ||
    !Number.isFinite(Date.parse(`${value.effectiveDate}T00:00:00Z`)) ||
    new Date(`${value.effectiveDate}T00:00:00Z`).toISOString().slice(0, 10) !==
      value.effectiveDate
  )
    refuse("The current quotation Terms publication is unavailable.")
  return {
    version: value.version,
    documentHash: value.documentHash,
    effectiveDate: value.effectiveDate,
  }
}

async function readAuthorityBase(
  tx: Prisma.TransactionClient,
  scope: CommerceQuoteIssueAuthorityInput,
) {
  if (
    scope.vertical !== "SERVICE" ||
    !["service_request", "commerce_inquiry"].includes(scope.sourceType) ||
    [scope.actorUserId, scope.tenantId, scope.storeId].some(
      (id) =>
        typeof id !== "string" ||
        !id.trim() ||
        id !== id.trim() ||
        id.length > 128,
    )
  )
    refuse("Choose an exact nonclinical quotation scope.")

  const tenant = await tx.tenant.findFirst({
    where: { id: scope.tenantId, isActive: true },
    select: { id: true, isActive: true },
  })
  if (!tenant || tenant.id !== scope.tenantId || tenant.isActive !== true)
    refuse()
  const store = await tx.store.findFirst({
    where: { id: scope.storeId, tenantId: scope.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      status: true,
      currencyCode: true,
      countryCode: true,
    },
  })
  if (
    !store ||
    store.id !== scope.storeId ||
    store.tenantId !== scope.tenantId ||
    store.status !== "ACTIVE" ||
    !/^[A-Z]{3}$/.test(store.currencyCode)
  )
    refuse()
  const membership = await tx.membership.findFirst({
    where: {
      userId: scope.actorUserId,
      tenantId: scope.tenantId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      role: true,
      status: true,
    },
  })
  if (
    !membership ||
    membership.userId !== scope.actorUserId ||
    membership.tenantId !== scope.tenantId ||
    membership.status !== "ACTIVE"
  )
    refuse()
  const access = await readStaffStoreAccess(tx, membership.id, scope.tenantId)
  if (
    !access ||
    access.status !== "ACTIVE" ||
    access.role !== membership.role ||
    !positiveRevision(access.staffAccessRevision) ||
    !["LEGACY", "SCOPED"].includes(access.staffAccessMode)
  )
    refuse()
  const administrator = ["OWNER", "ADMIN"].includes(access.role)
  const operatorRoles =
    scope.sourceType === "service_request"
      ? ["MANAGER"]
      : ["MANAGER", "CASHIER", "OPERATOR"]
  if (
    !administrator &&
    (!operatorRoles.includes(access.role) ||
      access.staffAccessMode !== "LEGACY")
  )
    refuse("This scoped role has no supported quotation grant for this source.")
  const assignments = access.staffStoreAssignments
    .map((assignment) => {
      if (
        assignment.status !== "ACTIVE" ||
        !positiveRevision(assignment.revision) ||
        !["CASHIER", "OPERATOR", "MANAGER"].includes(assignment.role)
      )
        refuse()
      return {
        storeId: assignment.storeId,
        role: assignment.role,
        status: assignment.status,
        revision: assignment.revision,
      }
    })
    .sort((a, b) => a.storeId.localeCompare(b.storeId))
  if (
    new Set(assignments.map((row) => row.storeId)).size !== assignments.length
  )
    refuse()

  return {
    membership,
    actor: {
      userId: scope.actorUserId,
      membershipId: membership.id,
      role: access.role,
      status: access.status,
      accessMode: access.staffAccessMode,
      accessRevision: access.staffAccessRevision,
      catalogEditor: access.catalogEditor,
      defaultStoreId: access.retailOpsStaffProfile?.defaultStoreId ?? null,
      assignments,
    },
    store: {
      id: store.id,
      tenantId: store.tenantId,
      status: store.status,
      currencyCode: store.currencyCode,
      countryCode: store.countryCode,
    },
  }
}

/**
 * Current source-specific read/recovery ceiling only. No new issuance readiness,
 * policy, attendant/alternate-approver or Terms requirement. The caller still
 * validates the exact owned saved result and current GENERAL/session authority.
 */
export async function readCommerceQuoteIssueRecoveryAuthorityInTransaction(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueAuthorityInput,
) {
  const scope = { ...input }
  const { actor, store } = await readAuthorityBase(tx, scope)
  return { actor, store }
}

/** Caller owns one consistent transaction. No locks, audit, screening or write. */
export async function readCommerceQuoteIssueAuthorityInTransaction(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueAuthorityInput,
  publication: Publication | null = currentEffectiveLegalPublication(),
) {
  // Both publication identities and server scope are copied before the first await.
  const scope = { ...input }
  const quotePublication = publicationSnapshot(publication)
  const linkedPublication = publicationSnapshot(
    currentEffectiveLegalPublication(),
  )
  const { membership, actor, store } = await readAuthorityBase(tx, scope)

  const workspace = await getServiceCommerceWorkspaceAccessReadOnly(tx, scope)
  // Inquiry native commands require an active assisted workspace. Service native
  // commands have a different ceiling; do not import Inquiry-only setup gates.
  if (
    workspace.store.id !== scope.storeId ||
    workspace.store.status !== "active" ||
    (scope.sourceType === "commerce_inquiry" &&
      (!workspace.access.canOperate ||
        workspace.configuration.status !== "active" ||
        !workspace.canCreateAssistedRequest))
  )
    refuse()
  const decisions = await tx.serviceCommercePolicyDecision.findMany({
    where: { storeId: scope.storeId, tenantId: scope.tenantId },
  })
  if (
    decisions.some(
      (row) =>
        row.storeId !== scope.storeId ||
        row.tenantId !== scope.tenantId ||
        !positiveRevision(row.revision) ||
        !validDate(row.effectiveAt) ||
        !validDate(row.expiresAt) ||
        (row.revokedAt !== null && !validDate(row.revokedAt)),
    )
  )
    refuse()
  const [evaluation] =
    await evaluateServiceCommercePolicyBatchReadOnlyInTransaction(tx, {
      ...scope,
      purpose: "assistant_quote_issue_review",
      scopes: [{ channel: "staff", subject: "quote", vertical: "service" }],
      preloaded: { countryCode: store.countryCode, decisions },
    })
  if (!evaluation || evaluation.outcome !== "allowed")
    refuse("Current quotation policy does not allow this source.")
  // Include all workspace policy revisions, including unchanged outcomes, without
  // exposing licence/evidence/approval references or private reviewer notes.
  const policyFacts = decisions
    .map((row) => ({
      id: row.id,
      channel: row.channel,
      subject: row.subject,
      vertical: row.vertical,
      jurisdictionCode: row.jurisdictionCode,
      outcome: row.outcome,
      revision: row.revision,
      effectiveAt: row.effectiveAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const runtime = await resolveQuoteReleaseRuntimeFacts(tx, scope)
  if (
    runtime.actor.membershipId !== membership.id ||
    !runtime.actor.attendantActive ||
    (runtime.compatibilityDefault
      ? runtime.policy.revision !== 0
      : !positiveRevision(runtime.policy.revision))
  )
    refuse("An active quotation attendant assignment is required.")
  const activeApproverMembershipIds = [
    ...new Set(runtime.activeApproverMembershipIds),
  ].sort()
  const selectedApproverMembershipIds = [
    ...new Set(runtime.policy.selectedApproverMembershipIds),
  ].sort()
  const viableAlternateApproverMembershipIds =
    activeApproverMembershipIds.filter(
      (id) =>
        id !== membership.id && selectedApproverMembershipIds.includes(id),
    )
  const immediate = runtime.policy.mode === "attendant_can_release"
  if (!immediate && viableAlternateApproverMembershipIds.length === 0)
    refuse("Another selected active quotation approver is required.")

  async function acceptanceFor(terms: Publication | null) {
    if (!terms) return null
    const row = await tx.legalAcceptance.findUnique({
      where: {
        userId_version: { userId: scope.actorUserId, version: terms.version },
      },
      select: { documentHash: true, acceptedAt: true },
    })
    if (
      row &&
      (!validDate(row.acceptedAt) || !/^[a-f0-9]{64}$/.test(row.documentHash))
    )
      refuse("Current Terms acceptance facts are unavailable.")
    return row
      ? {
          version: terms.version,
          documentHash: row.documentHash,
          acceptedAt: row.acceptedAt,
        }
      : null
  }
  const acceptance = await acceptanceFor(quotePublication)
  const samePublication =
    JSON.stringify(quotePublication) === JSON.stringify(linkedPublication)
  const linkedAcceptance = samePublication
    ? acceptance
    : await acceptanceFor(linkedPublication)
  if (
    immediate &&
    (!quotePublication ||
      acceptance?.documentHash !== quotePublication.documentHash ||
      !linkedPublication ||
      linkedAcceptance?.documentHash !== linkedPublication.documentHash)
  )
    refuse(
      "Accept the current quotation and conversation Terms before immediate release.",
    )

  return {
    actor,
    store,
    workspace,
    policy: { evaluation, decisions: policyFacts },
    release: {
      ...runtime,
      activeApproverMembershipIds,
      policy: { ...runtime.policy, selectedApproverMembershipIds },
      viableAlternateApproverMembershipIds,
    },
    legal: {
      requiredForImmediateRelease: immediate,
      publication: quotePublication,
      acceptance,
      linkedPublication,
      linkedAcceptance,
    },
  }
}
